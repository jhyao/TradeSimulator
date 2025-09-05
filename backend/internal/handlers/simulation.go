package handlers

import (
	"net/http"
	"strconv"

	"tradesimulator/internal/dao/simulation"
	simulationEngine "tradesimulator/internal/engines/simulation"

	"github.com/gin-gonic/gin"
)

type SimulationHandler struct {
	engine        *simulationEngine.SimulationEngine
	simulationDAO simulation.SimulationDAOInterface
}

func NewSimulationHandler(engine *simulationEngine.SimulationEngine, simulationDAO simulation.SimulationDAOInterface) *SimulationHandler {
	return &SimulationHandler{
		engine:        engine,
		simulationDAO: simulationDAO,
	}
}

// GetStatus handles GET /api/v1/simulation/status
// @Summary Get Current Simulation Status
// @Description Get the current status of the running simulation engine
// @Tags simulation
// @Produce json
// @Success 200 {object} map[string]interface{} "Current simulation status"
// @Router /simulation/status [get]
func (sh *SimulationHandler) GetStatus(c *gin.Context) {
	status := sh.engine.GetStatus()
	c.JSON(http.StatusOK, status)
}

// GetSimulations handles GET /api/v1/simulations
// @Summary Get User Simulations
// @Description Get list of simulation records for the current user
// @Tags simulations
// @Produce json
// @Param limit query int false "Number of simulations to return (default: 50)" default(50) minimum(1) maximum(1000)
// @Param offset query int false "Number of simulations to skip (default: 0)" default(0) minimum(0)
// @Success 200 {object} map[string]interface{} "List of simulations"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /simulations [get]
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

	simulations, err := sh.simulationDAO.GetUserSimulations(userID, limit, offset)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"simulations": simulations,
		"count":       len(simulations),
	})
}

// GetSimulation handles GET /api/v1/simulations/:id
// @Summary Get Simulation by ID
// @Description Get detailed information about a specific simulation
// @Tags simulations
// @Produce json
// @Param id path int true "Simulation ID"
// @Success 200 {object} models.Simulation "Simulation details"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 404 {object} map[string]interface{} "Simulation not found"
// @Router /simulations/{id} [get]
func (sh *SimulationHandler) GetSimulation(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid simulation ID"})
		return
	}

	simulation, err := sh.simulationDAO.GetSimulationByID(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "simulation not found"})
		return
	}

	c.JSON(http.StatusOK, simulation)
}

// GetSimulationStats handles GET /api/v1/simulations/:id/stats
// @Summary Get Simulation Statistics
// @Description Get performance statistics for a specific simulation
// @Tags simulations
// @Produce json
// @Param id path int true "Simulation ID"
// @Success 200 {object} map[string]interface{} "Simulation statistics"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 404 {object} map[string]interface{} "Simulation not found"
// @Router /simulations/{id}/stats [get]
func (sh *SimulationHandler) GetSimulationStats(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid simulation ID"})
		return
	}

	stats, err := sh.simulationDAO.GetSimulationStats(uint(id))
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "simulation not found"})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// DeleteSimulation handles DELETE /api/v1/simulations/:id
// @Summary Delete Simulation
// @Description Delete a specific simulation and all its related data
// @Tags simulations
// @Produce json
// @Param id path int true "Simulation ID"
// @Success 200 {object} map[string]interface{} "Success message"
// @Failure 400 {object} map[string]interface{} "Bad request"
// @Failure 500 {object} map[string]interface{} "Internal server error"
// @Router /simulations/{id} [delete]
func (sh *SimulationHandler) DeleteSimulation(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.ParseUint(idStr, 10, 32)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid simulation ID"})
		return
	}

	err = sh.simulationDAO.DeleteSimulation(uint(id))
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
