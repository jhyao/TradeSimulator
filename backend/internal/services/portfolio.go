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

// PortfolioSummary represents complete portfolio information
type PortfolioSummary struct {
	Portfolio  *models.Portfolio `json:"portfolio"`
	Positions  []PositionSummary `json:"positions"`
	TotalValue float64           `json:"totalValue"`
	TotalPnL   float64           `json:"totalPnL"`
}

// PositionSummary represents position with P&L calculations
type PositionSummary struct {
	Position      *models.Position `json:"position"`
	CurrentPrice  float64          `json:"currentPrice"`
	MarketValue   float64          `json:"marketValue"`
	UnrealizedPnL float64          `json:"unrealizedPnL"`
	TotalReturn   float64          `json:"totalReturn"` // Percentage return
}

// GetUserPortfolio gets complete portfolio summary for a user
func (ps *PortfolioService) GetUserPortfolio(userID uint) (*PortfolioSummary, error) {
	// Get or create portfolio
	portfolio, err := ps.getOrCreatePortfolio(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get portfolio: %w", err)
	}

	// Get all positions
	positions, err := ps.getUserPositions(userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get positions: %w", err)
	}

	// Calculate position summaries with P&L
	var positionSummaries []PositionSummary
	var totalMarketValue float64
	var totalUnrealizedPnL float64

	currentPrice := ps.simulationEngine.GetCurrentPrice()

	for _, position := range positions {
		// For now, we only have one symbol in simulation, so use current price
		// In future with multiple symbols, we'd need to get price for each symbol
		positionPrice := currentPrice
		if position.Symbol != ps.getSimulationSymbol() {
			// If position symbol doesn't match simulation symbol, use average price as fallback
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

	// Calculate total portfolio value
	totalValue := portfolio.CashBalance + totalMarketValue

	// Update portfolio total value in database
	portfolio.TotalValue = totalValue
	if err := ps.db.Save(portfolio).Error; err != nil {
		// Log error but don't fail the request
		fmt.Printf("Warning: failed to update portfolio total value: %v\n", err)
	}

	summary := &PortfolioSummary{
		Portfolio:  portfolio,
		Positions:  positionSummaries,
		TotalValue: totalValue,
		TotalPnL:   totalUnrealizedPnL,
	}

	return summary, nil
}

// getOrCreatePortfolio gets or creates a portfolio for the user
func (ps *PortfolioService) getOrCreatePortfolio(userID uint) (*models.Portfolio, error) {
	var portfolio models.Portfolio
	err := ps.db.Where("user_id = ?", userID).First(&portfolio).Error
	
	if err == gorm.ErrRecordNotFound {
		// Create new portfolio with initial funds
		portfolio = models.Portfolio{
			UserID:      userID,
			CashBalance: 10000.0, // Start with $10,000
			TotalValue:  10000.0,
		}
		
		if err := ps.db.Create(&portfolio).Error; err != nil {
			return nil, fmt.Errorf("failed to create portfolio: %w", err)
		}
	} else if err != nil {
		return nil, err
	}
	
	return &portfolio, nil
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

	// Reset portfolio to initial state
	if err := tx.Model(&models.Portfolio{}).Where("user_id = ?", userID).Updates(map[string]interface{}{
		"cash_balance": 10000.0,
		"total_value":  10000.0,
	}).Error; err != nil {
		tx.Rollback()
		return fmt.Errorf("failed to reset portfolio: %w", err)
	}

	return tx.Commit().Error
}