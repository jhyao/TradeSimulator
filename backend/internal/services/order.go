package services

import (
	"fmt"
	"log"
	"time"

	"tradesimulator/internal/database"
	"tradesimulator/internal/models"
	"gorm.io/gorm"
)

const (
	DefaultTradingFeeRate = 0.001 // 0.1% flat rate
)

// OrderService handles order placement and execution
type OrderService struct {
	db               *gorm.DB
	simulationEngine *SimulationEngine
	hub              WebSocketHub
}

// NewOrderService creates a new order service
func NewOrderService(simulationEngine *SimulationEngine, hub WebSocketHub) *OrderService {
	return &OrderService{
		db:               database.GetDB(),
		simulationEngine: simulationEngine,
		hub:              hub,
	}
}

// PlaceMarketOrder places a market order and executes it immediately if simulation is running
func (os *OrderService) PlaceMarketOrder(userID uint, symbol string, side models.OrderSide, quantity float64) (*models.Order, *models.Trade, error) {
	// Validate inputs
	if err := os.validateOrder(userID, symbol, side, quantity); err != nil {
		return nil, nil, fmt.Errorf("order validation failed: %w", err)
	}

	// Check if simulation is running and get current price
	if !os.simulationEngine.IsRunning() {
		return nil, nil, fmt.Errorf("simulation not running - cannot place orders")
	}

	currentPrice := os.simulationEngine.GetCurrentPrice()
	if currentPrice <= 0 {
		return nil, nil, fmt.Errorf("invalid current price: %f", currentPrice)
	}

	// Create order record
	order := &models.Order{
		UserID:    userID,
		Symbol:    symbol,
		Side:      side,
		Type:      models.OrderTypeMarket,
		Quantity:  quantity,
		Status:    models.OrderStatusPending,
		PlacedAt:  time.Now(),
	}

	// Start transaction
	tx := os.db.Begin()
	if tx.Error != nil {
		return nil, nil, fmt.Errorf("failed to start transaction: %w", tx.Error)
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Save order
	if err := tx.Create(order).Error; err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to create order: %w", err)
	}

	log.Printf("Created order %d: %s %s %.8f %s at simulation price %.8f", 
		order.ID, string(side), symbol, quantity, string(models.OrderTypeMarket), currentPrice)

	// Broadcast order placed notification
	os.broadcastOrderUpdate("order_placed", order, nil)

	// Execute order immediately (market order)
	trade, err := os.executeOrder(tx, order, currentPrice)
	if err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to execute order: %w", err)
	}

	// Commit transaction
	if err := tx.Commit().Error; err != nil {
		return nil, nil, fmt.Errorf("failed to commit transaction: %w", err)
	}

	log.Printf("Order %d executed successfully, trade %d created", order.ID, trade.ID)

	// Broadcast order executed notification
	os.broadcastOrderUpdate("order_executed", order, trade)

	return order, trade, nil
}

