package trading

import (
	"fmt"
	"log"

	"tradesimulator/internal/dao/trading"
	"tradesimulator/internal/models"
	"tradesimulator/internal/types"

	"gorm.io/gorm"
)

// ClientMessageSender interface for sending messages to a specific client
type ClientMessageSender interface {
	SendMessage(messageType types.MessageType, data interface{})
	SendError(message string, errorDetails string)
}

const (
	DefaultTradingFeeRate = 0.001 // 0.1% flat rate
)

// OrderExecutionEngine handles core order execution logic
type OrderExecutionEngine struct {
	orderDAO    trading.OrderDAOInterface
	tradeDAO    trading.TradeDAOInterface
	positionDAO trading.PositionDAOInterface
	client      ClientMessageSender
	db          *gorm.DB
	orderBook   *OrderBook
}

// OrderExecutionEngineInterface defines the contract for order execution
type OrderExecutionEngineInterface interface {
	ExecuteMarketOrder(userID, simulationID uint, symbol string, side models.OrderSide, quantity, currentPrice float64, simulationTime int64) (*models.Order, *models.Trade, error)
	PlaceLimitOrder(userID, simulationID uint, symbol string, side models.OrderSide, quantity, limitPrice float64, simulationTime int64) (*models.Order, error)
	ProcessPriceUpdate(symbol string, currentPrice float64, simulationTime int64) ([]*models.Trade, error)
	CancelOrder(orderID uint) (*models.Order, error)
	LoadPendingOrders(simulationID uint) error
	ValidateOrder(userID, simulationID uint, symbol string, side models.OrderSide, quantity, currentPrice float64) error
	ValidateLimitOrder(userID, simulationID uint, symbol string, side models.OrderSide, quantity, limitPrice, currentPrice float64) error
	CalculateFee(quantity, price float64) float64
}

