package websocket

import (
	"encoding/json"

	"tradesimulator/internal/models"
	"tradesimulator/internal/services"
	"tradesimulator/internal/types"
)

// Order control message structures
type OrderPlaceData struct {
	Symbol     string   `json:"symbol"`
	Side       string   `json:"side"` // "buy", "sell", "open_long", "open_short", "close_long", "close_short"
	Type       string   `json:"type"` // "market" or "limit"
	Quantity   float64  `json:"quantity"`
	LimitPrice *float64 `json:"limit_price,omitempty"` // Required for limit orders
	Leverage   *float64 `json:"leverage,omitempty"`    // Required for futures orders
}

type OrderCancelData struct {
	OrderID uint `json:"order_id"`
}

// OrderEventHandlerImpl handles order-related WebSocket events
type OrderEventHandlerImpl struct {
	orderService     *services.OrderService
	portfolioService *services.PortfolioService
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

	// Check if simulation is running and get current data
	status := client.SimulationEngine.GetStatus()
	if !status.IsRunning {
		client.SendError("Simulation not running", "Cannot place orders when simulation is not running")
		return nil
	}

	// Convert side string to OrderSide enum
	side := models.OrderSide(orderData.Side)

	// Convert type string to OrderType enum (default to market)
	orderType := models.OrderType(orderData.Type)
	if orderType == "" {
		orderType = models.OrderTypeMarket
	}

	// Place the order using the unified PlaceOrder interface
	// The engine will handle all validation
	order, trade, err := client.OrderEngine.PlaceOrder(
		1, // userID (default user for now)
		status.SimulationID,
		orderData.Symbol,
		side,
		orderType,
		orderData.Quantity,
		orderData.LimitPrice,
		orderData.Leverage,
		status.CurrentPrice,
		status.SimulationTime,
	)

	if err != nil {
		client.SendError("Failed to place order", err.Error())
		return nil
	}

	// Success response is sent by the engine via sendOrderUpdate
	// We don't need to send additional response here
	_ = order
	_ = trade

	return nil
}

// handleCancelOrder handles order cancellation requests
func (h *OrderEventHandlerImpl) handleCancelOrder(client *Client, data interface{}) error {
	dataBytes, _ := json.Marshal(data)
	var cancelData OrderCancelData
	if err := json.Unmarshal(dataBytes, &cancelData); err != nil {
		client.SendError("Invalid cancel data", err.Error())
		return nil
	}

	if cancelData.OrderID == 0 {
		client.SendError("Invalid order ID", "Order ID cannot be zero")
		return nil
	}

	// Check if simulation is running
	status := client.SimulationEngine.GetStatus()
	if !status.IsRunning {
		client.SendError("Simulation not running", "Cannot cancel orders when simulation is not running")
		return nil
	}

	// Cancel the order using the client's order execution engine
	// The engine will automatically send an order_cancelled message upon successful cancellation
	_, err := client.OrderEngine.CancelOrder(cancelData.OrderID)
	if err != nil {
		client.SendError("Failed to cancel order", err.Error())
		return nil
	}

	return nil
}