// executeOrder executes an order at the given price within a transaction
func (os *OrderService) executeOrder(tx *gorm.DB, order *models.Order, price float64) (*models.Trade, error) {
	// Calculate fee
	fee := os.calculateFee(order.Quantity, price)
	totalCost := order.Quantity * price
	
	// For buy orders, add fee to total cost
	// For sell orders, subtract fee from proceeds
	var netCashImpact float64
	if order.Side == models.OrderSideBuy {
		netCashImpact = -(totalCost + fee) // Negative because we're spending cash
	} else {
		netCashImpact = totalCost - fee // Positive because we're receiving cash
	}

	// Update portfolio cash balance
	if err := os.updatePortfolioCash(tx, order.UserID, netCashImpact); err != nil {
		return nil, fmt.Errorf("failed to update portfolio cash: %w", err)
	}

	// Update position
	var positionQuantityChange float64
	if order.Side == models.OrderSideBuy {
		positionQuantityChange = order.Quantity
	} else {
		positionQuantityChange = -order.Quantity
	}

	if err := os.updatePosition(tx, order.UserID, order.Symbol, positionQuantityChange, price, fee); err != nil {
		return nil, fmt.Errorf("failed to update position: %w", err)
	}

	// Update order status
	executedAt := time.Now()
	order.Status = models.OrderStatusExecuted
	order.ExecutedAt = &executedAt
	order.ExecutedPrice = &price
	order.Fee = fee

	if err := tx.Save(order).Error; err != nil {
		return nil, fmt.Errorf("failed to update order: %w", err)
	}

	// Create trade record
	trade := &models.Trade{
		OrderID:    order.ID,
		UserID:     order.UserID,
		Symbol:     order.Symbol,
		Side:       order.Side,
		Quantity:   order.Quantity,
		Price:      price,
		Fee:        fee,
		ExecutedAt: executedAt,
	}

	if err := tx.Create(trade).Error; err != nil {
		return nil, fmt.Errorf("failed to create trade: %w", err)
	}

	log.Printf("Executed order %d: %s %s %.8f at %.8f, fee: %.8f, net cash impact: %.8f", 
		order.ID, string(order.Side), order.Symbol, order.Quantity, price, fee, netCashImpact)

	return trade, nil
}

// validateOrder validates order parameters
func (os *OrderService) validateOrder(userID uint, symbol string, side models.OrderSide, quantity float64) error {
	if userID == 0 {
		return fmt.Errorf("invalid user ID")
	}

	if symbol == "" {
		return fmt.Errorf("symbol cannot be empty")
	}

	if side != models.OrderSideBuy && side != models.OrderSideSell {
		return fmt.Errorf("invalid order side: %s", side)
	}

	if quantity <= 0 {
		return fmt.Errorf("quantity must be positive: %f", quantity)
	}

	// Get portfolio to check funds
	portfolio, err := os.getOrCreatePortfolio(userID)
	if err != nil {
		return fmt.Errorf("failed to get portfolio: %w", err)
	}

	// For buy orders, check if user has sufficient cash
	if side == models.OrderSideBuy {
		currentPrice := os.simulationEngine.GetCurrentPrice()
		if currentPrice <= 0 {
			return fmt.Errorf("cannot determine current price")
		}

		totalCost := quantity * currentPrice
		fee := os.calculateFee(quantity, currentPrice)
		requiredCash := totalCost + fee

		if portfolio.CashBalance < requiredCash {
			return fmt.Errorf("insufficient funds: required %.8f, available %.8f", requiredCash, portfolio.CashBalance)
		}
	}

	// For sell orders, check if user has sufficient position
	if side == models.OrderSideSell {
		position, err := os.getPosition(userID, symbol)
		if err != nil && err != gorm.ErrRecordNotFound {
			return fmt.Errorf("failed to check position: %w", err)
		}

		availableQuantity := 0.0
		if position != nil {
			availableQuantity = position.Quantity
		}

		if availableQuantity < quantity {
			return fmt.Errorf("insufficient position: required %.8f, available %.8f", quantity, availableQuantity)
		}
	}

	return nil
}

// calculateFee calculates trading fee
func (os *OrderService) calculateFee(quantity, price float64) float64 {
	return quantity * price * DefaultTradingFeeRate
}

// getOrCreatePortfolio gets or creates a portfolio for the user
func (os *OrderService) getOrCreatePortfolio(userID uint) (*models.Portfolio, error) {
	var portfolio models.Portfolio
	err := os.db.Where("user_id = ?", userID).First(&portfolio).Error
	
	if err == gorm.ErrRecordNotFound {
		// Create new portfolio with initial funds
		portfolio = models.Portfolio{
			UserID:      userID,
			CashBalance: 10000.0, // Start with $10,000
			TotalValue:  10000.0,
		}
		
		if err := os.db.Create(&portfolio).Error; err != nil {
			return nil, fmt.Errorf("failed to create portfolio: %w", err)
		}
		
		log.Printf("Created new portfolio for user %d with initial balance: $%.2f", userID, portfolio.CashBalance)
	} else if err != nil {
		return nil, err
	}
	
	return &portfolio, nil
}

