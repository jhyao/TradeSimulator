package websocket

import (
	"encoding/json"

	"tradesimulator/internal/models"
	"tradesimulator/internal/services"
	"tradesimulator/internal/types"
)

// Order control message structures
type OrderPlaceData struct {
	Symbol   string  `json:"symbol"`
	Side     string  `json:"side"` // "buy" or "sell"
	Quantity float64 `json:"quantity"`
}

type OrderControlResponse struct {
	Success bool        `json:"success"`
	Message string      `json:"message"`
	Data    interface{} `json:"data,omitempty"`
	Error   string      `json:"error,omitempty"`
}

// OrderEventHandlerImpl handles order-related WebSocket events
type OrderEventHandlerImpl struct {
	orderService     *services.OrderService
	portfolioService *services.PortfolioService
	// Remove global engines - now each client has its own
}

// NewOrderEventHandler creates a new order event handler
func NewOrderEventHandler(orderService *services.OrderService, portfolioService *services.PortfolioService) *OrderEventHandlerImpl {
	return &OrderEventHandlerImpl{
		orderService:     orderService,
		portfolioService: portfolioService,
	}
}

// HandleMessage handles order control messages
func (h *OrderEventHandlerImpl) HandleMessage(client *Client, message types.WebSocketMessage) error {
	switch message.Type {
	case types.OrderPlace:
		h.handlePlaceOrder(client, message.Data)
	case types.OrderCancel:
		h.handleCancelOrder(client, message.Data)
	default:
		client.SendError("Unknown order message", "Unknown message type "+string(message.Type))
	}
	return nil
}

// handlePlaceOrder handles order placement requests
func (h *OrderEventHandlerImpl) handlePlaceOrder(client *Client, data interface{}) error {
	dataBytes, _ := json.Marshal(data)
	var orderData OrderPlaceData
	if err := json.Unmarshal(dataBytes, &orderData); err != nil {
		client.SendError("Invalid order data", err.Error())
		return nil
	}

	// Convert side string to OrderSide enum
	var side string
	switch orderData.Side {
	case "buy":
		side = "buy"
	case "sell":
		side = "sell"
	default:
		client.SendError("Invalid order side", "Side must be 'buy' or 'sell'")
		return nil
	}

	// Check if simulation is running and get current data
	status := client.SimulationEngine.GetStatus()
	if !status.IsRunning {
		client.SendError("Simulation not running", "Cannot place orders when simulation is not running")
		return nil
	}

	if status.CurrentPrice <= 0 {
		client.SendError("Invalid current price", "Cannot determine current price")
		return nil
	}

	// Place the order using the client's order execution engine (using default user ID 1 for now)
	order, trade, err := client.OrderEngine.ExecuteMarketOrder(1, status.SimulationID, orderData.Symbol, models.OrderSide(side), orderData.Quantity, status.CurrentPrice, status.SimulationTime)
	if err != nil {
		client.SendError("Failed to place order", err.Error())
		return nil
	}

	responseData := map[string]interface{}{
		"order": order,
	}
	if trade != nil {
		responseData["trade"] = trade
	}

	return nil
}

// handleCancelOrder handles order cancellation requests
func (h *OrderEventHandlerImpl) handleCancelOrder(client *Client, data interface{}) error {
	// TODO: Implement order cancellation logic when needed
	client.SendError("Order cancellation not implemented", "Feature not yet implemented")
	return nil
}
