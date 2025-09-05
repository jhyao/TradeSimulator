package trading

import (
	"fmt"

	"tradesimulator/internal/models"
	"gorm.io/gorm"
)

// TradeDAO handles database operations for trades
type TradeDAO struct {
	db *gorm.DB
}

// TradeDAOInterface defines the contract for trade data access
type TradeDAOInterface interface {
	Create(trade *models.Trade) error
	GetByID(tradeID uint) (*models.Trade, error)
	GetUserTrades(userID, simulationID uint, limit int) ([]models.Trade, error)
	CreateWithTx(tx *gorm.DB, trade *models.Trade) error
}

// NewTradeDAO creates a new trade DAO instance
func NewTradeDAO(db *gorm.DB) TradeDAOInterface {
	return &TradeDAO{
		db: db,
	}
}

// Create creates a new trade record
func (dao *TradeDAO) Create(trade *models.Trade) error {
	if err := dao.db.Create(trade).Error; err != nil {
		return fmt.Errorf("failed to create trade: %w", err)
	}
	return nil
}

// GetByID retrieves a trade by ID
func (dao *TradeDAO) GetByID(tradeID uint) (*models.Trade, error) {
	var trade models.Trade
	if err := dao.db.First(&trade, tradeID).Error; err != nil {
		return nil, fmt.Errorf("failed to get trade: %w", err)
	}
	return &trade, nil
}

// GetUserTrades gets all trades for a user in a specific simulation
func (dao *TradeDAO) GetUserTrades(userID, simulationID uint, limit int) ([]models.Trade, error) {
	var trades []models.Trade
	query := dao.db.Where("user_id = ? AND simulation_id = ?", userID, simulationID).Order("executed_at DESC")

	if limit > 0 {
		query = query.Limit(limit)
	}

	if err := query.Find(&trades).Error; err != nil {
		return nil, fmt.Errorf("failed to get trades: %w", err)
	}

	return trades, nil
}

// CreateWithTx creates a new trade record within a transaction
func (dao *TradeDAO) CreateWithTx(tx *gorm.DB, trade *models.Trade) error {
	if err := tx.Create(trade).Error; err != nil {
		return fmt.Errorf("failed to create trade: %w", err)
	}
	return nil
}