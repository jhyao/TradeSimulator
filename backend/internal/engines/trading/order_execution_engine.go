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

// OrderExecutionEngine handles core order execution logic and routes to specialized engines
type OrderExecutionEngine struct {
	orderDAO      trading.OrderDAOInterface
	db            *gorm.DB
	orderBook     *OrderBook
	spotEngine    SpotEngineInterface
	futuresEngine FuturesEngineInterface
	client        ClientMessageSender
}

// OrderExecutionEngineInterface defines the contract for order execution
type OrderExecutionEngineInterface interface {
	PlaceOrder(userID, simulationID uint, symbol string, side models.OrderSide, orderType models.OrderType, quantity float64, limitPrice *float64, leverage *float64, currentPrice float64, simulationTime int64) (*models.Order, *models.Trade, error)
	ProcessPriceUpdate(simulationID uint, symbol string, openPrice, highPrice, lowPrice, closePrice float64, simulationTime int64) ([]*models.Trade, error)
	CancelOrder(orderID uint) (*models.Order, error)
	LoadPendingOrders(simulationID uint) error
}

// NewOrderExecutionEngine creates a new order execution engine
func NewOrderExecutionEngine(orderDAO trading.OrderDAOInterface, tradeDAO trading.TradeDAOInterface, positionDAO trading.PositionDAOInterface, client ClientMessageSender, db *gorm.DB) OrderExecutionEngineInterface {
	spotEngine := NewSpotEngine(db, orderDAO, tradeDAO, positionDAO)
	futuresEngine := NewFuturesEngine(db, positionDAO)

	return &OrderExecutionEngine{
		orderDAO:      orderDAO,
		db:            db,
		orderBook:     NewOrderBook(),
		spotEngine:    spotEngine,
		futuresEngine: futuresEngine,
		client:        client,
	}
}

// PlaceOrder is the unified interface for placing any type of order (spot/futures, market/limit)
func (oe *OrderExecutionEngine) PlaceOrder(userID, simulationID uint, symbol string, side models.OrderSide, orderType models.OrderType, quantity float64, limitPrice *float64, leverage *float64, currentPrice float64, simulationTime int64) (*models.Order, *models.Trade, error) {
	// Basic validation
	if userID == 0 {
		return nil, nil, fmt.Errorf("invalid user ID")
	}
	if symbol == "" {
		return nil, nil, fmt.Errorf("symbol cannot be empty")
	}
	if quantity <= 0 {
		return nil, nil, fmt.Errorf("quantity must be positive: %f", quantity)
	}

	// Determine if this is a futures or spot order
	isFuturesOrder := side == models.OrderSideOpenLong || side == models.OrderSideOpenShort ||
		side == models.OrderSideCloseLong || side == models.OrderSideCloseShort

	// Validate order type
	if orderType != models.OrderTypeMarket && orderType != models.OrderTypeLimit {
		return nil, nil, fmt.Errorf("invalid order type: %s", orderType)
	}

	// Validate limit price for limit orders
	if orderType == models.OrderTypeLimit {
		if limitPrice == nil || *limitPrice <= 0 {
			return nil, nil, fmt.Errorf("limit price is required and must be positive for limit orders")
		}
	}

	// Validate leverage for futures orders
	if isFuturesOrder {
		if leverage == nil {
			return nil, nil, fmt.Errorf("leverage is required for futures orders")
		}
		if !models.ValidateLeverage(*leverage) {
			return nil, nil, fmt.Errorf("invalid leverage: %.2f (must be between 1x and 20x)", *leverage)
		}
	}

	// Validate current price for market orders
	if orderType == models.OrderTypeMarket && currentPrice <= 0 {
		return nil, nil, fmt.Errorf("invalid current price: %f", currentPrice)
	}

	// Perform pre-validation based on order type
	priceForValidation := currentPrice
	if orderType == models.OrderTypeLimit && limitPrice != nil {
		priceForValidation = *limitPrice
	}

	if isFuturesOrder {
		// Validate futures order
		if err := oe.futuresEngine.ValidateOrder(userID, simulationID, symbol, side, quantity, *leverage, priceForValidation); err != nil {
			return nil, nil, fmt.Errorf("futures order validation failed: %w", err)
		}
	} else {
		// Validate spot order
		if err := oe.spotEngine.ValidateOrder(userID, simulationID, symbol, side, quantity, priceForValidation); err != nil {
			return nil, nil, fmt.Errorf("spot order validation failed: %w", err)
		}
	}

	// Create order record
	order := &models.Order{
		UserID:       userID,
		SimulationID: &simulationID,
		Symbol:       symbol,
		BaseCurrency: "USDT",
		Side:         side,
		Type:         orderType,
		Quantity:     quantity,
		Status:       models.OrderStatusPending,
		PlacedAt:     simulationTime,
	}

	// Set order parameters
	if limitPrice != nil {
		order.OrderParams.LimitPrice = limitPrice
	}
	if leverage != nil {
		order.OrderParams.Leverage = leverage
	}

	// For market orders, execute immediately
	if orderType == models.OrderTypeMarket {
		return oe.executeMarketOrder(order, currentPrice, simulationTime)
	}

	// For limit orders, save to database and order book
	placedOrder, err := oe.placeLimitOrder(order, simulationTime)
	return placedOrder, nil, err // Limit orders don't have immediate trades
}

