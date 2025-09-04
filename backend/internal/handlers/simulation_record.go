package handlers

import (
	"net/http"
	"strconv"

	"tradesimulator/internal/services"

	"github.com/gin-gonic/gin"
)

type SimulationRecordHandler struct {
	simulationRecordService *services.SimulationRecordService
}

func NewSimulationRecordHandler() *SimulationRecordHandler {
	return &SimulationRecordHandler{
		simulationRecordService: services.NewSimulationRecordService(),
	}
}

// GET /api/v1/simulations
func (srh *SimulationRecordHandler) GetSimulations(c *gin.Context) {
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

	simulations, err := srh.simulationRecordService.GetUserSimulations(userID, limit, offset)
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
func (srh *SimulationRecordHandler) GetSimulation(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid simulation ID"})
		return
	}

	simulation, err := srh.simulationRecordService.GetSimulationByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "simulation not found"})
		return
	}

	c.JSON(http.StatusOK, simulation)
}

// GET /api/v1/simulations/:id/stats
func (srh *SimulationRecordHandler) GetSimulationStats(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid simulation ID"})
		return
	}

	stats, err := srh.simulationRecordService.GetSimulationStats(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "simulation not found"})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// DELETE /api/v1/simulations/:id
func (srh *SimulationRecordHandler) DeleteSimulation(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid simulation ID"})
		return
	}

	err = srh.simulationRecordService.DeleteSimulation(uint(id))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "simulation deleted successfully"})
}

// RegisterSimulationRecordRoutes registers simulation record routes
func RegisterSimulationRecordRoutes(router *gin.RouterGroup, handler *SimulationRecordHandler) {
	simulations := router.Group("/simulations")
	{
		simulations.GET("", handler.GetSimulations)
		simulations.GET("/:id", handler.GetSimulation)
		simulations.GET("/:id/stats", handler.GetSimulationStats)
		simulations.DELETE("/:id", handler.DeleteSimulation)
	}
}