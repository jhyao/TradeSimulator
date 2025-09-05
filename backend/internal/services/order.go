package services

import (
	tradingDAO "tradesimulator/internal/dao/trading"
	"tradesimulator/internal/models"
)

// OrderService handles order orchestration and business logic
type OrderService struct {
	orderDAO tradingDAO.OrderDAOInterface
	tradeDAO tradingDAO.TradeDAOInterface
}

// NewOrderService creates a new order service
func NewOrderService(orderDAO tradingDAO.OrderDAOInterface, tradeDAO tradingDAO.TradeDAOInterface) *OrderService {
	return &OrderService{
		orderDAO: orderDAO,
		tradeDAO: tradeDAO,
	}
}

// GetUserOrders gets all orders for a user
func (os *OrderService) GetUserOrders(userID uint, simulationID uint, limit int) ([]models.Order, error) {
	return os.orderDAO.GetUserOrders(userID, simulationID, limit)
}

// GetUserTrades gets all trades for a user
func (os *OrderService) GetUserTrades(userID uint, simulationID uint, limit int) ([]models.Trade, error) {
	return os.tradeDAO.GetUserTrades(userID, simulationID, limit)
}
