package trading

import (
	"fmt"
	"log"

	"tradesimulator/internal/models"
	"gorm.io/gorm"
)

// PositionDAO handles database operations for positions
type PositionDAO struct {
	db *gorm.DB
}

// PositionDAOInterface defines the contract for position data access
type PositionDAOInterface interface {
	Create(position *models.Position) error
	Update(position *models.Position) error
	Delete(position *models.Position) error
	GetByID(positionID uint) (*models.Position, error)
	GetUserPositions(userID, simulationID uint) ([]models.Position, error)
	GetPosition(userID, simulationID uint, symbol, baseCurrency string) (*models.Position, error)
	CreateWithTx(tx *gorm.DB, position *models.Position) error
	UpdateWithTx(tx *gorm.DB, position *models.Position) error
	DeleteWithTx(tx *gorm.DB, position *models.Position) error
	GetPositionWithTx(tx *gorm.DB, userID, simulationID uint, symbol, baseCurrency string) (*models.Position, error)
	UpdateOrCreatePosition(tx *gorm.DB, userID uint, simulationID *uint, symbol string, baseCurrency string, quantityChange, price, fee float64) error
	CreateInitialUSDTPosition(userID uint, simulationID *uint, initialFunding float64) error
}

// NewPositionDAO creates a new position DAO instance
func NewPositionDAO(db *gorm.DB) PositionDAOInterface {
	return &PositionDAO{
		db: db,
	}
}

// Create creates a new position record
func (dao *PositionDAO) Create(position *models.Position) error {
	if err := dao.db.Create(position).Error; err != nil {
		return fmt.Errorf("failed to create position: %w", err)
	}
	return nil
}

// Update updates an existing position record
func (dao *PositionDAO) Update(position *models.Position) error {
	if err := dao.db.Save(position).Error; err != nil {
		return fmt.Errorf("failed to update position: %w", err)
	}
	return nil
}

// Delete deletes a position record
func (dao *PositionDAO) Delete(position *models.Position) error {
	if err := dao.db.Delete(position).Error; err != nil {
		return fmt.Errorf("failed to delete position: %w", err)
	}
	return nil
}

// GetByID retrieves a position by ID
func (dao *PositionDAO) GetByID(positionID uint) (*models.Position, error) {
	var position models.Position
	if err := dao.db.First(&position, positionID).Error; err != nil {
		return nil, fmt.Errorf("failed to get position: %w", err)
	}
	return &position, nil
}

// GetUserPositions gets all positions for a user in a specific simulation
func (dao *PositionDAO) GetUserPositions(userID, simulationID uint) ([]models.Position, error) {
	var positions []models.Position
	if err := dao.db.Where("user_id = ? AND simulation_id = ?", userID, simulationID).Find(&positions).Error; err != nil {
		return nil, fmt.Errorf("failed to get user positions: %w", err)
	}
	return positions, nil
}

// GetPosition gets a specific position for user, symbol and base currency
func (dao *PositionDAO) GetPosition(userID, simulationID uint, symbol, baseCurrency string) (*models.Position, error) {
	var position models.Position
	err := dao.db.Where("user_id = ? AND simulation_id = ? AND symbol = ? AND base_currency = ?", userID, simulationID, symbol, baseCurrency).First(&position).Error
	if err != nil {
		return nil, err
	}
	return &position, nil
}

// CreateWithTx creates a new position record within a transaction
func (dao *PositionDAO) CreateWithTx(tx *gorm.DB, position *models.Position) error {
	if err := tx.Create(position).Error; err != nil {
		return fmt.Errorf("failed to create position: %w", err)
	}
	return nil
}

// UpdateWithTx updates an existing position record within a transaction
func (dao *PositionDAO) UpdateWithTx(tx *gorm.DB, position *models.Position) error {
	if err := tx.Save(position).Error; err != nil {
		return fmt.Errorf("failed to update position: %w", err)
	}
	return nil
}

// DeleteWithTx deletes a position record within a transaction
func (dao *PositionDAO) DeleteWithTx(tx *gorm.DB, position *models.Position) error {
	if err := tx.Delete(position).Error; err != nil {
		return fmt.Errorf("failed to delete position: %w", err)
	}
	return nil
}

// GetPositionWithTx gets a position within a transaction
func (dao *PositionDAO) GetPositionWithTx(tx *gorm.DB, userID, simulationID uint, symbol, baseCurrency string) (*models.Position, error) {
	var position models.Position
	err := tx.Where("user_id = ? AND symbol = ? AND base_currency = ? AND simulation_id = ?", userID, symbol, baseCurrency, simulationID).First(&position).Error
	if err != nil {
		return nil, err
	}
	return &position, nil
}

// UpdateOrCreatePosition updates or creates a position within a transaction (extracted from order service)
func (dao *PositionDAO) UpdateOrCreatePosition(tx *gorm.DB, userID uint, simulationID *uint, symbol string, baseCurrency string, quantityChange, price, fee float64) error {
	var position models.Position
	err := tx.Where("user_id = ? AND symbol = ? AND base_currency = ? AND simulation_id = ?", userID, symbol, baseCurrency, simulationID).First(&position).Error

	if err == gorm.ErrRecordNotFound {
		// Create new position
		position = models.Position{
			UserID:       userID,
			SimulationID: simulationID,
			Symbol:       symbol,
			BaseCurrency: baseCurrency,
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
		} else if symbol == "USDT" {
			// For USDT positions, just update quantity (price always 1, no average price calculation needed)
			position.Quantity = newQuantity
			position.TotalCost = newQuantity // For USDT, total cost = quantity since price = 1
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

// CreateInitialUSDTPosition creates an initial USDT position for a new user (extracted from order service)
func (dao *PositionDAO) CreateInitialUSDTPosition(userID uint, simulationID *uint, initialFunding float64) error {
	position := &models.Position{
		UserID:       userID,
		SimulationID: simulationID,
		Symbol:       "USDT",
		BaseCurrency: "USDT",
		Quantity:     initialFunding,
		AveragePrice: 1.0, // USDT always has price = 1
		TotalCost:    initialFunding,
	}

	if err := dao.db.Create(position).Error; err != nil {
		return fmt.Errorf("failed to create initial USDT position: %w", err)
	}

	log.Printf("Created initial USDT position for user %d with balance: $%.2f", userID, position.Quantity)
	return nil
}