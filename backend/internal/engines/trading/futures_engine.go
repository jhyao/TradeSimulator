package trading

import (
	"fmt"
	"log"

	"tradesimulator/internal/dao/trading"
	"tradesimulator/internal/models"

	"gorm.io/gorm"
)

// PositionCache stores cached position data for liquidation checks
type PositionCache struct {
	UserID           uint
	SimulationID     uint
	Positions        []models.FuturesPosition // All positions for this user/simulation
	LiquidationPrice float64                  // Pre-calculated liquidation price
	NetPositionSize  float64                  // Net position size (positive for long, negative for short)
}

// FuturesEngine handles futures trading operations
type FuturesEngine struct {
	db           *gorm.DB
	positionDAO  trading.PositionDAOInterface
	cacheBySimID map[uint]*PositionCache // Cache indexed by simulationID
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
	LiquidatePosition(tx *gorm.DB, position *models.FuturesPosition, liquidationPrice float64, simulationTime int64) (*models.Trade, error)
	CheckLiquidations(userID, simulationID uint, symbol string, openPrice, highPrice, lowPrice, closePrice float64, simulationTime int64) ([]*models.Trade, error)
	LoadPositionCache(userID, simulationID uint) error
}

// NewFuturesEngine creates a new futures trading engine
func NewFuturesEngine(db *gorm.DB, positionDAO trading.PositionDAOInterface) FuturesEngineInterface {
	return &FuturesEngine{
		db:           db,
		positionDAO:  positionDAO,
		cacheBySimID: make(map[uint]*PositionCache),
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

	// Refresh position cache after opening position
	// Note: We use the transaction context to ensure consistency
	fe.refreshCacheAfterTx(tx, userID, simulationID)

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
	marginDelta := marginToRelease + pnl - estimatedFee
	if err := fe.UpdatePositionMargin(tx, userID, simulationID, marginDelta); err != nil {
		return nil, fmt.Errorf("failed to update margin balance: %w", err)
	}

	log.Printf("Closed %s position for user %d: %s %.8f at %.8f, PnL: %.8f, margin released: %.8f",
		positionSide, userID, symbol, size, currentPrice, pnl, marginToRelease)

	// Refresh position cache after closing position
	fe.refreshCacheAfterTx(tx, userID, simulationID)

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

// CheckLiquidations checks all futures positions for liquidation conditions using cross margin mode
// In cross margin, liquidation happens when total account equity falls below maintenance margin requirement
// If liquidation is triggered, this method executes the liquidation for ALL positions and returns the trades
// Uses cached position data to avoid database queries on every price update
// Cache is automatically initialized on first call if not already loaded
func (fe *FuturesEngine) CheckLiquidations(userID, simulationID uint, symbol string, openPrice, highPrice, lowPrice, closePrice float64, simulationTime int64) ([]*models.Trade, error) {
	// Check if we have cached position data
	cache, hasCachedData := fe.cacheBySimID[simulationID]
	if !hasCachedData {
		// Cache not initialized - load it now
		if err := fe.LoadPositionCache(userID, simulationID); err != nil {
			log.Printf("Failed to auto-initialize position cache for simulation %d: %v", simulationID, err)
			return nil, err
		}

		// Check again after loading
		cache, hasCachedData = fe.cacheBySimID[simulationID]
		if !hasCachedData {
			// No positions to liquidate
			return nil, nil
		}
	}

	// Use cached data
	allPositions := cache.Positions
	netPositionSize := cache.NetPositionSize
	liquidationPrice := cache.LiquidationPrice

	log.Printf("Using cached liquidation price: %.8f for simulation %d, net position: %.8f (candle range: %.8f - %.8f)",
		liquidationPrice, simulationID, netPositionSize, lowPrice, highPrice)

	// Step 3: Check if liquidation was triggered during this candle
	// For net long positions: liquidation occurs when price drops to or below liquidation price
	// For net short positions: liquidation occurs when price rises to or above liquidation price
	var shouldLiquidate bool
	var executionPrice float64

	if netPositionSize >= 0 {
		// Net long position - check if low price touched liquidation price
		if lowPrice <= liquidationPrice {
			shouldLiquidate = true
			// Execution price is the worse of liquidation price or open price
			// For long positions, lower is worse
			if openPrice < liquidationPrice {
				executionPrice = openPrice
			} else {
				executionPrice = liquidationPrice
			}
			log.Printf("Net long liquidation triggered: low price %.8f <= liquidation price %.8f, execution price: %.8f (open: %.8f)",
				lowPrice, liquidationPrice, executionPrice, openPrice)
		} else {
			log.Printf("No liquidation: low price %.8f > liquidation price %.8f (net long)",
				lowPrice, liquidationPrice)
		}
	} else if netPositionSize < 0 {
		// Net short position - check if high price touched liquidation price
		if highPrice >= liquidationPrice {
			shouldLiquidate = true
			// Execution price is the worse of liquidation price or open price
			// For short positions, higher is worse
			if openPrice > liquidationPrice {
				executionPrice = openPrice
			} else {
				executionPrice = liquidationPrice
			}
			log.Printf("Net short liquidation triggered: high price %.8f >= liquidation price %.8f, execution price: %.8f (open: %.8f)",
				highPrice, liquidationPrice, executionPrice, openPrice)
		} else {
			log.Printf("No liquidation: high price %.8f < liquidation price %.8f (net short)",
				highPrice, liquidationPrice)
		}
	}

	// Step 4: Execute liquidation if triggered
	if shouldLiquidate {
		var liquidationTrades []*models.Trade
		log.Printf("Liquidating ALL %d positions at price %.8f", len(allPositions), executionPrice)

		for i := range allPositions {
			position := &allPositions[i]

			// Start transaction for this liquidation
			tx := fe.db.Begin()
			if tx.Error != nil {
				log.Printf("Failed to start transaction for liquidation of position %d: %v", position.ID, tx.Error)
				continue
			}

			// Execute liquidation at calculated liquidation price
			trade, err := fe.LiquidatePosition(tx, position, executionPrice, simulationTime)
			if err != nil {
				tx.Rollback()
				log.Printf("Failed to liquidate position %d: %v", position.ID, err)
				continue
			}

			// Commit transaction
			if err := tx.Commit().Error; err != nil {
				log.Printf("Failed to commit liquidation transaction for position %d: %v", position.ID, err)
				continue
			}

			log.Printf("Position %d liquidated successfully at price %.8f", position.ID, executionPrice)
			liquidationTrades = append(liquidationTrades, trade)
		}

		return liquidationTrades, nil
	}

	return nil, nil // No liquidation needed
}

// calculateLiquidationPrice calculates the price at which the account equity becomes zero after liquidation
// This ensures we don't end up with negative balance in the simulation
// Formula: totalFunds + totalPnL - liquidationFee = 0
// Where: totalPnL = netPositionSize * (price - avgEntryPrice)
//
//	liquidationFee = 0.005 * |netPositionSize| * price
func (fe *FuturesEngine) calculateLiquidationPrice(positions []models.FuturesPosition, availableMargin float64) float64 {
	// Calculate net position size and weighted values
	var netPositionSize float64
	var longValue float64  // Sum of (size * entry_price) for long positions
	var shortValue float64 // Sum of (size * entry_price) for short positions

	for _, pos := range positions {
		if pos.PositionSide == "long" {
			netPositionSize += pos.Size
			longValue += pos.Size * pos.EntryPrice
		} else {
			netPositionSize -= pos.Size
			shortValue += pos.Size * pos.EntryPrice
		}
		availableMargin += pos.MarginAmount
	}

	// Calculate liquidation price based on net position direction
	// Liquidation occurs when: availableMargin + PnL - liquidationFee = 0
	var liquidationPrice float64
	absNetSize := netPositionSize
	if absNetSize < 0 {
		absNetSize = -absNetSize
	}

	if netPositionSize > 0 {
		// Net long position
		// PnL = netSize * (price - avgEntryPrice) = netSize * price - longValue + shortValue
		// Fee = 0.005 * netSize * price
		// Equation: availableMargin + netSize * price - longValue + shortValue - 0.005 * netSize * price = 0
		// Solving for price: price = (longValue - shortValue - availableMargin) / (netSize * 0.995)
		liquidationPrice = (longValue - shortValue - availableMargin) / (netPositionSize * 0.995)
	} else if netPositionSize < 0 {
		// Net short position
		// PnL = netSize * (avgEntryPrice - price) = -netSize * price + longValue - shortValue
		// Fee = 0.005 * |netSize| * price
		// Equation: availableMargin - absNetSize * price + longValue - shortValue - 0.005 * absNetSize * price = 0
		// Solving for price: price = (availableMargin + longValue - shortValue) / (absNetSize * 1.005)
		liquidationPrice = (availableMargin + longValue - shortValue) / (absNetSize * 1.005)
	} else {
		// No net position - should not happen, return a safe default
		liquidationPrice = 0
	}

	log.Printf("Calculated liquidation price: %.8f (net position: %.8f, available margin: %.8f, long value: %.8f, short value: %.8f)",
		liquidationPrice, netPositionSize, availableMargin, longValue, shortValue)

	return liquidationPrice
}

// LoadPositionCache loads positions from database and initializes the cache for a simulation
func (fe *FuturesEngine) LoadPositionCache(userID, simulationID uint) error {
	// Query all futures positions for this user/simulation
	var positions []models.FuturesPosition
	err := fe.db.Where("user_id = ? AND simulation_id = ?", userID, simulationID).Find(&positions).Error
	if err != nil {
		return fmt.Errorf("failed to load positions for cache: %w", err)
	}

	// Get available margin (USDT balance)
	usdtPosition, err := fe.positionDAO.GetPosition(userID, simulationID, "USDT", "USDT")
	if err != nil && err != gorm.ErrRecordNotFound {
		return fmt.Errorf("failed to get USDT balance for cache: %w", err)
	}

	availableMargin := 0.0
	if usdtPosition != nil {
		availableMargin = usdtPosition.Quantity
	}

	// Update cache
	fe.updatePositionCache(userID, simulationID, positions, availableMargin)

	log.Printf("Loaded position cache for simulation %d: %d positions, liquidation price: %.8f",
		simulationID, len(positions), fe.cacheBySimID[simulationID].LiquidationPrice)

	return nil
}

// updatePositionCache updates the cached positions and recalculates liquidation price
func (fe *FuturesEngine) updatePositionCache(userID, simulationID uint, positions []models.FuturesPosition, availableMargin float64) {
	if len(positions) == 0 {
		// Clear cache if no positions
		fe.cacheBySimID[simulationID] = &PositionCache{
			UserID:           userID,
			SimulationID:     simulationID,
			Positions:        []models.FuturesPosition{},
			LiquidationPrice: 0,
			NetPositionSize:  0,
		}
		return
	}

	// Calculate net position size
	var netPositionSize float64
	for _, pos := range positions {
		if pos.PositionSide == "long" {
			netPositionSize += pos.Size
		} else {
			netPositionSize -= pos.Size
		}
	}

	// Calculate liquidation price
	liquidationPrice := fe.calculateLiquidationPrice(positions, availableMargin)

	// Store in cache
	fe.cacheBySimID[simulationID] = &PositionCache{
		UserID:           userID,
		SimulationID:     simulationID,
		Positions:        positions,
		LiquidationPrice: liquidationPrice,
		NetPositionSize:  netPositionSize,
	}
}

// refreshCacheAfterTx refreshes the position cache after a transaction modifies positions
func (fe *FuturesEngine) refreshCacheAfterTx(tx *gorm.DB, userID, simulationID uint) {
	// Query all futures positions within transaction
	var positions []models.FuturesPosition
	if err := tx.Where("user_id = ? AND simulation_id = ?", userID, simulationID).Find(&positions).Error; err != nil {
		log.Printf("Failed to refresh position cache: %v", err)
		return
	}

	// Get USDT balance within transaction
	usdtPosition, err := fe.positionDAO.GetPositionWithTx(tx, userID, simulationID, "USDT", "USDT")
	if err != nil && err != gorm.ErrRecordNotFound {
		log.Printf("Failed to get USDT balance for cache refresh: %v", err)
		return
	}

	availableMargin := 0.0
	if usdtPosition != nil {
		availableMargin = usdtPosition.Quantity
	}

	// Update cache
	fe.updatePositionCache(userID, simulationID, positions, availableMargin)

	if cache, ok := fe.cacheBySimID[simulationID]; ok {
		log.Printf("Refreshed cache for simulation %d: %d positions, net: %.8f, liq price: %.8f",
			simulationID, len(cache.Positions), cache.NetPositionSize, cache.LiquidationPrice)
	} else {
		log.Printf("Cleared cache for simulation %d (no positions)", simulationID)
	}
}

// LiquidatePosition force-closes a position due to cross margin liquidation
// In cross margin mode, positions are closed at current market price
func (fe *FuturesEngine) LiquidatePosition(tx *gorm.DB, position *models.FuturesPosition, executePrice float64, simulationTime int64) (*models.Trade, error) {
	if position == nil {
		return nil, fmt.Errorf("position cannot be nil")
	}

	userID := position.UserID
	simulationID := *position.SimulationID
	symbol := position.Symbol
	positionSide := position.PositionSide
	size := position.Size

	log.Printf("Liquidating %s position %d for user %d: %s %.8f at market price %.8f (entry: %.8f)",
		positionSide, position.ID, userID, symbol, size, executePrice, position.EntryPrice)

	// Calculate PnL at current market price
	pnl := position.CalculatePnL(executePrice)

	// Liquidation fee
	notionalValue := size * executePrice
	liquidationFee := models.CalculateFuturesFee(notionalValue, false)

	// Delete the position (full liquidation)
	if err := tx.Delete(position).Error; err != nil {
		return nil, fmt.Errorf("failed to delete liquidated position: %w", err)
	}

	// In cross margin liquidation:
	// - Position margin was already allocated from USDT balance
	// - We return: position margin + PnL - liquidation fee
	// - This updates the total account equity
	marginDelta := position.MarginAmount + pnl - liquidationFee
	if err := fe.UpdatePositionMargin(tx, userID, simulationID, marginDelta); err != nil {
		return nil, fmt.Errorf("failed to update margin balance after liquidation: %w", err)
	}

	// Create liquidation trade record
	// Use the opposite side to represent closing the position
	var tradeSide models.OrderSide
	if positionSide == "long" {
		tradeSide = models.OrderSideCloseLong
	} else {
		tradeSide = models.OrderSideCloseShort
	}

	trade := &models.Trade{
		OrderID:      0, // No order for liquidations
		UserID:       userID,
		SimulationID: &simulationID,
		Symbol:       symbol,
		BaseCurrency: "USDT",
		Side:         tradeSide,
		Quantity:     size,
		Price:        executePrice,
		Fee:          liquidationFee,
		ExecutedAt:   simulationTime,
	}

	if err := tx.Create(trade).Error; err != nil {
		return nil, fmt.Errorf("failed to create liquidation trade record: %w", err)
	}

	log.Printf("Cross margin liquidation executed: user %d, %s %s, size: %.8f, price: %.8f, PnL: %.8f, fee: %.8f, margin returned: %.8f",
		userID, symbol, positionSide, size, executePrice, pnl, liquidationFee, marginDelta)

	// Refresh position cache after liquidation (will clear if no positions left)
	fe.refreshCacheAfterTx(tx, userID, simulationID)

	return trade, nil
}
