package trading

import (
	"fmt"
	"log"

	"tradesimulator/internal/dao/trading"
	"tradesimulator/internal/interfaces"
	"tradesimulator/internal/models"

	"gorm.io/gorm"
)

const (
	DefaultTradingFeeRate = 0.001 // 0.1% flat rate
)

// OrderExecutionEngine handles core order execution logic
type OrderExecutionEngine struct {
	orderDAO    trading.OrderDAOInterface
	tradeDAO    trading.TradeDAOInterface
	positionDAO trading.PositionDAOInterface
	hub         interfaces.WebSocketHub
	db          *gorm.DB
}

// OrderExecutionEngineInterface defines the contract for order execution
type OrderExecutionEngineInterface interface {
	ExecuteMarketOrder(userID, simulationID uint, symbol string, side models.OrderSide, quantity, currentPrice float64, simulationTime int64) (*models.Order, *models.Trade, error)
	ValidateOrder(userID, simulationID uint, symbol string, side models.OrderSide, quantity, currentPrice float64) error
	CalculateFee(quantity, price float64) float64
}

// NewOrderExecutionEngine creates a new order execution engine
func NewOrderExecutionEngine(orderDAO trading.OrderDAOInterface, tradeDAO trading.TradeDAOInterface, positionDAO trading.PositionDAOInterface, hub interfaces.WebSocketHub, db *gorm.DB) OrderExecutionEngineInterface {
	return &OrderExecutionEngine{
		orderDAO:    orderDAO,
		tradeDAO:    tradeDAO,
		positionDAO: positionDAO,
		hub:         hub,
		db:          db,
	}
}

// ExecuteMarketOrder executes a market order immediately
func (oe *OrderExecutionEngine) ExecuteMarketOrder(userID, simulationID uint, symbol string, side models.OrderSide, quantity, currentPrice float64, simulationTime int64) (*models.Order, *models.Trade, error) {
	// Validate inputs
	if err := oe.ValidateOrder(userID, simulationID, symbol, side, quantity, currentPrice); err != nil {
		return nil, nil, fmt.Errorf("order validation failed: %w", err)
	}

	if currentPrice <= 0 {
		return nil, nil, fmt.Errorf("invalid current price: %f", currentPrice)
	}

	// Create order record
	order := &models.Order{
		UserID:       userID,
		SimulationID: &simulationID,
		Symbol:       symbol,
		BaseCurrency: "USDT", // Default to USDT for now
		Side:         side,
		Type:         models.OrderTypeMarket,
		Quantity:     quantity,
		Status:       models.OrderStatusPending,
		PlacedAt:     simulationTime,
	}

	// Start transaction
	tx := oe.db.Begin()
	if tx.Error != nil {
		return nil, nil, fmt.Errorf("failed to start transaction: %w", tx.Error)
	}
	defer func() {
		if r := recover(); r != nil {
			tx.Rollback()
		}
	}()

	// Save order
	if err := oe.orderDAO.CreateWithTx(tx, order); err != nil {
		tx.Rollback()
		return nil, nil, fmt.Errorf("failed to create order: %w", err)
	}

	log.Printf("Created order %d: %s %s %.8f %s at simulation price %.8f",
		order.ID, string(side), symbol, quantity, string(models.OrderTypeMarket), currentPrice)

	// Broadcast order placed notification
	oe.broadcastOrderUpdate("order_placed", order, nil)

	// Execute order immediately (market order)
	trade, err := oe.executeOrder(tx, order, currentPrice, simulationTime)
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
	oe.broadcastOrderUpdate("order_executed", order, trade)

	return order, trade, nil
}

