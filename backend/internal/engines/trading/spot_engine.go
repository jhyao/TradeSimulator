package trading

import (
	"fmt"
	"log"

	"tradesimulator/internal/dao/trading"
	"tradesimulator/internal/models"

	"gorm.io/gorm"
)

const (
	DefaultTradingFeeRate = 0.001 // 0.1% flat rate
)

// SpotEngine handles spot trading operations (buy/sell)
type SpotEngine struct {
	db          *gorm.DB
	orderDAO    trading.OrderDAOInterface
	tradeDAO    trading.TradeDAOInterface
	positionDAO trading.PositionDAOInterface
}

// SpotEngineInterface defines the contract for spot trading operations
type SpotEngineInterface interface {
	ExecuteOrder(tx *gorm.DB, order *models.Order, price float64, simulationTime int64) (*models.Trade, error)
	ValidateOrder(userID, simulationID uint, symbol string, side models.OrderSide, quantity, price float64) error
	CalculateFee(quantity, price float64) float64
}

// NewSpotEngine creates a new spot trading engine
func NewSpotEngine(db *gorm.DB, orderDAO trading.OrderDAOInterface, tradeDAO trading.TradeDAOInterface, positionDAO trading.PositionDAOInterface) SpotEngineInterface {
	return &SpotEngine{
		db:          db,
		orderDAO:    orderDAO,
		tradeDAO:    tradeDAO,
		positionDAO: positionDAO,
	}
}

// ExecuteOrder executes a spot market order within a transaction
func (se *SpotEngine) ExecuteOrder(tx *gorm.DB, order *models.Order, price float64, simulationTime int64) (*models.Trade, error) {
	// Calculate fee
	fee := se.CalculateFee(order.Quantity, price)
	totalCost := order.Quantity * price

	// Re-verify cash availability and position within transaction
	if order.Side == models.OrderSideBuy {
		// Check if user has sufficient USDT balance
		requiredCash := totalCost + fee
		usdtPosition, err := se.positionDAO.GetPositionWithTx(tx, order.UserID, *order.SimulationID, "USDT", "USDT")
		if err != nil && err != gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("failed to verify USDT balance: %w", err)
		}

		availableCash := 0.0
		if usdtPosition != nil {
			availableCash = usdtPosition.Quantity
		}

		if availableCash < requiredCash {
			return nil, fmt.Errorf("insufficient funds at execution: required %.8f, available %.8f", requiredCash, availableCash)
		}
	} else if order.Side == models.OrderSideSell {
		// Check if user has sufficient position to sell
		position, err := se.positionDAO.GetPositionWithTx(tx, order.UserID, *order.SimulationID, order.Symbol, "USDT")
		if err != nil && err != gorm.ErrRecordNotFound {
			return nil, fmt.Errorf("failed to verify position: %w", err)
		}

		availableQuantity := 0.0
		if position != nil {
			availableQuantity = position.Quantity
		}

		if availableQuantity < order.Quantity {
			return nil, fmt.Errorf("insufficient position at execution: required %.8f, available %.8f", order.Quantity, availableQuantity)
		}
	}

	// Calculate net cash impact
	var netCashImpact float64
	if order.Side == models.OrderSideBuy {
		netCashImpact = -(totalCost + fee) // Negative because we're spending cash
	} else {
		netCashImpact = totalCost - fee // Positive because we're receiving cash
	}

	// Update USDT position (cash)
	if err := se.positionDAO.UpdateOrCreatePosition(tx, order.UserID, order.SimulationID, "USDT", "USDT", netCashImpact, 1.0); err != nil {
		return nil, fmt.Errorf("failed to update USDT position: %w", err)
	}

	// Update position for the traded symbol
	var positionQuantityChange float64
	if order.Side == models.OrderSideBuy {
		positionQuantityChange = order.Quantity
	} else {
		positionQuantityChange = -order.Quantity
	}

	if err := se.positionDAO.UpdateOrCreatePosition(tx, order.UserID, order.SimulationID, order.Symbol, order.BaseCurrency, positionQuantityChange, price); err != nil {
		return nil, fmt.Errorf("failed to update position: %w", err)
	}

	// Update order status
	order.Status = models.OrderStatusExecuted
	order.ExecutedAt = &simulationTime
	order.ExecutedPrice = &price

	if err := se.orderDAO.UpdateWithTx(tx, order); err != nil {
		return nil, fmt.Errorf("failed to update order: %w", err)
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

	if err := se.tradeDAO.CreateWithTx(tx, trade); err != nil {
		return nil, fmt.Errorf("failed to create trade: %w", err)
	}

	log.Printf("Executed spot order %d: %s %s %.8f at %.8f, fee: %.8f, net cash impact: %.8f",
		order.ID, string(order.Side), order.Symbol, order.Quantity, price, fee, netCashImpact)

	return trade, nil
}

// ValidateOrder validates spot order parameters
func (se *SpotEngine) ValidateOrder(userID, simulationID uint, symbol string, side models.OrderSide, quantity, price float64) error {
	if userID == 0 {
		return fmt.Errorf("invalid user ID")
	}

	if symbol == "" {
		return fmt.Errorf("symbol cannot be empty")
	}

	if side != models.OrderSideBuy && side != models.OrderSideSell {
		return fmt.Errorf("invalid order side for spot trading: %s (must be 'buy' or 'sell')", side)
	}

	if quantity <= 0 {
		return fmt.Errorf("quantity must be positive: %f", quantity)
	}

	if price <= 0 {
		return fmt.Errorf("price must be positive: %f", price)
	}

	// For buy orders, check if user has sufficient USDT balance
	if side == models.OrderSideBuy {
		totalCost := quantity * price
		fee := se.CalculateFee(quantity, price)
		requiredCash := totalCost + fee

		// Get USDT position to check available balance
		usdtPosition, err := se.positionDAO.GetPosition(userID, simulationID, "USDT", "USDT")
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
		position, err := se.positionDAO.GetPosition(userID, simulationID, symbol, "USDT")
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
func (se *SpotEngine) CalculateFee(quantity, price float64) float64 {
	return quantity * price * DefaultTradingFeeRate
}
