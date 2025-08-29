package handlers

import (
	"net/http"
	"time"

	"tradesimulator/internal/services"

	"github.com/gin-gonic/gin"
)

type SimulationHandler struct {
	engine *services.SimulationEngine
}

func NewSimulationHandler(engine *services.SimulationEngine) *SimulationHandler {
	return &SimulationHandler{
		engine: engine,
	}
}

type StartSimulationRequest struct {
	Symbol    string `json:"symbol" binding:"required"`
	StartTime int64  `json:"startTime" binding:"required"`
	Interval  string `json:"interval" binding:"required"`
	Speed     int    `json:"speed"`
}

type SetSpeedRequest struct {
	Speed int `json:"speed" binding:"required"`
}

type SetTimeframeRequest struct {
	Timeframe string `json:"timeframe" binding:"required"`
}

// POST /api/v1/simulation/start
func (sh *SimulationHandler) StartSimulation(c *gin.Context) {
	var req StartSimulationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Default speed to 60x if not specified
	if req.Speed == 0 {
		req.Speed = 60
	}

	// Validate speed (must be positive)
	if req.Speed <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Speed must be positive"})
		return
	}

	// Validate start time is not in the future
	currentTimeMs := time.Now().UnixMilli()
	if req.StartTime > currentTimeMs {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Start time cannot be in the future"})
		return
	}

	// Start the simulation
	if err := sh.engine.Start(req.Symbol, req.Interval, req.StartTime, req.Speed); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   "Simulation started",
		"symbol":    req.Symbol,
		"startTime": req.StartTime,
		"interval":  req.Interval,
		"speed":     req.Speed,
	})
}

// POST /api/v1/simulation/pause
func (sh *SimulationHandler) PauseSimulation(c *gin.Context) {
	if err := sh.engine.Pause(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Simulation paused"})
}

// POST /api/v1/simulation/resume
func (sh *SimulationHandler) ResumeSimulation(c *gin.Context) {
	if err := sh.engine.Resume(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Simulation resumed"})
}

// POST /api/v1/simulation/stop
func (sh *SimulationHandler) StopSimulation(c *gin.Context) {
	if err := sh.engine.Stop(); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Simulation stopped"})
}

// POST /api/v1/simulation/speed
func (sh *SimulationHandler) SetSpeed(c *gin.Context) {
	var req SetSpeedRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if err := sh.engine.SetSpeed(req.Speed); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Speed updated",
		"speed":   req.Speed,
	})
}

// POST /api/v1/simulation/timeframe
func (sh *SimulationHandler) SetTimeframe(c *gin.Context) {
	var req SetTimeframeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Validate timeframe format
	validTimeframes := []string{"1m", "5m", "15m", "1h", "4h", "1d"}
	valid := false
	for _, tf := range validTimeframes {
		if req.Timeframe == tf {
			valid = true
			break
		}
	}
	if !valid {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid timeframe. Must be one of: 1m, 5m, 15m, 1h, 4h, 1d"})
		return
	}

	// Engine handles speed-based validation
	if err := sh.engine.SetTimeframe(req.Timeframe); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   "Timeframe updated",
		"timeframe": req.Timeframe,
	})
}

// GET /api/v1/simulation/status
func (sh *SimulationHandler) GetStatus(c *gin.Context) {
	status := sh.engine.GetStatus()
	c.JSON(http.StatusOK, status)
}

// RegisterSimulationRoutes registers remaining simulation routes
// Most simulation control is now handled via WebSocket messages
func RegisterSimulationRoutes(router *gin.RouterGroup, handler *SimulationHandler) {
	simulation := router.Group("/simulation")
	{
		// Keep status endpoint for debugging and health checks
		simulation.GET("/status", handler.GetStatus)
		
		// Removed obsolete control endpoints - now handled via WebSocket:
		// - POST /start
		// - POST /pause 
		// - POST /resume
		// - POST /stop
		// - POST /speed
		// - POST /timeframe
	}
}