// executeOrder executes an order at the given price within a transaction
func (oe *OrderExecutionEngine) executeOrder(tx *gorm.DB, order *models.Order, price float64, simulationTime int64) (*models.Trade, error) {
	// Calculate fee
	fee := oe.CalculateFee(order.Quantity, price)
	totalCost := order.Quantity * price

	// For buy orders, add fee to total cost
	// For sell orders, subtract fee from proceeds
	var netCashImpact float64
	if order.Side == models.OrderSideBuy {
		netCashImpact = -(totalCost + fee) // Negative because we're spending cash
	} else {
		netCashImpact = totalCost - fee // Positive because we're receiving cash
	}

	// Update USDT position (cash)
	if err := oe.positionDAO.UpdateOrCreatePosition(tx, order.UserID, order.SimulationID, "USDT", "USDT", netCashImpact, 1.0, 0); err != nil {
		return nil, fmt.Errorf("failed to update USDT position: %w", err)
	}

	// Update position for the traded symbol
	var positionQuantityChange float64
	if order.Side == models.OrderSideBuy {
		positionQuantityChange = order.Quantity
	} else {
		positionQuantityChange = -order.Quantity
	}

	if err := oe.positionDAO.UpdateOrCreatePosition(tx, order.UserID, order.SimulationID, order.Symbol, order.BaseCurrency, positionQuantityChange, price, fee); err != nil {
		return nil, fmt.Errorf("failed to update position: %w", err)
	}

	// Update order status
	order.Status = models.OrderStatusExecuted
	order.ExecutedAt = &simulationTime
	order.ExecutedPrice = &price

	if err := oe.orderDAO.UpdateWithTx(tx, order); err != nil {
		return nil, fmt.Errorf("failed to update order: %w", err)
	}

	// Create trade record
	trade := &models.Trade{
		OrderID:      order.ID,
		UserID:       order.UserID,
		SimulationID: order.SimulationID, // Use simulation_id from order
		Symbol:       order.Symbol,
		BaseCurrency: order.BaseCurrency,
		Side:         order.Side,
		Quantity:     order.Quantity,
		Price:        price,
		Fee:          fee,
		ExecutedAt:   simulationTime,
	}

	if err := oe.tradeDAO.CreateWithTx(tx, trade); err != nil {
		return nil, fmt.Errorf("failed to create trade: %w", err)
	}

	log.Printf("Executed order %d: %s %s %.8f at %.8f, fee: %.8f, net cash impact: %.8f",
		order.ID, string(order.Side), order.Symbol, order.Quantity, price, fee, netCashImpact)

	return trade, nil
}

// ValidateOrder validates order parameters
func (oe *OrderExecutionEngine) ValidateOrder(userID, simulationID uint, symbol string, side models.OrderSide, quantity, currentPrice float64) error {
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

	// For buy orders, check if user has sufficient USDT balance
	if side == models.OrderSideBuy {
		totalCost := quantity * currentPrice
		fee := oe.CalculateFee(quantity, currentPrice)
		requiredCash := totalCost + fee

		// Get USDT position to check available balance
		usdtPosition, err := oe.positionDAO.GetPosition(userID, simulationID, "USDT", "USDT")
		if err != nil && err != gorm.ErrRecordNotFound {
			return fmt.Errorf("failed to check USDT balance: %w", err)
		}

		availableCash := 0.0
		if usdtPosition != nil {
			availableCash = usdtPosition.Quantity
		} else {
			// Create initial USDT position if it doesn't exist
			if err := oe.positionDAO.CreateInitialUSDTPosition(userID, &simulationID, 10000.0); err != nil {
				return fmt.Errorf("failed to create initial USDT position: %w", err)
			}
			availableCash = 10000.0 // Default initial balance
		}

		if availableCash < requiredCash {
			return fmt.Errorf("insufficient funds: required %.8f, available %.8f", requiredCash, availableCash)
		}
	}

	// For sell orders, check if user has sufficient position
	if side == models.OrderSideSell {
		position, err := oe.positionDAO.GetPosition(userID, simulationID, symbol, "USDT")
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

// CalculateFee calculates trading fee
func (oe *OrderExecutionEngine) CalculateFee(quantity, price float64) float64 {
	return quantity * price * DefaultTradingFeeRate
}

// broadcastOrderUpdate broadcasts order updates via WebSocket
func (oe *OrderExecutionEngine) broadcastOrderUpdate(eventType string, order *models.Order, trade *models.Trade) {
	data := map[string]interface{}{
		"order": order,
	}

	if trade != nil {
		data["trade"] = trade
	}

	oe.hub.BroadcastMessageString(eventType, data)
	log.Printf("Broadcasted %s for order %d", eventType, order.ID)
}