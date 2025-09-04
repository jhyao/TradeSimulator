package handlers

import (
	"net/http"
	"strconv"

	"tradesimulator/internal/models"
	"tradesimulator/internal/services"
	"github.com/gin-gonic/gin"
)

// OrderHandler handles order-related HTTP and WebSocket requests
type OrderHandler struct {
	orderService     *services.OrderService
	portfolioService *services.PortfolioService
}

// GetPortfolioService returns the portfolio service
func (oh *OrderHandler) GetPortfolioService() *services.PortfolioService {
	return oh.portfolioService
}

// NewOrderHandler creates a new order handler
func NewOrderHandler(orderService *services.OrderService, portfolioService *services.PortfolioService) *OrderHandler {
	return &OrderHandler{
		orderService:     orderService,
		portfolioService: portfolioService,
	}
}

// PlaceOrderRequest represents the HTTP request for placing an order
type PlaceOrderRequest struct {
	Symbol   string  `json:"symbol" binding:"required"`
	Side     string  `json:"side" binding:"required"`     // "buy" or "sell"
	Quantity float64 `json:"quantity" binding:"required"`
}

// PlaceOrder handles HTTP requests to place an order
func (oh *OrderHandler) PlaceOrder(c *gin.Context) {
	var req PlaceOrderRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Convert side string to OrderSide enum
	var side models.OrderSide
	switch req.Side {
	case "buy":
		side = models.OrderSideBuy
	case "sell":
		side = models.OrderSideSell
	default:
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid order side. Must be 'buy' or 'sell'"})
		return
	}

	// For now, use default user ID 1
	userID := uint(1)

	// Place the order
	order, trade, err := oh.orderService.PlaceMarketOrder(userID, req.Symbol, side, req.Quantity)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	response := gin.H{
		"success": true,
		"message": "Order placed successfully",
		"order":   order,
	}

	if trade != nil {
		response["trade"] = trade
	}

	c.JSON(http.StatusOK, response)
}

// GetOrders handles HTTP requests to get user orders
func (oh *OrderHandler) GetOrders(c *gin.Context) {
	// For now, use default user ID 1
	userID := uint(1)

	// Get limit from query parameter
	limitStr := c.DefaultQuery("limit", "50")
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 50
	}

	orders, err := oh.orderService.GetUserOrders(userID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"orders": orders,
		"count":  len(orders),
	})
}

// GetTrades handles HTTP requests to get user trades
func (oh *OrderHandler) GetTrades(c *gin.Context) {
	// For now, use default user ID 1
	userID := uint(1)

	// Get limit from query parameter
	limitStr := c.DefaultQuery("limit", "50")
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 50
	}

	trades, err := oh.orderService.GetUserTrades(userID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"trades": trades,
		"count":  len(trades),
	})
}

// GetPositions handles HTTP requests to get user positions
func (oh *OrderHandler) GetPositions(c *gin.Context) {
	// For now, use default user ID 1
	userID := uint(1)

	positions, err := oh.portfolioService.GetUserPositions(userID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"positions": positions,
	})
}

// ResetPortfolio handles HTTP requests to reset user portfolio (for testing)
func (oh *OrderHandler) ResetPortfolio(c *gin.Context) {
	// For now, use default user ID 1
	userID := uint(1)

	if err := oh.portfolioService.ResetPortfolio(userID); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Portfolio reset successfully",
	})
}