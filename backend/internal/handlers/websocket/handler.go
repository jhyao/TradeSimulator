package websocket

import (
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
)

// WebSocketHandler handles WebSocket connections and manages event routing
type WebSocketHandler struct {
	hub               *Hub
	simulationHandler SimulationEventHandler
	orderHandler      OrderEventHandler
}

// NewWebSocketHandler creates a new WebSocket handler
func NewWebSocketHandler() *WebSocketHandler {
	hub := NewHub()
	go hub.Run()
	
	return &WebSocketHandler{
		hub: hub,
	}
}

// SetHandlers sets the event handlers for simulation and order events
func (wh *WebSocketHandler) SetHandlers(simulationHandler SimulationEventHandler, orderHandler OrderEventHandler) {
	wh.simulationHandler = simulationHandler
	wh.orderHandler = orderHandler
}

// HandleWebSocket upgrades HTTP connection to WebSocket and manages client
func (wh *WebSocketHandler) HandleWebSocket(c *gin.Context) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to upgrade connection"})
		return
	}
	
	client := NewClient(conn, wh.hub, wh.simulationHandler, wh.orderHandler)
	
	// Register client and start processing
	wh.hub.RegisterClient(client)
	client.Start()
}

// GetHub returns the WebSocket hub for broadcasting messages
func (wh *WebSocketHandler) GetHub() *Hub {
	return wh.hub
}