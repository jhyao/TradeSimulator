package services

import (
	"fmt"

	"tradesimulator/internal/database"
	"tradesimulator/internal/models"
	"gorm.io/gorm"
)

// PortfolioService handles portfolio and position management
type PortfolioService struct {
	db *gorm.DB
}

// NewPortfolioService creates a new portfolio service
func NewPortfolioService() *PortfolioService {
	return &PortfolioService{
		db: database.GetDB(),
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
func (ps *PortfolioService) GetUserPortfolio(userID uint, simulationID uint, symbol string, currentPrice float64) (*PortfolioSummary, error) {
	// Get all positions for the user
	positions, err := ps.GetUserPositions(userID, simulationID)
	if err != nil {
		return nil, fmt.Errorf("failed to get positions: %w", err)
	}

	// Calculate position summaries with P&L
	var positionSummaries []PositionSummary
	var totalMarketValue float64
	var totalUnrealizedPnL float64
	var cashBalance float64

	for _, position := range positions {
		var positionPrice float64
		
		if position.Symbol == "USDT" {
			// USDT always has price = 1
			positionPrice = 1.0
			cashBalance = position.Quantity
		} else if position.Symbol == symbol {
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



// GetUserPositionsLockFree gets all positions for a user without calling GetStatus (to avoid deadlocks)
func (ps *PortfolioService) GetUserPositions(userID uint, simulationID uint) ([]models.Position, error) {
	var positions []models.Position
	if err := ps.db.Where("user_id = ? AND simulation_id = ?", userID, simulationID).Find(&positions).Error; err != nil {
		return nil, err
	}
	return positions, nil
}


