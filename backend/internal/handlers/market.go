package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"tradesimulator/internal/models"
	"tradesimulator/internal/services"
)

type MarketHandler struct {
	binanceService *services.BinanceService
}

func NewMarketHandler() *MarketHandler {
	return &MarketHandler{
		binanceService: services.NewBinanceService(),
	}
}

// GetHistoricalData handles GET /api/market/historical requests
// @Summary Get Historical Market Data
// @Description Fetch historical OHLCV data for supported trading pairs (BTCUSDT, ETHUSDT)
// @Tags market
// @Produce json
// @Param symbol query string true "Trading symbol" Enums(BTCUSDT,ETHUSDT)
// @Param interval query string false "Kline interval" default(1h) Enums(1m,3m,5m,15m,30m,1h,2h,4h,6h,8h,12h,1d,3d,1w,1M)
// @Param limit query int false "Number of klines to return (1-1000)" default(1000) minimum(1) maximum(1000)
// @Param startTime query int false "Start time in milliseconds"
// @Param endTime query int false "End time in milliseconds"
// @Success 200 {object} models.HistoricalDataResponse "Historical market data"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /market/historical [get]
func (h *MarketHandler) GetHistoricalData(c *gin.Context) {
	// Get query parameters
	symbol := c.Query("symbol")
	if symbol == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "symbol parameter is required",
		})
		return
	}

	// Default to 1 hour interval if not specified
	interval := c.DefaultQuery("interval", "1h")
	
	// Validate interval
	if !h.binanceService.ValidateInterval(interval) {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "invalid interval. Valid intervals: 1m, 3m, 5m, 15m, 30m, 1h, 2h, 4h, 6h, 8h, 12h, 1d, 3d, 1w, 1M",
		})
		return
	}

	// Parse optional limit parameter
	limit := 1000 // Default limit
	if limitStr := c.Query("limit"); limitStr != "" {
		if parsedLimit, err := strconv.Atoi(limitStr); err == nil && parsedLimit > 0 && parsedLimit <= 1000 {
			limit = parsedLimit
		}
	}

	// Parse optional start and end time
	var startTime, endTime *int64
	if startTimeStr := c.Query("startTime"); startTimeStr != "" {
		if parsed, err := strconv.ParseInt(startTimeStr, 10, 64); err == nil {
			startTime = &parsed
		}
	}
	
	if endTimeStr := c.Query("endTime"); endTimeStr != "" {
		if parsed, err := strconv.ParseInt(endTimeStr, 10, 64); err == nil {
			endTime = &parsed
		}
	}

	// Fetch historical data
	data, err := h.binanceService.GetHistoricalData(symbol, interval, limit, startTime, endTime)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	// Return response
	response := models.HistoricalDataResponse{
		Symbol: symbol,
		Data:   data,
	}

	c.JSON(http.StatusOK, response)
}

// GetSupportedSymbols handles GET /api/market/symbols requests
// @Summary Get Supported Trading Symbols
// @Description Get list of supported trading pairs for historical data
// @Tags market
// @Produce json
// @Success 200 {object} map[string]interface{} "List of supported symbols"
// @Router /market/symbols [get]
func (h *MarketHandler) GetSupportedSymbols(c *gin.Context) {
	symbols := h.binanceService.GetSupportedSymbols()
	c.JSON(http.StatusOK, gin.H{
		"symbols": symbols,
	})
}

// GetEarliestTime handles GET /api/market/earliest-time/:symbol requests
// @Summary Get Earliest Available Time for Symbol
// @Description Get the earliest available data timestamp for a specific trading symbol
// @Tags market
// @Produce json
// @Param symbol path string true "Trading symbol" Enums(BTCUSDT,ETHUSDT)
// @Success 200 {object} models.EarliestTimeResponse "Earliest available time"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /market/earliest-time/{symbol} [get]
func (h *MarketHandler) GetEarliestTime(c *gin.Context) {
	// Get symbol from URL parameter
	symbol := c.Param("symbol")
	if symbol == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "symbol parameter is required",
		})
		return
	}

	// Fetch earliest available time
	earliestTime, err := h.binanceService.GetEarliestAvailableTime(symbol)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": err.Error(),
		})
		return
	}

	// Convert timestamp to ISO format for convenience
	earliestTimeISO := time.UnixMilli(earliestTime).UTC().Format(time.RFC3339)

	// Return response
	response := models.EarliestTimeResponse{
		Symbol:          symbol,
		EarliestTime:    earliestTime,
		EarliestTimeISO: earliestTimeISO,
	}

	c.JSON(http.StatusOK, response)
}