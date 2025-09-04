package services

import (
	"fmt"

	"tradesimulator/internal/database"
	"tradesimulator/internal/models"
	"gorm.io/gorm"
)

// PortfolioService handles portfolio and position management
type PortfolioService struct {
	db               *gorm.DB
	simulationEngine *SimulationEngine
}

// NewPortfolioService creates a new portfolio service
func NewPortfolioService(simulationEngine *SimulationEngine) *PortfolioService {
	return &PortfolioService{
		db:               database.GetDB(),
		simulationEngine: simulationEngine,
	}
}

// PortfolioSummary represents complete portfolio information using unified Position model
type PortfolioSummary struct {
	Positions   []PositionSummary `json:"positions"`
	TotalValue  float64           `json:"totalValue"`
	TotalPnL    float64           `json:"totalPnL"`
	CashBalance float64           `json:"cash_balance"` // USDT position quantity
	// Legacy portfolio structure for backward compatibility with frontend
	Portfolio struct {
		ID          uint    `json:"id"`
		UserID      uint    `json:"user_id"`
		CashBalance float64 `json:"cash_balance"`
		TotalValue  float64 `json:"total_value"`
		UpdatedAt   string  `json:"updated_at"`
		CreatedAt   string  `json:"created_at"`
	} `json:"portfolio"`
}

// PositionSummary represents position with P&L calculations
type PositionSummary struct {
	Position      *models.Position `json:"position"`
	CurrentPrice  float64          `json:"currentPrice"`
	MarketValue   float64          `json:"marketValue"`
	UnrealizedPnL float64          `json:"unrealizedPnL"`
	TotalReturn   float64          `json:"totalReturn"` // Percentage return
}

// GetUserPortfolio gets complete portfolio summary for a user using unified Position model
func (ps *PortfolioService) GetUserPortfolio(userID uint) (*PortfolioSummary, error) {
	// Get all positions for the user
	positions, err := ps.getUserPositions(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get positions: %w", err)
	}

	// If no positions exist, create initial USDT position
	if len(positions) == 0 {
		if err := ps.createInitialUSDTPosition(userID); err != nil {
			return nil, fmt.Errorf("failed to create initial USDT position: %w", err)
		}
		// Retry getting positions
		positions, err = ps.getUserPositions(userID)
		if err != nil {
			return nil, fmt.Errorf("failed to get positions after creation: %w", err)
		}
	}

	// Calculate position summaries with P&L
	var positionSummaries []PositionSummary
	var totalMarketValue float64
	var totalUnrealizedPnL float64
	var cashBalance float64

	currentPrice := ps.simulationEngine.GetCurrentPrice()

	for _, position := range positions {
		var positionPrice float64
		
		if position.Symbol == "USDT" {
			// USDT always has price = 1
			positionPrice = 1.0
			cashBalance = position.Quantity
		} else if position.Symbol == ps.getSimulationSymbol() {
			// Use current simulation price for the main trading symbol
			positionPrice = currentPrice
		} else {
			// For other symbols, use average price as fallback
			positionPrice = position.AveragePrice
		}

		marketValue := position.Quantity * positionPrice
		unrealizedPnL := marketValue - position.TotalCost
		
		var totalReturn float64
		if position.TotalCost != 0 {
			totalReturn = (unrealizedPnL / position.TotalCost) * 100
		}

		positionSummary := PositionSummary{
			Position:      &position,
			CurrentPrice:  positionPrice,
			MarketValue:   marketValue,
			UnrealizedPnL: unrealizedPnL,
			TotalReturn:   totalReturn,
		}

		positionSummaries = append(positionSummaries, positionSummary)
		totalMarketValue += marketValue
		totalUnrealizedPnL += unrealizedPnL
	}

	// Create legacy portfolio structure for frontend compatibility
	legacyPortfolio := struct {
		ID          uint    `json:"id"`
		UserID      uint    `json:"user_id"`
		CashBalance float64 `json:"cash_balance"`
		TotalValue  float64 `json:"total_value"`
		UpdatedAt   string  `json:"updated_at"`
		CreatedAt   string  `json:"created_at"`
	}{
		ID:          1, // Dummy ID for compatibility
		UserID:      userID,
		CashBalance: cashBalance,
		TotalValue:  totalMarketValue,
		UpdatedAt:   "2024-01-01T00:00:00Z", // Placeholder
		CreatedAt:   "2024-01-01T00:00:00Z", // Placeholder
	}

	summary := &PortfolioSummary{
		Portfolio:   legacyPortfolio,
		Positions:   positionSummaries,
		TotalValue:  totalMarketValue,
		TotalPnL:    totalUnrealizedPnL,
		CashBalance: cashBalance,
	}

	return summary, nil
}

// createInitialUSDTPosition creates an initial USDT position for a new user
func (ps *PortfolioService) createInitialUSDTPosition(userID uint) error {
	position := &models.Position{
		UserID:       userID,
		Symbol:       "USDT",
		BaseCurrency: "USDT",
		Quantity:     10000.0, // Start with $10,000
		AveragePrice: 1.0,     // USDT always has price = 1
		TotalCost:    10000.0,
	}
	
	if err := ps.db.Create(position).Error; err != nil {
		return fmt.Errorf("failed to create initial USDT position: %w", err)
	}
	
	return nil
}

// getUserPositions gets all positions for a user
func (ps *PortfolioService) getUserPositions(userID uint) ([]models.Position, error) {
	var positions []models.Position
	if err := ps.db.Where("user_id = ?", userID).Find(&positions).Error; err != nil {
		return nil, err
	}
	return positions, nil
}

// getSimulationSymbol gets the current simulation symbol
func (ps *PortfolioService) getSimulationSymbol() string {
	status := ps.simulationEngine.GetStatus()
	return status.Symbol
}

// ResetPortfolio resets a user's portfolio to initial state (for testing/reset)
func (ps *PortfolioService) ResetPortfolio(userID uint) error {
	return ps.ResetPortfolioWithFunding(userID, 10000.0)
}

// ResetPortfolioWithFunding resets a user's positions with custom initial USDT funding
func (ps *PortfolioService) ResetPortfolioWithFunding(userID uint, initialFunding float64) error {
	tx := ps.db.Begin()
	if tx.Error != nil {
		return tx.Error
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Delete all positions
	if err := tx.Where("user_id = ?", userID).Delete(&models.Position{}).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to delete positions: %w", err)
	}

	// Create new USDT position with initial funding
	position := &models.Position{
		UserID:       userID,
		Symbol:       "USDT",
		BaseCurrency: "USDT",
		Quantity:     initialFunding,
		AveragePrice: 1.0,
		TotalCost:    initialFunding,
	}
	
	if err := tx.Create(position).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to create initial USDT position: %w", err)
	}

	return tx.Commit().Error
}