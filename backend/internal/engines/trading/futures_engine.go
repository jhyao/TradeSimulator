package trading

import (
	"fmt"
	"log"

	"tradesimulator/internal/dao/trading"
	"tradesimulator/internal/models"

	"gorm.io/gorm"
)

// FuturesEngine handles futures trading operations
type FuturesEngine struct {
	db          *gorm.DB
	positionDAO trading.PositionDAOInterface
}

// FuturesEngineInterface defines the contract for futures trading operations
type FuturesEngineInterface interface {
	ExecuteOrder(tx *gorm.DB, order *models.Order, price float64, simulationTime int64) (*models.Trade, error)
	OpenPosition(tx *gorm.DB, userID, simulationID uint, symbol string, side models.OrderSide, size, leverage, currentPrice float64) (*models.FuturesPosition, error)
	ClosePosition(tx *gorm.DB, userID, simulationID uint, symbol string, side models.OrderSide, size, currentPrice float64) (*models.FuturesPosition, error)
	GetPosition(userID, simulationID uint, symbol, positionSide string) (*models.FuturesPosition, error)
	ValidateMarginRequirement(userID, simulationID uint, requiredMargin float64) error
	ValidateOrder(userID, simulationID uint, symbol string, side models.OrderSide, quantity, leverage, price float64) error
	UpdatePositionMargin(tx *gorm.DB, userID, simulationID uint, marginDelta float64) error
}

// NewFuturesEngine creates a new futures trading engine
func NewFuturesEngine(db *gorm.DB, positionDAO trading.PositionDAOInterface) FuturesEngineInterface {
	return &FuturesEngine{
		db:          db,
		positionDAO: positionDAO,
	}
}

// OpenPosition opens a new futures position or increases an existing one within a transaction
func (fe *FuturesEngine) OpenPosition(tx *gorm.DB, userID, simulationID uint, symbol string, side models.OrderSide, size, leverage, currentPrice float64) (*models.FuturesPosition, error) {
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

	// Verify margin requirement within transaction
	usdtPosition, err := fe.positionDAO.GetPositionWithTx(tx, userID, simulationID, "USDT", "USDT")
	if err != nil && err != gorm.ErrRecordNotFound {
		return nil, fmt.Errorf("failed to verify margin balance in transaction: %w", err)
	}

	availableMargin := 0.0
	if usdtPosition != nil {
		availableMargin = usdtPosition.Quantity
	}

	if availableMargin < requiredMargin {
		return nil, fmt.Errorf("insufficient margin in transaction: required %.8f, available %.8f", requiredMargin, availableMargin)
	}

	// Get existing position if any
	var position models.FuturesPosition
	err = tx.Where("user_id = ? AND simulation_id = ? AND symbol = ? AND position_side = ?",
		userID, simulationID, symbol, positionSide).First(&position).Error

	if err != nil && err != gorm.ErrRecordNotFound {
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
			return nil, fmt.Errorf("failed to update existing position: %w", err)
		}
	}

	// Update user's margin balance (reduce available margin)
	if err := fe.UpdatePositionMargin(tx, userID, simulationID, -requiredMargin); err != nil {
		return nil, fmt.Errorf("failed to update margin balance: %w", err)
	}

	log.Printf("Opened %s position for user %d: %s %.8f at %.8f, margin: %.8f",
		positionSide, userID, symbol, size, currentPrice, requiredMargin)

	return &position, nil
}

