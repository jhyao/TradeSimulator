package websocket

import (
	"encoding/json"

	simulationEngine "tradesimulator/internal/engines/simulation"
	"tradesimulator/internal/models"
	"tradesimulator/internal/services"
)

// Order control message structures
type OrderPlaceData struct {
	Symbol   string  `json:"symbol"`
	Side     string  `json:"side"`     // "buy" or "sell"
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
	simulationEngine *simulationEngine.SimulationEngine
	hub              *Hub
}

// NewOrderEventHandler creates a new order event handler
func NewOrderEventHandler(orderService *services.OrderService, portfolioService *services.PortfolioService, simEngine *simulationEngine.SimulationEngine, hub *Hub) *OrderEventHandlerImpl {
	return &OrderEventHandlerImpl{
		orderService:     orderService,
		portfolioService: portfolioService,
		simulationEngine: simEngine,
		hub:              hub,
	}
}

// HandleMessage handles order control messages
func (h *OrderEventHandlerImpl) HandleMessage(client *Client, message WebSocketMessage) error {
	switch message.Type {
	case OrderPlace:
		return h.handlePlaceOrder(client, message.Data)
	case OrderCancel:
		return h.handleCancelOrder(client, message.Data)
	default:
		return h.sendOrderResponse(client, false, "Unknown order message", nil, "Unknown message type")
	}
}

// handlePlaceOrder handles order placement requests
func (h *OrderEventHandlerImpl) handlePlaceOrder(client *Client, data interface{}) error {
	dataBytes, _ := json.Marshal(data)
	var orderData OrderPlaceData
	if err := json.Unmarshal(dataBytes, &orderData); err != nil {
		return h.sendOrderResponse(client, false, "Invalid order data", nil, err.Error())
	}

	// Convert side string to OrderSide enum
	var side string
	switch orderData.Side {
	case "buy":
		side = "buy"
	case "sell":
		side = "sell"
	default:
		return h.sendOrderResponse(client, false, "Invalid order side", nil, "Side must be 'buy' or 'sell'")
	}

	// Check if simulation is running and get current data
	status := h.simulationEngine.GetStatus()
	if !status.IsRunning {
		return h.sendOrderResponse(client, false, "Simulation not running", nil, "Cannot place orders when simulation is not running")
	}

	if status.CurrentPrice <= 0 {
		return h.sendOrderResponse(client, false, "Invalid current price", nil, "Cannot determine current price")
	}

	// Place the order (using default user ID 1 for now)
	order, trade, err := h.orderService.PlaceMarketOrder(1, status.SimulationID, orderData.Symbol, models.OrderSide(side), orderData.Quantity, status.CurrentPrice, status.SimulationTime)
	if err != nil {
		return h.sendOrderResponse(client, false, "Failed to place order", nil, err.Error())
	}

	responseData := map[string]interface{}{
		"order": order,
	}
	if trade != nil {
		responseData["trade"] = trade
	}

	return h.sendOrderResponse(client, true, "Order placed successfully", responseData, "")
}

// handleCancelOrder handles order cancellation requests  
func (h *OrderEventHandlerImpl) handleCancelOrder(client *Client, data interface{}) error {
	// TODO: Implement order cancellation logic when needed
	return h.sendOrderResponse(client, false, "Order cancellation not implemented", nil, "Feature not yet implemented")
}

// sendOrderResponse sends an order control response back to the client
func (h *OrderEventHandlerImpl) sendOrderResponse(client *Client, success bool, message string, data interface{}, errorMsg string) error {
	response := OrderControlResponse{
		Success: success,
		Message: message,
		Data:    data,
		Error:   errorMsg,
	}

	responseMsgType := "order_control_response"
	if !success {
		responseMsgType = "order_control_error"
	}

	responseMessage := WebSocketMessage{
		Type: MessageType(responseMsgType),
		Data: response,
	}

	client.SendMessage(responseMessage)
	return nil
}