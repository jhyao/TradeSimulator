package trading

import (
	"fmt"
	"log"

	"tradesimulator/internal/models"
	"tradesimulator/internal/dao/trading"

	"gorm.io/gorm"
)

// FuturesEngine handles futures trading operations
type FuturesEngine struct {
	db          *gorm.DB
	positionDAO trading.PositionDAOInterface
}

// FuturesEngineInterface defines the contract for futures trading operations
type FuturesEngineInterface interface {
	OpenPosition(userID, simulationID uint, symbol string, side models.OrderSide, size, leverage, currentPrice float64) (*models.FuturesPosition, error)
	ClosePosition(userID, simulationID uint, symbol string, side models.OrderSide, size, currentPrice float64) (*models.FuturesPosition, error)
	GetPosition(userID, simulationID uint, symbol, positionSide string) (*models.FuturesPosition, error)
	ValidateMarginRequirement(userID, simulationID uint, requiredMargin float64) error
	UpdatePositionMargin(tx *gorm.DB, userID, simulationID uint, marginDelta float64) error
}

// NewFuturesEngine creates a new futures trading engine
func NewFuturesEngine(db *gorm.DB, positionDAO trading.PositionDAOInterface) FuturesEngineInterface {
	return &FuturesEngine{
		db:          db,
		positionDAO: positionDAO,
	}
}

// OpenPosition opens a new futures position or increases an existing one
func (fe *FuturesEngine) OpenPosition(userID, simulationID uint, symbol string, side models.OrderSide, size, leverage, currentPrice float64) (*models.FuturesPosition, error) {
	if !models.ValidateLeverage(leverage) {
		return nil, fmt.Errorf("invalid leverage: %.2f (must be between 1x and 20x)", leverage)
	}

	// Determine position side
	var positionSide string
	if side == models.OrderSideOpenLong {
		positionSide = "long"
	} else if side == models.OrderSideOpenShort {
		positionSide = "short"
	} else {
		return nil, fmt.Errorf("invalid side for opening position: %s", side)
	}

	// Calculate required margin
	requiredMargin := models.CalculateRequiredMargin(size, currentPrice, leverage)

	// Validate margin requirement
	if err := fe.ValidateMarginRequirement(userID, simulationID, requiredMargin); err != nil {
		return nil, fmt.Errorf("margin validation failed: %w", err)
	}

	// Start transaction
	tx := fe.db.Begin()
	if tx.Error != nil {
		return nil, fmt.Errorf("failed to start transaction: %w", tx.Error)
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Get existing position if any
	var position models.FuturesPosition
	err := tx.Where("user_id = ? AND simulation_id = ? AND symbol = ? AND position_side = ?",
		userID, simulationID, symbol, positionSide).First(&position).Error

	if err != nil && err != gorm.ErrRecordNotFound {
		tx.Rollback()
		return nil, fmt.Errorf("failed to query existing position: %w", err)
	}

	if err == gorm.ErrRecordNotFound {
		// Create new position
		position = models.FuturesPosition{
			UserID:       userID,
			SimulationID: &simulationID,
			Symbol:       symbol,
			BaseCurrency: "USDT",
			PositionSide: positionSide,
			Size:         size,
			EntryPrice:   currentPrice,
			MarginAmount: requiredMargin,
		}

		if err := tx.Create(&position).Error; err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("failed to create new position: %w", err)
		}
	} else {
		// Update existing position (average entry price)
		totalNotional := position.Size*position.EntryPrice + size*currentPrice
		totalSize := position.Size + size
		newEntryPrice := totalNotional / totalSize

		position.Size = totalSize
		position.EntryPrice = newEntryPrice
		position.MarginAmount += requiredMargin

		if err := tx.Save(&position).Error; err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("failed to update existing position: %w", err)
		}
	}

	// Update user's margin balance (reduce available margin)
	if err := fe.UpdatePositionMargin(tx, userID, simulationID, -requiredMargin); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to update margin balance: %w", err)
	}

	// Commit transaction
	if err := tx.Commit().Error; err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Printf("Opened %s position for user %d: %s %.8f at %.8f, margin: %.8f",
		positionSide, userID, symbol, size, currentPrice, requiredMargin)

	return &position, nil
}