// executeMarketOrder executes a market order immediately
func (oe *OrderExecutionEngine) executeMarketOrder(order *models.Order, currentPrice float64, simulationTime int64) (*models.Order, *models.Trade, error) {
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
		order.ID, string(order.Side), order.Symbol, order.Quantity, string(models.OrderTypeMarket), currentPrice)

	// Send order placed notification to client
	oe.sendOrderUpdate(types.OrderPlaced, order, nil)

	// Execute order using appropriate engine
	var trade *models.Trade
	var err error

	if order.IsFuturesOrder() {
		trade, err = oe.futuresEngine.ExecuteOrder(tx, order, currentPrice, simulationTime)
	} else {
		trade, err = oe.spotEngine.ExecuteOrder(tx, order, currentPrice, simulationTime)
	}

	if err != nil {
		// Mark order as failed and commit before rolling back
		order.Status = models.OrderStatusFailed
		if updateErr := oe.orderDAO.UpdateWithTx(tx, order); updateErr != nil {
			log.Printf("Failed to update order status to failed: %v", updateErr)
		}
		// Commit the failed status
		if commitErr := tx.Commit().Error; commitErr != nil {
			log.Printf("Failed to commit failed order status: %v", commitErr)
		}

		// Send order failed notification to client
		oe.sendOrderUpdate(types.OrderFailed, order, nil)

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

// placeLimitOrder places a limit order in the order book
func (oe *OrderExecutionEngine) placeLimitOrder(order *models.Order, simulationTime int64) (*models.Order, error) {
	// Save order to database
	if err := oe.orderDAO.Create(order); err != nil {
		return nil, fmt.Errorf("failed to create limit order: %w", err)
	}

	// Add order to order book for execution tracking
	if err := oe.orderBook.AddOrder(order); err != nil {
		log.Printf("Failed to add order %d to order book: %v", order.ID, err)
		// Don't fail the entire operation if order book add fails
	}

	limitPrice := order.GetLimitPrice()
	if limitPrice != nil {
		log.Printf("Created limit order %d: %s %s %.8f %s at limit price %.8f",
			order.ID, string(order.Side), order.Symbol, order.Quantity, string(models.OrderTypeLimit), *limitPrice)
	}

	// Send order placed notification to client
	oe.sendOrderUpdate(types.OrderPlaced, order, nil)

	return order, nil
}

// ProcessPriceUpdate processes price updates, handles liquidations, and executes limit orders that meet conditions
// Processing order: liquidations first, then limit orders
// Uses high/low prices for more accurate execution:
// - Liquidations: check at low (for longs) and high (for shorts)
// - Sell limit orders execute when high >= limit price
// - Buy limit orders execute when low <= limit price
func (oe *OrderExecutionEngine) ProcessPriceUpdate(simulationID uint, symbol string, openPrice, highPrice, lowPrice, closePrice float64, simulationTime int64) ([]*models.Trade, error) {
	if symbol == "" {
		return nil, fmt.Errorf("symbol cannot be empty")
	}

	if highPrice <= 0 || lowPrice <= 0 || closePrice <= 0 {
		return nil, fmt.Errorf("invalid prices: high=%.8f, low=%.8f, close=%.8f", highPrice, lowPrice, closePrice)
	}

	var allExecutedTrades []*models.Trade

	// STEP 1: Process liquidations first (before limit orders)
	if oe.futuresEngine != nil {
		var userID uint = 1 // Default user ID for simulation

		// Check and execute liquidations if needed (cross margin mode)
		// This method checks liquidation conditions and executes liquidations if triggered
		liquidationTrades, err := oe.futuresEngine.CheckLiquidations(userID, simulationID, symbol, openPrice, highPrice, lowPrice, closePrice, simulationTime)
		if err != nil {
			log.Printf("Error checking/processing liquidations: %v", err)
		}

		// Send WebSocket notifications for all liquidated positions
		if len(liquidationTrades) > 0 {
			log.Printf("Successfully liquidated %d positions", len(liquidationTrades))

			// Send liquidation notifications to client
			for _, trade := range liquidationTrades {
				oe.sendLiquidationNotification(trade)
			}

			allExecutedTrades = append(allExecutedTrades, liquidationTrades...)
		}
	}

	// STEP 2: Process limit orders
	if oe.orderBook == nil {
		log.Printf("Order book not initialized for price update")
		return allExecutedTrades, nil
	}

	// Get orders that should execute using high/low prices from order book
	ordersToExecute := oe.orderBook.GetOrdersToExecute(symbol, highPrice, lowPrice)

	if len(ordersToExecute) == 0 {
		return allExecutedTrades, nil // No orders to execute, return liquidation trades if any
	}

	log.Printf("Processing %d limit orders for %s (high: %.8f, low: %.8f, close: %.8f)", len(ordersToExecute), symbol, highPrice, lowPrice, closePrice)

	for _, order := range ordersToExecute {
		// Start transaction for this order execution
		tx := oe.db.Begin()
		if tx.Error != nil {
			log.Printf("Failed to start transaction for limit order %d: %v", order.ID, tx.Error)
			continue
		}

		// Execute the limit order at its limit price
		var trade *models.Trade
		var err error

		// Get the limit price from the order
		limitPrice := order.GetLimitPrice()
		if limitPrice == nil {
			log.Printf("Limit order %d missing limit price, skipping", order.ID)
			tx.Rollback()
			continue
		}

		executionPrice := *limitPrice

		if order.IsFuturesOrder() {
			trade, err = oe.futuresEngine.ExecuteOrder(tx, order, executionPrice, simulationTime)
		} else {
			trade, err = oe.spotEngine.ExecuteOrder(tx, order, executionPrice, simulationTime)
		}

		if err != nil {
			// Mark order as failed and commit before rolling back
			order.Status = models.OrderStatusFailed
			if updateErr := oe.orderDAO.UpdateWithTx(tx, order); updateErr != nil {
				log.Printf("Failed to update order %d status to failed: %v", order.ID, updateErr)
			}
			// Commit the failed status
			if commitErr := tx.Commit().Error; commitErr != nil {
				log.Printf("Failed to commit failed order %d status: %v", order.ID, commitErr)
			} else {
				log.Printf("Limit order %d marked as failed: %v", order.ID, err)
			}

			// Send order failed notification to client
			oe.sendOrderUpdate(types.OrderFailed, order, nil)

			continue
		}

		// Commit the transaction
		if err := tx.Commit().Error; err != nil {
			log.Printf("Failed to commit transaction for limit order %d: %v", order.ID, err)
			continue
		}

		limitPrice = order.GetLimitPrice()
		if limitPrice != nil {
			log.Printf("Limit order %d executed at limit price %.8f (candle: high=%.8f, low=%.8f, close=%.8f)",
				order.ID, *limitPrice, highPrice, lowPrice, closePrice)
		}

		// Send order executed notification to client
		oe.sendOrderUpdate(types.OrderExecuted, order, trade)

		allExecutedTrades = append(allExecutedTrades, trade)
	}

	return allExecutedTrades, nil
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

// sendLiquidationNotification sends liquidation notification to the client via WebSocket
func (oe *OrderExecutionEngine) sendLiquidationNotification(trade *models.Trade) {
	if oe.client == nil {
		return // No client to send to
	}

	data := map[string]interface{}{
		"trade": trade,
	}

	oe.client.SendMessage(types.PositionLiquidated, data)
	log.Printf("Sent liquidation notification for trade %d", trade.ID)
}
