package websocket

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/gorilla/websocket"
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

// Client represents a WebSocket client
type Client struct {
	Conn              *websocket.Conn
	Send              chan []byte
	Hub               *Hub
	ID                string
	SimulationHandler SimulationEventHandler
	OrderHandler      OrderEventHandler
}

// SimulationEventHandler interface for handling simulation events
type SimulationEventHandler interface {
	HandleMessage(client *Client, message WebSocketMessage) error
}

// OrderEventHandler interface for handling order events  
type OrderEventHandler interface {
	HandleMessage(client *Client, message WebSocketMessage) error
}

// NewClient creates a new WebSocket client
func NewClient(conn *websocket.Conn, hub *Hub, simHandler SimulationEventHandler, orderHandler OrderEventHandler) *Client {
	return &Client{
		Conn:              conn,
		Send:              make(chan []byte, 256),
		Hub:               hub,
		ID:                generateClientID(),
		SimulationHandler: simHandler,
		OrderHandler:      orderHandler,
	}
}

// readPump handles reading messages from the WebSocket connection
func (c *Client) readPump() {
	defer func() {
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