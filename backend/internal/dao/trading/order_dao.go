package trading

import (
	"fmt"

	"tradesimulator/internal/models"
	"gorm.io/gorm"
)

// OrderDAO handles database operations for orders
type OrderDAO struct {
	db *gorm.DB
}

// OrderDAOInterface defines the contract for order data access
type OrderDAOInterface interface {
	Create(order *models.Order) error
	Update(order *models.Order) error
	GetByID(orderID uint) (*models.Order, error)
	GetUserOrders(userID, simulationID uint, limit int) ([]models.Order, error)
	CreateWithTx(tx *gorm.DB, order *models.Order) error
	UpdateWithTx(tx *gorm.DB, order *models.Order) error
}

// NewOrderDAO creates a new order DAO instance
func NewOrderDAO(db *gorm.DB) OrderDAOInterface {
	return &OrderDAO{
		db: db,
	}
}

// Create creates a new order record
func (dao *OrderDAO) Create(order *models.Order) error {
	if err := dao.db.Create(order).Error; err != nil {
		return fmt.Errorf("failed to create order: %w", err)
	}
	return nil
}

// Update updates an existing order record
func (dao *OrderDAO) Update(order *models.Order) error {
	if err := dao.db.Save(order).Error; err != nil {
		return fmt.Errorf("failed to update order: %w", err)
	}
	return nil
}

// GetByID retrieves an order by ID
func (dao *OrderDAO) GetByID(orderID uint) (*models.Order, error) {
	var order models.Order
	if err := dao.db.First(&order, orderID).Error; err != nil {
		return nil, fmt.Errorf("failed to get order: %w", err)
	}
	return &order, nil
}

// GetUserOrders gets all orders for a user in a specific simulation
func (dao *OrderDAO) GetUserOrders(userID, simulationID uint, limit int) ([]models.Order, error) {
	var orders []models.Order
	query := dao.db.Where("user_id = ? AND simulation_id = ?", userID, simulationID).Order("created_at DESC")

	if limit > 0 {
		query = query.Limit(limit)
	}

	if err := query.Find(&orders).Error; err != nil {
		return nil, fmt.Errorf("failed to get orders: %w", err)
	}

	return orders, nil
}

// CreateWithTx creates a new order record within a transaction
func (dao *OrderDAO) CreateWithTx(tx *gorm.DB, order *models.Order) error {
	if err := tx.Create(order).Error; err != nil {
		return fmt.Errorf("failed to create order: %w", err)
	}
	return nil
}

// UpdateWithTx updates an existing order record within a transaction
func (dao *OrderDAO) UpdateWithTx(tx *gorm.DB, order *models.Order) error {
	if err := tx.Save(order).Error; err != nil {
		return fmt.Errorf("failed to update order: %w", err)
	}
	return nil
}