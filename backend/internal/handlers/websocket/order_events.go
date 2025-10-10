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
	case "open_long":
		side = "open_long"
	case "open_short":
		side = "open_short"
	case "close_long":
		side = "close_long"
	case "close_short":
		side = "close_short"
	default:
		client.SendError("Invalid order side", "Side must be 'buy', 'sell', 'open_long', 'open_short', 'close_long', or 'close_short'")
		return nil
	}

	// Validate order type and limit price
	orderType := orderData.Type
	if orderType == "" {
		orderType = "market" // Default to market order for backward compatibility
	}

	if orderType != "market" && orderType != "limit" {
		client.SendError("Invalid order type", "Type must be 'market' or 'limit'")
		return nil
	}

	if orderType == "limit" && orderData.LimitPrice == nil {
		client.SendError("Missing limit price", "Limit price is required for limit orders")
		return nil
	}

	if orderType == "limit" && *orderData.LimitPrice <= 0 {
		client.SendError("Invalid limit price", "Limit price must be positive")
		return nil
	}

	// Validate futures orders
	isFuturesOrder := side == "open_long" || side == "open_short" || side == "close_long" || side == "close_short"
	if isFuturesOrder {
		// Validate leverage for futures orders
		if orderData.Leverage == nil {
			client.SendError("Missing leverage", "Leverage is required for futures orders")
			return nil
		}
		if *orderData.Leverage < 1.0 || *orderData.Leverage > 20.0 {
			client.SendError("Invalid leverage", "Leverage must be between 1x and 20x")
			return nil
		}
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
	var order *models.Order
	var trade *models.Trade
	var err error

	// Create order with appropriate parameters
	orderSide := models.OrderSide(side)

	if orderType == "market" {
		if isFuturesOrder {
			order, trade, err = client.OrderEngine.ExecuteFuturesMarketOrder(1, status.SimulationID, orderData.Symbol, orderSide, orderData.Quantity, *orderData.Leverage, status.CurrentPrice, status.SimulationTime)
		} else {
			order, trade, err = client.OrderEngine.ExecuteMarketOrder(1, status.SimulationID, orderData.Symbol, orderSide, orderData.Quantity, status.CurrentPrice, status.SimulationTime)
		}
	} else if orderType == "limit" {
		if isFuturesOrder {
			order, err = client.OrderEngine.PlaceFuturesLimitOrder(1, status.SimulationID, orderData.Symbol, orderSide, orderData.Quantity, *orderData.Leverage, *orderData.LimitPrice, status.SimulationTime)
		} else {
			order, err = client.OrderEngine.PlaceLimitOrder(1, status.SimulationID, orderData.Symbol, orderSide, orderData.Quantity, *orderData.LimitPrice, status.SimulationTime)
		}
		// Limit orders don't have immediate trades, they are placed as pending
		trade = nil
	}

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