// ClosePosition closes an existing futures position or reduces its size
func (fe *FuturesEngine) ClosePosition(userID, simulationID uint, symbol string, side models.OrderSide, size, currentPrice float64) (*models.FuturesPosition, error) {
	// Determine position side to close
	var positionSide string
	if side == models.OrderSideCloseLong {
		positionSide = "long"
	} else if side == models.OrderSideCloseShort {
		positionSide = "short"
	} else {
		return nil, fmt.Errorf("invalid side for closing position: %s", side)
	}

	// Start transaction
	tx := fe.db.Begin()
	if tx.Error != nil {
		return nil, fmt.Errorf("failed to start transaction: %w", tx.Error)
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Get existing position
	var position models.FuturesPosition
	err := tx.Where("user_id = ? AND simulation_id = ? AND symbol = ? AND position_side = ?",
		userID, simulationID, symbol, positionSide).First(&position).Error

	if err == gorm.ErrRecordNotFound {
		tx.Rollback()
		return nil, fmt.Errorf("no %s position found for %s", positionSide, symbol)
	}
	if err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to query position: %w", err)
	}

	// Validate close size
	if size > position.Size {
		tx.Rollback()
		return nil, fmt.Errorf("cannot close %.8f, position size is only %.8f", size, position.Size)
	}

	// Calculate PnL for the closed portion
	pnl := position.CalculatePnL(currentPrice) * (size / position.Size)

	// Calculate margin to release
	marginToRelease := position.MarginAmount * (size / position.Size)

	if size == position.Size {
		// Close entire position
		if err := tx.Delete(&position).Error; err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("failed to delete position: %w", err)
		}
		position.Size = 0
		position.MarginAmount = 0
	} else {
		// Partial close
		position.Size -= size
		position.MarginAmount -= marginToRelease

		if err := tx.Save(&position).Error; err != nil {
			tx.Rollback()
			return nil, fmt.Errorf("failed to update position: %w", err)
		}
	}

	// Update user's margin balance (release margin + PnL)
	marginDelta := marginToRelease + pnl
	if err := fe.UpdatePositionMargin(tx, userID, simulationID, marginDelta); err != nil {
		tx.Rollback()
		return nil, fmt.Errorf("failed to update margin balance: %w", err)
	}

	// Commit transaction
	if err := tx.Commit().Error; err != nil {
		return nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Printf("Closed %s position for user %d: %s %.8f at %.8f, PnL: %.8f, margin released: %.8f",
		positionSide, userID, symbol, size, currentPrice, pnl, marginToRelease)

	return &position, nil
}

// GetPosition retrieves a futures position
func (fe *FuturesEngine) GetPosition(userID, simulationID uint, symbol, positionSide string) (*models.FuturesPosition, error) {
	var position models.FuturesPosition
	err := fe.db.Where("user_id = ? AND simulation_id = ? AND symbol = ? AND position_side = ?",
		userID, simulationID, symbol, positionSide).First(&position).Error

	if err == gorm.ErrRecordNotFound {
		return nil, nil // No position found
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query position: %w", err)
	}

	return &position, nil
}

// ValidateMarginRequirement checks if user has sufficient margin for the operation
func (fe *FuturesEngine) ValidateMarginRequirement(userID, simulationID uint, requiredMargin float64) error {
	// Get user's USDT position (margin balance)
	usdtPosition, err := fe.positionDAO.GetPosition(userID, simulationID, "USDT", "USDT")
	if err != nil && err != gorm.ErrRecordNotFound {
		return fmt.Errorf("failed to check margin balance: %w", err)
	}

	availableMargin := 0.0
	if usdtPosition != nil {
		availableMargin = usdtPosition.Quantity
	}

	if availableMargin < requiredMargin {
		return fmt.Errorf("insufficient margin: required %.8f, available %.8f", requiredMargin, availableMargin)
	}

	return nil
}

// UpdatePositionMargin updates the user's margin balance (USDT position)
func (fe *FuturesEngine) UpdatePositionMargin(tx *gorm.DB, userID, simulationID uint, marginDelta float64) error {
	// Update USDT position with the margin delta
	return fe.positionDAO.UpdateOrCreatePosition(tx, userID, &simulationID, "USDT", "USDT", marginDelta, 1.0, 0)
}