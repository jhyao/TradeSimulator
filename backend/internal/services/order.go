package services

import (
	tradingDAO "tradesimulator/internal/dao/trading"
	tradingEngine "tradesimulator/internal/engines/trading"
	"tradesimulator/internal/models"
)

// OrderService handles order orchestration and business logic
type OrderService struct {
	orderDAO       tradingDAO.OrderDAOInterface
	tradeDAO       tradingDAO.TradeDAOInterface
	executionEngine tradingEngine.OrderExecutionEngineInterface
}

// NewOrderService creates a new order service
func NewOrderService(orderDAO tradingDAO.OrderDAOInterface, tradeDAO tradingDAO.TradeDAOInterface, executionEngine tradingEngine.OrderExecutionEngineInterface) *OrderService {
	return &OrderService{
		orderDAO:       orderDAO,
		tradeDAO:       tradeDAO,
		executionEngine: executionEngine,
	}
}

// PlaceMarketOrder places a market order and executes it immediately if simulation is running
func (os *OrderService) PlaceMarketOrder(userID uint, simulationID uint, symbol string, side models.OrderSide, quantity, currentPrice float64, simulationTime int64) (*models.Order, *models.Trade, error) {
	return os.executionEngine.ExecuteMarketOrder(userID, simulationID, symbol, side, quantity, currentPrice, simulationTime)
}

// GetUserOrders gets all orders for a user
func (os *OrderService) GetUserOrders(userID uint, simulationID uint, limit int) ([]models.Order, error) {
	return os.orderDAO.GetUserOrders(userID, simulationID, limit)
}

// GetUserTrades gets all trades for a user  
func (os *OrderService) GetUserTrades(userID uint, simulationID uint, limit int) ([]models.Trade, error) {
	return os.tradeDAO.GetUserTrades(userID, simulationID, limit)
}
