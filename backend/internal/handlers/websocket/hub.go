package websocket

import (
	"encoding/json"
	"log"
	"sync"
	"tradesimulator/internal/types"
)

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
			statusMsg := types.WebSocketMessage{
				Type: types.ConnectionStatus,
				Data: types.ConnectionStatusData{
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
func (h *Hub) BroadcastMessage(msgType types.MessageType, data interface{}) {
	message := types.WebSocketMessage{
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
	h.BroadcastMessage(types.MessageType(msgType), data)
}

// GetClientCount returns the number of connected clients
func (h *Hub) GetClientCount() int {
	h.mutex.RLock()
	defer h.mutex.RUnlock()
	return len(h.clients)
}

// RegisterClient registers a new client
func (h *Hub) RegisterClient(client *Client) {
	h.register <- client
}

// UnregisterClient unregisters a client
func (h *Hub) UnregisterClient(client *Client) {
	h.unregister <- client
}