// NewOrderExecutionEngine creates a new order execution engine
func NewOrderExecutionEngine(orderDAO trading.OrderDAOInterface, tradeDAO trading.TradeDAOInterface, positionDAO trading.PositionDAOInterface, client ClientMessageSender, db *gorm.DB) OrderExecutionEngineInterface {
	return &OrderExecutionEngine{
		orderDAO:    orderDAO,
		tradeDAO:    tradeDAO,
		positionDAO: positionDAO,
		client:      client,
		db:          db,
		orderBook:   NewOrderBook(),
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

	// Send order placed notification to client
	oe.sendOrderUpdate(types.OrderPlaced, order, nil)

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

	// Send order executed notification to client
	oe.sendOrderUpdate(types.OrderExecuted, order, trade)

	return order, trade, nil
}

// PlaceLimitOrder places a limit order that will be executed when price conditions are met
func (oe *OrderExecutionEngine) PlaceLimitOrder(userID, simulationID uint, symbol string, side models.OrderSide, quantity, limitPrice float64, simulationTime int64) (*models.Order, error) {
	// Validate inputs
	if err := oe.ValidateLimitOrder(userID, simulationID, symbol, side, quantity, limitPrice, 0); err != nil {
		return nil, fmt.Errorf("limit order validation failed: %w", err)
	}

	// Create limit order record
	order := &models.Order{
		UserID:       userID,
		SimulationID: &simulationID,
		Symbol:       symbol,
		BaseCurrency: "USDT", // Default to USDT for now
		Side:         side,
		Type:         models.OrderTypeLimit,
		Quantity:     quantity,
		Status:       models.OrderStatusPending,
		PlacedAt:     simulationTime,
		OrderParams: models.OrderParameters{
			LimitPrice: &limitPrice,
		},
	}

	// Save order to database
	if err := oe.orderDAO.Create(order); err != nil {
		return nil, fmt.Errorf("failed to create limit order: %w", err)
	}

	// Add order to order book for execution tracking
	if err := oe.orderBook.AddOrder(order); err != nil {
		log.Printf("Failed to add order %d to order book: %v", order.ID, err)
		// Don't fail the entire operation if order book add fails
	}

	log.Printf("Created limit order %d: %s %s %.8f %s at limit price %.8f",
		order.ID, string(side), symbol, quantity, string(models.OrderTypeLimit), limitPrice)

	// Send order placed notification to client
	oe.sendOrderUpdate(types.OrderPlaced, order, nil)

	return order, nil
}

// ProcessPriceUpdate processes price updates and executes limit orders that meet conditions
func (oe *OrderExecutionEngine) ProcessPriceUpdate(symbol string, currentPrice float64, simulationTime int64) ([]*models.Trade, error) {
	if symbol == "" {
		return nil, fmt.Errorf("symbol cannot be empty")
	}
	
	if currentPrice <= 0 {
		return nil, fmt.Errorf("invalid price: %.8f", currentPrice)
	}
	
	if oe.orderBook == nil {
		log.Printf("Order book not initialized for price update")
		return nil, nil
	}
	
	// Get orders that should execute at current price from order book
	ordersToExecute := oe.orderBook.GetOrdersToExecute(symbol, currentPrice)
	
	if len(ordersToExecute) == 0 {
		return nil, nil // No orders to execute
	}
	
	log.Printf("Processing %d limit orders for %s at price %.8f", len(ordersToExecute), symbol, currentPrice)

	var executedTrades []*models.Trade

	for _, order := range ordersToExecute {
		// Start transaction for this order execution
		tx := oe.db.Begin()
		if tx.Error != nil {
			log.Printf("Failed to start transaction for limit order %d: %v", order.ID, tx.Error)
			continue
		}

		// Execute the limit order at current market price
		trade, err := oe.executeOrder(tx, order, currentPrice, simulationTime)
		if err != nil {
			tx.Rollback()
			log.Printf("Failed to execute limit order %d: %v", order.ID, err)
			continue
		}

		// Commit the transaction
		if err := tx.Commit().Error; err != nil {
			log.Printf("Failed to commit transaction for limit order %d: %v", order.ID, err)
			continue
		}

		limitPrice := order.GetLimitPrice()
		if limitPrice != nil {
			log.Printf("Limit order %d executed at price %.8f (limit was %.8f)", 
				order.ID, currentPrice, *limitPrice)
		}

		// Send order executed notification to client
		oe.sendOrderUpdate(types.OrderExecuted, order, trade)
		
		executedTrades = append(executedTrades, trade)
	}

	return executedTrades, nil
}

// CancelOrder cancels a pending limit order
func (oe *OrderExecutionEngine) CancelOrder(orderID uint) (*models.Order, error) {
	// Remove from order book first
	order, err := oe.orderBook.RemoveOrder(orderID)
	if err != nil {
		return nil, fmt.Errorf("failed to remove order from order book: %w", err)
	}

	// Update order status in database
	order.Status = models.OrderStatusCancelled
	if err := oe.orderDAO.Update(order); err != nil {
		// Try to re-add to order book if database update fails
		if addErr := oe.orderBook.AddOrder(order); addErr != nil {
			log.Printf("Failed to re-add order %d to order book after database error: %v", orderID, addErr)
		}
		return nil, fmt.Errorf("failed to update order status in database: %w", err)
	}

	log.Printf("Cancelled limit order %d", orderID)
	
	// Send order cancelled notification to client
	oe.sendOrderUpdate(types.OrderCancelled, order, nil)

	return order, nil
}

// LoadPendingOrders loads pending limit orders from database into order book
func (oe *OrderExecutionEngine) LoadPendingOrders(simulationID uint) error {
	if oe.orderBook == nil {
		return fmt.Errorf("order book not initialized")
	}
	
	if oe.db == nil {
		return fmt.Errorf("database connection not available")
	}
	
	// Get all pending limit orders for the simulation
	var pendingOrders []models.Order
	query := oe.db.Where("type = ? AND status = ?", models.OrderTypeLimit, models.OrderStatusPending)
	if simulationID > 0 {
		query = query.Where("simulation_id = ?", simulationID)
	}
	
	if err := query.Find(&pendingOrders).Error; err != nil {
		return fmt.Errorf("failed to load pending orders from database: %w", err)
	}

	if len(pendingOrders) == 0 {
		log.Printf("No pending limit orders found for simulation %d", simulationID)
		return nil
	}

	// Convert to order pointers
	orderPtrs := make([]*models.Order, len(pendingOrders))
	for i := range pendingOrders {
		orderPtrs[i] = &pendingOrders[i]
	}

	// Load into order book
	if err := oe.orderBook.LoadOrdersFromDatabase(orderPtrs); err != nil {
		return fmt.Errorf("failed to load orders into order book: %w", err)
	}

	log.Printf("Successfully loaded %d pending limit orders for simulation %d", len(pendingOrders), simulationID)
	return nil
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

// ValidateLimitOrder validates limit order parameters
func (oe *OrderExecutionEngine) ValidateLimitOrder(userID, simulationID uint, symbol string, side models.OrderSide, quantity, limitPrice, currentPrice float64) error {
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

	if limitPrice <= 0 {
		return fmt.Errorf("limit price must be positive: %f", limitPrice)
	}

	// For buy orders, check if user has sufficient USDT balance for the limit price
	if side == models.OrderSideBuy {
		totalCost := quantity * limitPrice
		fee := oe.CalculateFee(quantity, limitPrice)
		requiredCash := totalCost + fee

		// Get USDT position to check available balance
		usdtPosition, err := oe.positionDAO.GetPosition(userID, simulationID, "USDT", "USDT")
		if err != nil && err != gorm.ErrRecordNotFound {
			return fmt.Errorf("failed to check USDT balance: %w", err)
		}

		availableCash := 0.0
		if usdtPosition != nil {
			availableCash = usdtPosition.Quantity
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

// sendOrderUpdate sends order updates to the client via WebSocket
func (oe *OrderExecutionEngine) sendOrderUpdate(eventType types.MessageType, order *models.Order, trade *models.Trade) {
	if oe.client == nil {
		return // No client to send to
	}

	data := map[string]interface{}{
		"order": order,
	}

	if trade != nil {
		data["trade"] = trade
	}

	oe.client.SendMessage(eventType, data)
	log.Printf("Sent %s for order %d", eventType, order.ID)
}