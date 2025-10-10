package database

import (
	"fmt"
	"log"
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

var DB *gorm.DB

func Connect(databaseURL string) error {
	var err error
	
	config := &gorm.Config{
		Logger: logger.Default.LogMode(logger.Info),
	}

	DB, err = gorm.Open(postgres.Open(databaseURL), config)
	if err != nil {
		return err
	}

	sqlDB, err := DB.DB()
	if err != nil {
		return err
	}

	sqlDB.SetMaxIdleConns(10)
	sqlDB.SetMaxOpenConns(100)
	sqlDB.SetConnMaxLifetime(time.Hour)

	log.Println("Database connected successfully")
	return nil
}

func GetDB() *gorm.DB {
	return DB
}

// AutoMigrate runs database migrations for all models
func AutoMigrate() error {
	if DB == nil {
		return fmt.Errorf("database connection not initialized")
	}

	// Import models here to avoid circular imports
	type User struct {
		ID uint `gorm:"primaryKey"`
		// Add other user fields as needed
	}

	type Simulation struct {
		ID             uint   `gorm:"primaryKey"`
		UserID         uint   `gorm:"index;not null;default:1"`
		Symbol         string `gorm:"not null;index"`
		StartSimTime   int64  `gorm:"not null"`
		EndSimTime     int64  `gorm:"not null"`
		InitialFunding float64
		Mode           string    `gorm:"not null;default:spot"`
		ExtraConfigs   string    `gorm:"type:text"`
		Status         string    `gorm:"not null;default:running"`
		TotalValue     *float64
		CreatedAt      time.Time
		UpdatedAt      time.Time
	}

	type Order struct {
		ID           uint      `gorm:"primaryKey"`
		UserID       uint      `gorm:"index;not null;default:1"`
		SimulationID *uint     `gorm:"index"`
		Symbol       string    `gorm:"not null;index"`
		BaseCurrency string    `gorm:"not null;index;default:USDT"`
		Side         string    `gorm:"not null"`
		Type         string    `gorm:"not null"`
		Quantity     float64   `gorm:"not null"`
		Status       string    `gorm:"not null;default:pending"`
		PlacedAt     int64     `gorm:"not null"`
		ExecutedAt   *int64
		ExecutedPrice *float64
		OrderParams  string    `gorm:"type:json"`
		CreatedAt    time.Time
		UpdatedAt    time.Time
	}

	type Trade struct {
		ID           uint      `gorm:"primaryKey"`
		OrderID      uint      `gorm:"not null;index"`
		UserID       uint      `gorm:"index;not null;default:1"`
		SimulationID *uint     `gorm:"index"`
		Symbol       string    `gorm:"not null;index"`
		BaseCurrency string    `gorm:"not null;index;default:USDT"`
		Side         string    `gorm:"not null"`
		Quantity     float64   `gorm:"not null"`
		Price        float64   `gorm:"not null"`
		Fee          float64   `gorm:"default:0"`
		ExecutedAt   int64     `gorm:"not null"`
		CreatedAt    time.Time
	}

	type Position struct {
		ID           uint      `gorm:"primaryKey"`
		UserID       uint      `gorm:"not null;default:1;uniqueIndex:idx_user_symbol_base_sim"`
		SimulationID *uint     `gorm:"index;uniqueIndex:idx_user_symbol_base_sim"`
		Symbol       string    `gorm:"not null;uniqueIndex:idx_user_symbol_base_sim"`
		BaseCurrency string    `gorm:"not null;uniqueIndex:idx_user_symbol_base_sim;default:USDT"`
		Quantity     float64   `gorm:"not null;default:0"`
		AveragePrice float64   `gorm:"not null;default:0"`
		TotalCost    float64   `gorm:"not null;default:0"`
		UpdatedAt    time.Time
		CreatedAt    time.Time
	}

	type FuturesPosition struct {
		ID           uint      `gorm:"primaryKey"`
		UserID       uint      `gorm:"not null;default:1;uniqueIndex:idx_user_simulation_symbol_side"`
		SimulationID *uint     `gorm:"index;uniqueIndex:idx_user_simulation_symbol_side"`
		Symbol       string    `gorm:"not null;uniqueIndex:idx_user_simulation_symbol_side"`
		BaseCurrency string    `gorm:"not null;default:USDT"`
		PositionSide string    `gorm:"not null;uniqueIndex:idx_user_simulation_symbol_side"`
		Size         float64   `gorm:"not null;default:0"`
		EntryPrice   float64   `gorm:"not null;default:0"`
		MarginAmount float64   `gorm:"not null;default:0"`
		CreatedAt    time.Time
		UpdatedAt    time.Time
	}

	return DB.AutoMigrate(
		&User{},
		&Simulation{},
		&Order{},
		&Trade{},
		&Position{},
		&FuturesPosition{},
	)
}