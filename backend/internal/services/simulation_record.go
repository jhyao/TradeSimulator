package services

import (
	"encoding/json"
	"fmt"
	"log"

	"tradesimulator/internal/database"
	"tradesimulator/internal/models"
)

// SimulationRecordService manages simulation record operations
type SimulationRecordService struct{}

func NewSimulationRecordService() *SimulationRecordService {
	return &SimulationRecordService{}
}

// CreateSimulationRecord creates a new simulation record when starting simulation
func (s *SimulationRecordService) CreateSimulationRecord(userID uint, symbol string, startSimTime, endSimTime int64, initialFunding float64, mode models.SimulationMode, extraConfig *ExtraConfig) (*models.Simulation, error) {
	// Convert extra config to JSON string
	extraConfigJSON := "{}"
	if extraConfig != nil {
		if configBytes, err := json.Marshal(extraConfig); err == nil {
			extraConfigJSON = string(configBytes)
		} else {
			log.Printf("Warning: failed to marshal extra config: %v", err)
		}
	}

	simulation := &models.Simulation{
		UserID:         userID,
		Symbol:         symbol,
		StartSimTime:   startSimTime,
		EndSimTime:     endSimTime,
		InitialFunding: initialFunding,
		Mode:           mode,
		ExtraConfigs:   extraConfigJSON,
		Status:         models.SimulationStatusRunning,
	}

	if err := database.DB.Create(simulation).Error; err != nil {
		return nil, fmt.Errorf("failed to create simulation record: %w", err)
	}

	log.Printf("Created simulation record: ID=%d, Symbol=%s, StartTime=%d, EndTime=%d, InitialFunding=%.2f",
		simulation.ID, symbol, startSimTime, endSimTime, initialFunding)

	return simulation, nil
}

// UpdateSimulationStatus updates the status of a simulation record
func (s *SimulationRecordService) UpdateSimulationStatus(simulationID uint, status models.SimulationStatus) error {
	result := database.DB.Model(&models.Simulation{}).
		Where("id = ?", simulationID).
		Update("status", status)

	if result.Error != nil {
		return fmt.Errorf("failed to update simulation status: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("simulation record not found: %d", simulationID)
	}

	log.Printf("Updated simulation %d status to %s", simulationID, status)
	return nil
}

// UpdateSimulationStatusWithDetails updates simulation status along with end time and total value
func (s *SimulationRecordService) UpdateSimulationStatusWithDetails(simulationID uint, status models.SimulationStatus, endSimTime int64, totalValue *float64) error {
	updates := map[string]interface{}{
		"status": status,
	}

	if endSimTime != 0 {
		updates["end_sim_time"] = endSimTime
	}

	// Update total_value if provided (for any status)
	if totalValue != nil {
		updates["total_value"] = *totalValue
	}

	result := database.DB.Model(&models.Simulation{}).
		Where("id = ?", simulationID).
		Updates(updates)

	if result.Error != nil {
		return fmt.Errorf("failed to update simulation details: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return fmt.Errorf("simulation record not found: %d", simulationID)
	}

	// Log appropriate message based on what was updated
	logMsg := fmt.Sprintf("Updated simulation %d: status=%s", simulationID, status)
	if status == models.SimulationStatusCompleted || status == models.SimulationStatusStopped {
		logMsg += fmt.Sprintf(", endTime=%d", endSimTime)
	}
	if totalValue != nil {
		logMsg += fmt.Sprintf(", totalValue=%.2f", *totalValue)
	}
	log.Printf(logMsg)
	return nil
}


// GetSimulationByID retrieves a simulation record by ID
func (s *SimulationRecordService) GetSimulationByID(simulationID uint) (*models.Simulation, error) {
	var simulation models.Simulation
	if err := database.DB.First(&simulation, simulationID).Error; err != nil {
		return nil, fmt.Errorf("failed to get simulation record: %w", err)
	}
	return &simulation, nil
}

// GetUserSimulations retrieves all simulations for a user
func (s *SimulationRecordService) GetUserSimulations(userID uint, limit, offset int) ([]models.Simulation, error) {
	var simulations []models.Simulation
	query := database.DB.Where("user_id = ?", userID).
		Order("created_at DESC")

	if limit > 0 {
		query = query.Limit(limit)
	}
	if offset > 0 {
		query = query.Offset(offset)
	}

	if err := query.Find(&simulations).Error; err != nil {
		return nil, fmt.Errorf("failed to get user simulations: %w", err)
	}

	return simulations, nil
}

// GetRunningSimulation gets the currently running simulation for a user
func (s *SimulationRecordService) GetRunningSimulation(userID uint) (*models.Simulation, error) {
	var simulation models.Simulation
	err := database.DB.Where("user_id = ? AND status IN (?)", userID, []models.SimulationStatus{
		models.SimulationStatusRunning,
		models.SimulationStatusPaused,
	}).First(&simulation).Error

	if err != nil {
		return nil, err // Return the error as-is, caller can check if it's record not found
	}

	return &simulation, nil
}

// DeleteSimulation deletes a simulation record and all associated data
func (s *SimulationRecordService) DeleteSimulation(simulationID uint) error {
	// Start a transaction to ensure all related data is deleted
	tx := database.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Delete related orders
	if err := tx.Where("simulation_id = ?", simulationID).Delete(&models.Order{}).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to delete orders: %w", err)
	}

	// Delete related trades
	if err := tx.Where("simulation_id = ?", simulationID).Delete(&models.Trade{}).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to delete trades: %w", err)
	}

	// Delete related positions
	if err := tx.Where("simulation_id = ?", simulationID).Delete(&models.Position{}).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to delete positions: %w", err)
	}

	// Delete the simulation record itself
	if err := tx.Delete(&models.Simulation{}, simulationID).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to delete simulation: %w", err)
	}

	if err := tx.Commit().Error; err != nil {
		return fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Printf("Deleted simulation %d and all associated data", simulationID)
	return nil
}

// GetSimulationStats calculates statistics for a simulation
func (s *SimulationRecordService) GetSimulationStats(simulationID uint) (map[string]interface{}, error) {
	// Get simulation record
	simulation, err := s.GetSimulationByID(simulationID)
	if err != nil {
		return nil, err
	}

	stats := map[string]interface{}{
		"simulation_id":   simulation.ID,
		"symbol":          simulation.Symbol,
		"initial_funding": simulation.InitialFunding,
		"total_value":     simulation.TotalValue,
		"status":          simulation.Status,
		"start_time":      simulation.StartSimTime,
		"end_time":        simulation.EndSimTime,
		"created_at":      simulation.CreatedAt,
		"updated_at":      simulation.UpdatedAt,
	}

	// Calculate P&L if simulation is completed
	if simulation.TotalValue != nil {
		pnl := *simulation.TotalValue - simulation.InitialFunding
		pnlPercentage := (pnl / simulation.InitialFunding) * 100
		stats["pnl"] = pnl
		stats["pnl_percentage"] = pnlPercentage
	}

	// Count orders and trades
	var orderCount, tradeCount int64
	database.DB.Model(&models.Order{}).Where("simulation_id = ?", simulationID).Count(&orderCount)
	database.DB.Model(&models.Trade{}).Where("simulation_id = ?", simulationID).Count(&tradeCount)

	stats["order_count"] = orderCount
	stats["trade_count"] = tradeCount

	// Parse extra configs
	var extraConfig ExtraConfig
	if err := json.Unmarshal([]byte(simulation.ExtraConfigs), &extraConfig); err == nil {
		stats["extra_config"] = extraConfig
	}

	return stats, nil
}
