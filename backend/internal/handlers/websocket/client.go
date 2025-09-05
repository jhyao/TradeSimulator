package websocket

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
	simulationEngine "tradesimulator/internal/engines/simulation"
	"tradesimulator/internal/engines/trading"
)

// WebSocket upgrader with CORS settings
var upgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins for development
		return true
	},
}

// Client represents a WebSocket client with its own engines
type Client struct {
	Conn              *websocket.Conn
	Send              chan []byte
	Hub               *Hub
	ID                string
	SimulationHandler SimulationEventHandler
	OrderHandler      OrderEventHandler
	
	// Session-specific engines
	SimulationEngine *simulationEngine.SimulationEngine
	OrderEngine      trading.OrderExecutionEngineInterface
}

// SimulationEventHandler interface for handling simulation events
type SimulationEventHandler interface {
	HandleMessage(client *Client, message WebSocketMessage) error
}

// OrderEventHandler interface for handling order events  
type OrderEventHandler interface {
	HandleMessage(client *Client, message WebSocketMessage) error
}

// NewClient creates a new WebSocket client with its own engine instances
func NewClient(conn *websocket.Conn, hub *Hub, simHandler SimulationEventHandler, orderHandler OrderEventHandler, simEngine *simulationEngine.SimulationEngine, orderEngine trading.OrderExecutionEngineInterface) *Client {
	return &Client{
		Conn:              conn,
		Send:              make(chan []byte, 256),
		Hub:               hub,
		ID:                generateClientID(),
		SimulationHandler: simHandler,
		OrderHandler:      orderHandler,
		SimulationEngine:  simEngine,
		OrderEngine:       orderEngine,
	}
}

// readPump handles reading messages from the WebSocket connection
func (c *Client) readPump() {
	defer func() {
		c.cleanup()
		c.Hub.UnregisterClient(c)
		c.Conn.Close()
	}()
	
	// Set read deadline and pong handler for keep-alive
	c.Conn.SetReadLimit(512)
	c.Conn.SetPongHandler(func(string) error {
		return nil
	})
	
	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				log.Printf("WebSocket error for client %s: %v", c.ID, err)
			}
			break
		}
		
		// Handle incoming messages
		log.Printf("Received message from client %s: %s", c.ID, string(message))
		c.handleMessage(message)
	}
}

// writePump handles writing messages to the WebSocket connection
func (c *Client) writePump() {
	defer c.Conn.Close()
	
	for message := range c.Send {
		if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
			log.Printf("WebSocket write error for client %s: %v", c.ID, err)
			return
		}
	}
	c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
}

// Start starts the client's read and write pumps
func (c *Client) Start() {
	go c.writePump()
	go c.readPump()
}

// handleMessage routes messages to appropriate handlers based on message type
func (c *Client) handleMessage(messageBytes []byte) {
	var message WebSocketMessage
	if err := json.Unmarshal(messageBytes, &message); err != nil {
		log.Printf("Error parsing message from client %s: %v", c.ID, err)
		c.SendError("Invalid message format", err.Error())
		return
	}

	// Route message based on type
	switch message.Type {
	case SimulationStart, SimulationStop, SimulationPause, SimulationResume, 
		 SimulationSetSpeed, SimulationSetTimeframe, SimulationGetStatus:
		if c.SimulationHandler != nil {
			if err := c.SimulationHandler.HandleMessage(c, message); err != nil {
				log.Printf("Simulation handler error for client %s: %v", c.ID, err)
			}
		} else {
			c.SendError("Simulation handler not available", "Internal error")
		}

	case OrderPlace, OrderCancel:
		if c.OrderHandler != nil {
			if err := c.OrderHandler.HandleMessage(c, message); err != nil {
				log.Printf("Order handler error for client %s: %v", c.ID, err)
			}
		} else {
			c.SendError("Order handler not available", "Internal error")
		}

	default:
		log.Printf("Unknown message type from client %s: %s", c.ID, message.Type)
		c.SendError("Unknown message type", string(message.Type))
	}
}

// SendError sends an error response to the client
func (c *Client) SendError(message, errorMsg string) {
	response := map[string]interface{}{
		"success": false,
		"message": message,
		"error":   errorMsg,
	}

	responseMessage := WebSocketMessage{
		Type: Error,
		Data: response,
	}

	c.SendMessage(responseMessage)
}

// SendMessage sends a WebSocket message to the client
func (c *Client) SendMessage(message WebSocketMessage) {
	data, err := json.Marshal(message)
	if err != nil {
		log.Printf("Error marshaling message for client %s: %v", c.ID, err)
		return
	}

	select {
	case c.Send <- data:
	default:
		log.Printf("Client %s send channel full, dropping message", c.ID)
	}
}

// cleanup handles cleanup of session-specific engines when client disconnects
func (c *Client) cleanup() {
	log.Printf("Cleaning up engines for client %s", c.ID)
	
	// Stop and cleanup simulation engine
	if c.SimulationEngine != nil {
		if err := c.SimulationEngine.Stop(); err != nil {
			log.Printf("Error stopping simulation engine for client %s: %v", c.ID, err)
		}
		c.SimulationEngine.Cleanup()
		c.SimulationEngine = nil
		log.Printf("Simulation engine cleaned up for client %s", c.ID)
	}
	
	// Order execution engine doesn't need cleanup as it's stateless
	c.OrderEngine = nil
	
	log.Printf("Engine cleanup completed for client %s", c.ID)
}

// ClientMessageAdapter adapts Client to implement ClientMessageSender
type ClientMessageAdapter struct {
	client *Client
}

// SendMessage implements ClientMessageSender interface
func (cma *ClientMessageAdapter) SendMessage(messageType string, data interface{}) {
	message := WebSocketMessage{
		Type: MessageType(messageType),
		Data: data,
	}
	cma.client.SendMessage(message)
}

// NewClientMessageAdapter creates a new adapter for the client
func NewClientMessageAdapter(client *Client) *ClientMessageAdapter {
	return &ClientMessageAdapter{client: client}
}