package handlers

import (
	"net/http"
	"strconv"

	"tradesimulator/internal/services"
	"github.com/gin-gonic/gin"
)

// OrderHandler handles order-related HTTP and WebSocket requests
type OrderHandler struct {
	orderService      *services.OrderService
	portfolioService  *services.PortfolioService
}


// NewOrderHandler creates a new order handler
func NewOrderHandler(orderService *services.OrderService, portfolioService *services.PortfolioService) *OrderHandler {
	return &OrderHandler{
		orderService:     orderService,
		portfolioService: portfolioService,
	}
}


// GetOrders handles HTTP requests to get user orders
// @Summary Get User Orders
// @Description Get list of orders for a specific simulation
// @Tags orders
// @Produce json
// @Param simulation_id query string true "Simulation ID"
// @Param limit query int false "Number of orders to return (default: 50)" default(50) minimum(1) maximum(1000)
// @Success 200 {object} map[string]interface{} "List of orders"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /orders [get]
func (oh *OrderHandler) GetOrders(c *gin.Context) {
	// For now, use default user ID 1
	userID := uint(1)

	// Get simulation ID from query parameter
	simulationIDStr := c.Query("simulation_id")
	if simulationIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "simulation_id parameter is required"})
		return
	}

	simulationID, err := strconv.ParseUint(simulationIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid simulation_id parameter"})
		return
	}

	// Get limit from query parameter
	limitStr := c.DefaultQuery("limit", "50")
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 50
	}

	orders, err := oh.orderService.GetUserOrders(userID, uint(simulationID), limit)
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
// @Summary Get User Trades
// @Description Get list of executed trades for a specific simulation
// @Tags orders
// @Produce json
// @Param simulation_id query string true "Simulation ID"
// @Param limit query int false "Number of trades to return (default: 50)" default(50) minimum(1) maximum(1000)
// @Success 200 {object} map[string]interface{} "List of trades"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /trades [get]
func (oh *OrderHandler) GetTrades(c *gin.Context) {
	// For now, use default user ID 1
	userID := uint(1)

	// Get simulation ID from query parameter
	simulationIDStr := c.Query("simulation_id")
	if simulationIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "simulation_id parameter is required"})
		return
	}

	simulationID, err := strconv.ParseUint(simulationIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid simulation_id parameter"})
		return
	}

	// Get limit from query parameter
	limitStr := c.DefaultQuery("limit", "50")
	limit, err := strconv.Atoi(limitStr)
	if err != nil || limit <= 0 {
		limit = 50
	}

	trades, err := oh.orderService.GetUserTrades(userID, uint(simulationID), limit)
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
// @Summary Get User Positions
// @Description Get list of current positions for a specific simulation
// @Tags orders
// @Produce json
// @Param simulation_id query string true "Simulation ID"
// @Success 200 {object} map[string]interface{} "List of positions"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /positions [get]
func (oh *OrderHandler) GetPositions(c *gin.Context) {
	// For now, use default user ID 1
	userID := uint(1)

	// Get simulation ID from query parameter
	simulationIDStr := c.Query("simulation_id")
	if simulationIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "simulation_id parameter is required"})
		return
	}

	simulationID, err := strconv.ParseUint(simulationIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid simulation_id parameter"})
		return
	}

	positions, err := oh.portfolioService.GetUserPositions(userID, uint(simulationID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"positions": positions,
	})
}

