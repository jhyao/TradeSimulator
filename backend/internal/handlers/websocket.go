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
	// Simulation control messages
	SimulationStart     MessageType = "simulation_control_start"
	SimulationStop      MessageType = "simulation_control_stop"
	SimulationPause     MessageType = "simulation_control_pause"
	SimulationResume    MessageType = "simulation_control_resume"
	SimulationSetSpeed  MessageType = "simulation_control_set_speed"
	SimulationSetTimeframe MessageType = "simulation_control_set_timeframe"
	SimulationGetStatus MessageType = "simulation_control_get_status"
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

// Simulation control message structures
type SimulationStartData struct {
	Symbol    string `json:"symbol"`
	StartTime int64  `json:"startTime"`
	Interval  string `json:"interval"`
	Speed     int    `json:"speed"`
}

type SimulationSetSpeedData struct {
	Speed int `json:"speed"`
}

type SimulationSetTimeframeData struct {
	Timeframe string `json:"timeframe"`
}

type SimulationControlResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// Client represents a WebSocket client
type Client struct {
	Conn   *websocket.Conn
	Send   chan []byte
	Hub    *Hub
	ID     string
	SimulationHandler *SimulationHandler // Reference to handle simulation control messages
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
	simulationHandler *SimulationHandler
}

// NewWebSocketHandler creates a new WebSocket handler
func NewWebSocketHandler() *WebSocketHandler {
	hub := NewHub()
	go hub.Run()
	
	return &WebSocketHandler{
		hub: hub,
	}
}

// SetSimulationHandler sets the simulation handler reference for message processing
func (wh *WebSocketHandler) SetSimulationHandler(sh *SimulationHandler) {
	wh.simulationHandler = sh
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
		SimulationHandler: wh.simulationHandler,
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
		
		// Handle incoming messages
		log.Printf("Received message from client %s: %s", c.ID, string(message))
		c.handleControlMessage(message)
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

// handleControlMessage processes incoming simulation control messages
func (c *Client) handleControlMessage(messageBytes []byte) {
	var message WebSocketMessage
	if err := json.Unmarshal(messageBytes, &message); err != nil {
		log.Printf("Error parsing control message from client %s: %v", c.ID, err)
		c.sendResponse(false, "Invalid message format", nil, err.Error())
		return
	}

	if c.SimulationHandler == nil {
		log.Printf("No simulation handler available for client %s", c.ID)
		c.sendResponse(false, "Simulation handler not available", nil, "Internal error")
		return
	}

	switch MessageType(message.Type) {
	case SimulationStart:
		c.handleStartSimulation(message.Data)
	case SimulationStop:
		c.handleStopSimulation()
	case SimulationPause:
		c.handlePauseSimulation()
	case SimulationResume:
		c.handleResumeSimulation()
	case SimulationSetSpeed:
		c.handleSetSpeed(message.Data)
	case SimulationSetTimeframe:
		c.handleSetTimeframe(message.Data)
	case SimulationGetStatus:
		c.handleGetStatus()
	default:
		log.Printf("Unknown control message type from client %s: %s", c.ID, message.Type)
	}
}

// sendResponse sends a control response back to the client
func (c *Client) sendResponse(success bool, message string, data interface{}, errorMsg string) {
	response := SimulationControlResponse{
		Success: success,
		Message: message,
		Data:    data,
		Error:   errorMsg,
	}

	responseMsgType := "simulation_control_response"
	if !success {
		responseMsgType = "simulation_control_error"
	}

	responseMessage := WebSocketMessage{
		Type: MessageType(responseMsgType),
		Data: response,
	}

	responseData, err := json.Marshal(responseMessage)
	if err != nil {
		log.Printf("Error marshaling control response for client %s: %v", c.ID, err)
		return
	}

	select {
	case c.Send <- responseData:
	default:
		log.Printf("Client %s send channel full, dropping response", c.ID)
	}
}

// Simulation control handlers
func (c *Client) handleStartSimulation(data interface{}) {
	dataBytes, _ := json.Marshal(data)
	var startData SimulationStartData
	if err := json.Unmarshal(dataBytes, &startData); err != nil {
		c.sendResponse(false, "Invalid start simulation data", nil, err.Error())
		return
	}

	if err := c.SimulationHandler.engine.Start(startData.Symbol, startData.Interval, startData.StartTime, startData.Speed); err != nil {
		c.sendResponse(false, "Failed to start simulation", nil, err.Error())
		return
	}

	c.sendResponse(true, "Simulation started", map[string]interface{}{
		"symbol":    startData.Symbol,
		"startTime": startData.StartTime,
		"interval":  startData.Interval,
		"speed":     startData.Speed,
	}, "")
}

func (c *Client) handleStopSimulation() {
	if err := c.SimulationHandler.engine.Stop(); err != nil {
		c.sendResponse(false, "Failed to stop simulation", nil, err.Error())
		return
	}

	c.sendResponse(true, "Simulation stopped", nil, "")
}

func (c *Client) handlePauseSimulation() {
	if err := c.SimulationHandler.engine.Pause(); err != nil {
		c.sendResponse(false, "Failed to pause simulation", nil, err.Error())
		return
	}

	c.sendResponse(true, "Simulation paused", nil, "")
}

func (c *Client) handleResumeSimulation() {
	if err := c.SimulationHandler.engine.Resume(); err != nil {
		c.sendResponse(false, "Failed to resume simulation", nil, err.Error())
		return
	}

	c.sendResponse(true, "Simulation resumed", nil, "")
}

func (c *Client) handleSetSpeed(data interface{}) {
	dataBytes, _ := json.Marshal(data)
	var speedData SimulationSetSpeedData
	if err := json.Unmarshal(dataBytes, &speedData); err != nil {
		c.sendResponse(false, "Invalid speed data", nil, err.Error())
		return
	}

	if err := c.SimulationHandler.engine.SetSpeed(speedData.Speed); err != nil {
		c.sendResponse(false, "Failed to set speed", nil, err.Error())
		return
	}

	c.sendResponse(true, "Speed updated", map[string]interface{}{
		"speed": speedData.Speed,
	}, "")
}

func (c *Client) handleSetTimeframe(data interface{}) {
	dataBytes, _ := json.Marshal(data)
	var timeframeData SimulationSetTimeframeData
	if err := json.Unmarshal(dataBytes, &timeframeData); err != nil {
		c.sendResponse(false, "Invalid timeframe data", nil, err.Error())
		return
	}

	if err := c.SimulationHandler.engine.SetTimeframe(timeframeData.Timeframe); err != nil {
		c.sendResponse(false, "Failed to set timeframe", nil, err.Error())
		return
	}

	c.sendResponse(true, "Timeframe updated", map[string]interface{}{
		"timeframe": timeframeData.Timeframe,
	}, "")
}

func (c *Client) handleGetStatus() {
	status := c.SimulationHandler.engine.GetStatus()
	c.sendResponse(true, "Status retrieved", status, "")
}