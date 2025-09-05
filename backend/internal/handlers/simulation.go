package handlers

import (
	"net/http"
	"strconv"

	"tradesimulator/internal/services"

	"github.com/gin-gonic/gin"
)

type SimulationHandler struct {
	engine                  *services.SimulationEngine
	simulationRecordService *services.SimulationRecordService
}

func NewSimulationHandler(engine *services.SimulationEngine) *SimulationHandler {
	return &SimulationHandler{
		engine:                  engine,
		simulationRecordService: services.NewSimulationRecordService(),
	}
}

// GET /api/v1/simulation/status
func (sh *SimulationHandler) GetStatus(c *gin.Context) {
	status := sh.engine.GetStatus()
	c.JSON(http.StatusOK, status)
}

// GET /api/v1/simulations
func (sh *SimulationHandler) GetSimulations(c *gin.Context) {
	// Default to user 1 for now
	userID := uint(1)

	// Parse query parameters
	limitStr := c.DefaultQuery("limit", "50")
	offsetStr := c.DefaultQuery("offset", "0")

	limit, err := strconv.Atoi(limitStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid limit parameter"})
		return
	}

	offset, err := strconv.Atoi(offsetStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid offset parameter"})
		return
	}

	simulations, err := sh.simulationRecordService.GetUserSimulations(userID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"simulations": simulations,
		"count":       len(simulations),
	})
}

// GET /api/v1/simulations/:id
func (sh *SimulationHandler) GetSimulation(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid simulation ID"})
		return
	}

	simulation, err := sh.simulationRecordService.GetSimulationByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "simulation not found"})
		return
	}

	c.JSON(http.StatusOK, simulation)
}

// GET /api/v1/simulations/:id/stats
func (sh *SimulationHandler) GetSimulationStats(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid simulation ID"})
		return
	}

	stats, err := sh.simulationRecordService.GetSimulationStats(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "simulation not found"})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// DELETE /api/v1/simulations/:id
func (sh *SimulationHandler) DeleteSimulation(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid simulation ID"})
		return
	}

	err = sh.simulationRecordService.DeleteSimulation(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "simulation deleted successfully"})
}

// RegisterSimulationRoutes registers simulation routes
func RegisterSimulationRoutes(router *gin.RouterGroup, handler *SimulationHandler) {
	// Current simulation status
	simulation := router.Group("/simulation")
	{
		simulation.GET("/status", handler.GetStatus)
	}

	// Historical simulations
	simulations := router.Group("/simulations")
	{
		simulations.GET("", handler.GetSimulations)
		simulations.GET("/:id", handler.GetSimulation)
		simulations.GET("/:id/stats", handler.GetSimulationStats)
		simulations.DELETE("/:id", handler.DeleteSimulation)
	}
}