// updatePortfolioCash updates the cash balance in a transaction
func (os *OrderService) updatePortfolioCash(tx *gorm.DB, userID uint, cashChange float64) error {
	return tx.Model(&models.Portfolio{}).
		Where("user_id = ?", userID).
		Update("cash_balance", gorm.Expr("cash_balance + ?", cashChange)).Error
}

// getPosition gets a position for user and symbol
func (os *OrderService) getPosition(userID uint, symbol string) (*models.Position, error) {
	var position models.Position
	err := os.db.Where("user_id = ? AND symbol = ?", userID, symbol).First(&position).Error
	if err != nil {
		return nil, err
	}
	return &position, nil
}

// updatePosition updates or creates a position in a transaction
func (os *OrderService) updatePosition(tx *gorm.DB, userID uint, symbol string, quantityChange, price, fee float64) error {
	var position models.Position
	err := tx.Where("user_id = ? AND symbol = ?", userID, symbol).First(&position).Error

	if err == gorm.ErrRecordNotFound {
		// Create new position
		position = models.Position{
			UserID:       userID,
			Symbol:       symbol,
			Quantity:     quantityChange,
			AveragePrice: price,
			TotalCost:    (quantityChange * price) + fee,
		}
		return tx.Create(&position).Error
	} else if err != nil {
		return err
	} else {
		// Update existing position
		newQuantity := position.Quantity + quantityChange
		
		if newQuantity == 0 {
			// Position closed, delete it
			return tx.Delete(&position).Error
		} else if (position.Quantity > 0 && quantityChange > 0) || (position.Quantity < 0 && quantityChange < 0) {
			// Same direction, update average price
			newTotalCost := position.TotalCost + (quantityChange * price) + fee
			newAveragePrice := newTotalCost / newQuantity
			
			position.Quantity = newQuantity
			position.AveragePrice = newAveragePrice
			position.TotalCost = newTotalCost
		} else {
			// Opposite direction, just update quantity
			position.Quantity = newQuantity
			// Keep existing average price and update total cost proportionally
			position.TotalCost = position.AveragePrice * newQuantity
		}
		
		return tx.Save(&position).Error
	}
}

// broadcastOrderUpdate broadcasts order updates via WebSocket
func (os *OrderService) broadcastOrderUpdate(eventType string, order *models.Order, trade *models.Trade) {
	data := map[string]interface{}{
		"order": order,
	}
	
	if trade != nil {
		data["trade"] = trade
	}
	
	os.hub.BroadcastMessageString(eventType, data)
	log.Printf("Broadcasted %s for order %d", eventType, order.ID)
}

// GetUserOrders gets all orders for a user
func (os *OrderService) GetUserOrders(userID uint, limit int) ([]models.Order, error) {
	var orders []models.Order
	query := os.db.Where("user_id = ?", userID).Order("created_at DESC")
	
	if limit > 0 {
		query = query.Limit(limit)
	}
	
	if err := query.Find(&orders).Error; err != nil {
		return nil, fmt.Errorf("failed to get orders: %w", err)
	}
	
	return orders, nil
}

// GetUserTrades gets all trades for a user
func (os *OrderService) GetUserTrades(userID uint, limit int) ([]models.Trade, error) {
	var trades []models.Trade
	query := os.db.Where("user_id = ?", userID).Order("executed_at DESC")
	
	if limit > 0 {
		query = query.Limit(limit)
	}
	
	if err := query.Find(&trades).Error; err != nil {
		return nil, fmt.Errorf("failed to get trades: %w", err)
	}
	
	return trades, nil
}