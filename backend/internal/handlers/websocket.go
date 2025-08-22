package handlers

import (
	"encoding/json"
	"log"
	"net/http"
	"sync"

	"github.com/gin-gonic/gin"
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

// MessageType defines the type of WebSocket message
type MessageType string

const (
	PriceUpdate      MessageType = "price_update"
	ConnectionStatus MessageType = "connection_status"
	Error           MessageType = "error"
)

// WebSocketMessage represents a WebSocket message
type WebSocketMessage struct {
	Type MessageType `json:"type"`
	Data interface{} `json:"data"`
}

// PriceUpdateData represents price update message data
type PriceUpdateData struct {
	Symbol    string  `json:"symbol"`
	Price     float64 `json:"price"`
	Timestamp int64   `json:"timestamp"`
}

// ConnectionStatusData represents connection status message data
type ConnectionStatusData struct {
	Status    string `json:"status"`
	Message   string `json:"message"`
	Timestamp int64  `json:"timestamp"`
}

// Client represents a WebSocket client
type Client struct {
	Conn   *websocket.Conn
	Send   chan []byte
	Hub    *Hub
	ID     string
}

// Hub maintains active clients and broadcasts messages
type Hub struct {
	clients    map[*Client]bool
	broadcast  chan []byte
	register   chan *Client
	unregister chan *Client
	mutex      sync.RWMutex
}

// NewHub creates a new Hub
func NewHub() *Hub {
	return &Hub{
		clients:    make(map[*Client]bool),
		broadcast:  make(chan []byte),
		register:   make(chan *Client),
		unregister: make(chan *Client),
	}
}

// Run starts the hub
func (h *Hub) Run() {
	for {
		select {
		case client := <-h.register:
			h.mutex.Lock()
			h.clients[client] = true
			h.mutex.Unlock()
			log.Printf("Client %s connected. Total clients: %d", client.ID, len(h.clients))
			
			// Send connection status message
			statusMsg := WebSocketMessage{
				Type: ConnectionStatus,
				Data: ConnectionStatusData{
					Status:    "connected",
					Message:   "Successfully connected to WebSocket",
					Timestamp: GetCurrentTimestamp(),
				},
			}
			if data, err := json.Marshal(statusMsg); err == nil {
				select {
				case client.Send <- data:
				default:
					close(client.Send)
					h.mutex.Lock()
					delete(h.clients, client)
					h.mutex.Unlock()
				}
			}

		case client := <-h.unregister:
			h.mutex.Lock()
			if _, ok := h.clients[client]; ok {
				delete(h.clients, client)
				close(client.Send)
				log.Printf("Client %s disconnected. Total clients: %d", client.ID, len(h.clients))
			}
			h.mutex.Unlock()

		case message := <-h.broadcast:
			h.mutex.RLock()
			for client := range h.clients {
				select {
				case client.Send <- message:
				default:
					close(client.Send)
					delete(h.clients, client)
				}
			}
			h.mutex.RUnlock()
		}
	}
}

// BroadcastMessage broadcasts a message to all connected clients
func (h *Hub) BroadcastMessage(msgType MessageType, data interface{}) {
	message := WebSocketMessage{
		Type: msgType,
		Data: data,
	}
	
	jsonData, err := json.Marshal(message)
	if err != nil {
		log.Printf("Error marshaling WebSocket message: %v", err)
		return
	}
	
	h.broadcast <- jsonData
}

// BroadcastMessageString broadcasts a message with string message type (for services)
func (h *Hub) BroadcastMessageString(msgType string, data interface{}) {
	h.BroadcastMessage(MessageType(msgType), data)
}

// GetClientCount returns the number of connected clients
func (h *Hub) GetClientCount() int {
	h.mutex.RLock()
	defer h.mutex.RUnlock()
	return len(h.clients)
}

// WebSocketHandler handles WebSocket connections
type WebSocketHandler struct {
	hub *Hub
}

// NewWebSocketHandler creates a new WebSocket handler
func NewWebSocketHandler() *WebSocketHandler {
	hub := NewHub()
	go hub.Run()
	
	return &WebSocketHandler{
		hub: hub,
	}
}

// HandleWebSocket upgrades HTTP connection to WebSocket and manages client
func (wh *WebSocketHandler) HandleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to upgrade connection"})
		return
	}
	
	// Generate client ID
	clientID := generateClientID()
	
	client := &Client{
		Conn: conn,
		Send: make(chan []byte, 256),
		Hub:  wh.hub,
		ID:   clientID,
	}
	
	// Register client
	wh.hub.register <- client
	
	// Start goroutines for reading and writing
	go client.writePump()
	go client.readPump()
}

// GetHub returns the WebSocket hub for broadcasting messages
func (wh *WebSocketHandler) GetHub() *Hub {
	return wh.hub
}

// TestBroadcast sends a test message to all connected clients
func (wh *WebSocketHandler) TestBroadcast(c *gin.Context) {
	testData := PriceUpdateData{
		Symbol:    "BTCUSDT",
		Price:     50000.00,
		Timestamp: GetCurrentTimestamp(),
	}
	
	wh.hub.BroadcastMessage(PriceUpdate, testData)
	
	c.JSON(200, gin.H{
		"message": "Test message broadcasted",
		"clients": wh.hub.GetClientCount(),
		"data":    testData,
	})
}

// readPump handles reading messages from the WebSocket connection
func (c *Client) readPump() {
	defer func() {
		c.Hub.unregister <- c
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
		
		// Handle incoming messages (ping, etc.)
		log.Printf("Received message from client %s: %s", c.ID, string(message))
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