// ClosePosition closes an existing futures position or reduces its size within a transaction
func (fe *FuturesEngine) ClosePosition(tx *gorm.DB, userID, simulationID uint, symbol string, side models.OrderSide, size, currentPrice float64) (*models.FuturesPosition, error) {
	// Determine position side to close
	var positionSide string
	if side == models.OrderSideCloseLong {
		positionSide = "long"
	} else if side == models.OrderSideCloseShort {
		positionSide = "short"
	} else {
		return nil, fmt.Errorf("invalid side for closing position: %s", side)
	}

	// Get existing position
	var position models.FuturesPosition
	err := tx.Where("user_id = ? AND simulation_id = ? AND symbol = ? AND position_side = ?",
		userID, simulationID, symbol, positionSide).First(&position).Error

	if err == gorm.ErrRecordNotFound {
		return nil, fmt.Errorf("no %s position found for %s", positionSide, symbol)
	}
	if err != nil {
		return nil, fmt.Errorf("failed to query position: %w", err)
	}

	// Validate close size
	if size > position.Size {
		return nil, fmt.Errorf("cannot close %.8f, position size is only %.8f", size, position.Size)
	}

	// Re-verify margin balance for fee payment within transaction
	notionalValue := size * currentPrice
	estimatedFee := models.CalculateFuturesFee(notionalValue, false)

	usdtPosition, err2 := fe.positionDAO.GetPositionWithTx(tx, userID, simulationID, "USDT", "USDT")
	if err2 != nil && err2 != gorm.ErrRecordNotFound {
		return nil, fmt.Errorf("failed to verify margin balance for fee: %w", err2)
	}

	availableMargin := 0.0
	if usdtPosition != nil {
		availableMargin = usdtPosition.Quantity
	}

	// Note: We don't fail the close if fee can't be paid, but we log a warning
	// The PnL might be negative and user might be in margin call, but we still allow position close
	if availableMargin < estimatedFee {
		log.Printf("Warning: User %d has insufficient margin (%.8f) to pay estimated fee (%.8f) when closing position. PnL will be adjusted.", userID, availableMargin, estimatedFee)
	}

	// Calculate PnL for the closed portion
	pnl := position.CalculatePnL(currentPrice) * (size / position.Size)

	// Calculate margin to release
	marginToRelease := position.MarginAmount * (size / position.Size)

	if size == position.Size || (position.Size-size) > -1e-8 && (position.Size-size) < 1e-8 {
		// Close entire position
		if err := tx.Delete(&position).Error; err != nil {
			return nil, fmt.Errorf("failed to delete position: %w", err)
		}
		position.Size = 0
		position.MarginAmount = 0
	} else {
		// Partial close
		position.Size -= size
		position.MarginAmount -= marginToRelease

		if err := tx.Save(&position).Error; err != nil {
			return nil, fmt.Errorf("failed to update position: %w", err)
		}
	}

	// Update user's margin balance (release margin + PnL)
	marginDelta := marginToRelease + pnl
	if err := fe.UpdatePositionMargin(tx, userID, simulationID, marginDelta); err != nil {
		return nil, fmt.Errorf("failed to update margin balance: %w", err)
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
	return fe.positionDAO.UpdateOrCreatePosition(tx, userID, &simulationID, "USDT", "USDT", marginDelta, 1.0)
}

// ExecuteOrder executes a futures market order within a transaction
func (fe *FuturesEngine) ExecuteOrder(tx *gorm.DB, order *models.Order, price float64, simulationTime int64) (*models.Trade, error) {
	leverage := 1.0
	if order.OrderParams.Leverage != nil {
		leverage = *order.OrderParams.Leverage
	}

	// Calculate fee for futures
	notionalValue := order.Quantity * price
	fee := models.CalculateFuturesFee(notionalValue, false) // Assume taker for market orders

	var err error
	var futuresPosition *models.FuturesPosition

	// OpenPosition and ClosePosition now handle validation within transaction
	// Determine if opening or closing position
	if order.Side == models.OrderSideOpenLong || order.Side == models.OrderSideOpenShort {
		// Opening position - validates margin within transaction
		futuresPosition, err = fe.OpenPosition(tx, order.UserID, *order.SimulationID, order.Symbol, order.Side, order.Quantity, leverage, price)
	} else if order.Side == models.OrderSideCloseLong || order.Side == models.OrderSideCloseShort {
		// Closing position - validates position existence and size within transaction
		futuresPosition, err = fe.ClosePosition(tx, order.UserID, *order.SimulationID, order.Symbol, order.Side, order.Quantity, price)
	} else {
		return nil, fmt.Errorf("invalid futures order side: %s", order.Side)
	}

	if err != nil {
		// Return error - caller will mark order as failed
		return nil, fmt.Errorf("failed to execute futures operation: %w", err)
	}

	// Deduct trading fee from user's USDT balance
	if err := fe.UpdatePositionMargin(tx, order.UserID, *order.SimulationID, -fee); err != nil {
		return nil, fmt.Errorf("failed to deduct futures trading fee: %w", err)
	}

	// Update order status
	order.Status = models.OrderStatusExecuted
	order.ExecutedAt = &simulationTime
	order.ExecutedPrice = &price

	if err := tx.Save(order).Error; err != nil {
		return nil, fmt.Errorf("failed to update futures order: %w", err)
	}

	// Create trade record
	trade := &models.Trade{
		OrderID:      order.ID,
		UserID:       order.UserID,
		SimulationID: order.SimulationID,
		Symbol:       order.Symbol,
		BaseCurrency: order.BaseCurrency,
		Side:         order.Side,
		Quantity:     order.Quantity,
		Price:        price,
		Fee:          fee,
		ExecutedAt:   simulationTime,
	}

	if err := tx.Create(trade).Error; err != nil {
		return nil, fmt.Errorf("failed to create futures trade: %w", err)
	}

	log.Printf("Executed futures order %d: %s %s %.8f at %.8f, fee: %.8f, position: %+v",
		order.ID, string(order.Side), order.Symbol, order.Quantity, price, fee, futuresPosition)

	return trade, nil
}

// ValidateOrder validates futures order parameters
func (fe *FuturesEngine) ValidateOrder(userID, simulationID uint, symbol string, side models.OrderSide, quantity, leverage, price float64) error {
	if userID == 0 {
		return fmt.Errorf("invalid user ID")
	}

	if symbol == "" {
		return fmt.Errorf("symbol cannot be empty")
	}

	// Validate side
	if side != models.OrderSideOpenLong && side != models.OrderSideOpenShort &&
		side != models.OrderSideCloseLong && side != models.OrderSideCloseShort {
		return fmt.Errorf("invalid order side for futures trading: %s", side)
	}

	if quantity <= 0 {
		return fmt.Errorf("quantity must be positive: %f", quantity)
	}

	if price <= 0 {
		return fmt.Errorf("price must be positive: %f", price)
	}

	// Validate leverage
	if !models.ValidateLeverage(leverage) {
		return fmt.Errorf("invalid leverage: %.2f (must be between 1x and 20x)", leverage)
	}

	// Determine position side
	var positionSide string
	if side == models.OrderSideOpenLong || side == models.OrderSideCloseLong {
		positionSide = "long"
	} else {
		positionSide = "short"
	}

	// For opening positions, validate margin
	if side == models.OrderSideOpenLong || side == models.OrderSideOpenShort {
		requiredMargin := models.CalculateRequiredMargin(quantity, price, leverage)
		if err := fe.ValidateMarginRequirement(userID, simulationID, requiredMargin); err != nil {
			return fmt.Errorf("margin validation failed: %w", err)
		}
	}

	// For closing positions, validate position exists and has sufficient size
	if side == models.OrderSideCloseLong || side == models.OrderSideCloseShort {
		position, err := fe.GetPosition(userID, simulationID, symbol, positionSide)
		if err != nil {
			return fmt.Errorf("failed to get position: %w", err)
		}
		if position == nil {
			return fmt.Errorf("no %s position found for %s", positionSide, symbol)
		}
		if position.Size < quantity {
			return fmt.Errorf("insufficient position size: required %.8f, available %.8f", quantity, position.Size)
		}
	}

	return nil
}
