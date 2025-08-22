package handlers

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"tradesimulator/internal/services"
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

// POST /api/v1/simulation/start
func (sh *SimulationHandler) StartSimulation(c *gin.Context) {
	var req StartSimulationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Default speed to 1x if not specified
	if req.Speed == 0 {
		req.Speed = 1
	}

	// Validate speed
	if req.Speed != 1 && req.Speed != 5 && req.Speed != 10 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Speed must be 1, 5, or 10"})
		return
	}

	// Convert timestamp to time
	startTime := time.Unix(req.StartTime/1000, 0)

	// Validate start time is not in the future
	if startTime.After(time.Now()) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Start time cannot be in the future"})
		return
	}

	// Start the simulation
	if err := sh.engine.Start(req.Symbol, req.Interval, startTime, req.Speed); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   "Simulation started",
		"symbol":    req.Symbol,
		"startTime": startTime.Format(time.RFC3339),
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

// GET /api/v1/simulation/status
func (sh *SimulationHandler) GetStatus(c *gin.Context) {
	status := sh.engine.GetStatus()
	c.JSON(http.StatusOK, status)
}

// RegisterSimulationRoutes registers all simulation routes
func RegisterSimulationRoutes(router *gin.RouterGroup, handler *SimulationHandler) {
	simulation := router.Group("/simulation")
	{
		simulation.POST("/start", handler.StartSimulation)
		simulation.POST("/pause", handler.PauseSimulation)
		simulation.POST("/resume", handler.ResumeSimulation)
		simulation.POST("/stop", handler.StopSimulation)
		simulation.POST("/speed", handler.SetSpeed)
		simulation.GET("/status", handler.GetStatus)
	}
}