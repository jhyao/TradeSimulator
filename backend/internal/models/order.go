package models

import (
	"time"
)

type OrderSide string
type OrderType string
type OrderStatus string

const (
	OrderSideBuy  OrderSide = "buy"
	OrderSideSell OrderSide = "sell"
	
	OrderTypeMarket OrderType = "market"
	
	OrderStatusPending   OrderStatus = "pending"
	OrderStatusExecuted  OrderStatus = "executed"
	OrderStatusFailed    OrderStatus = "failed"
	OrderStatusCancelled OrderStatus = "cancelled"
)

// Order represents a trading order
type Order struct {
	ID           uint        `json:"id" gorm:"primaryKey"`
	UserID       uint        `json:"user_id" gorm:"index;not null;default:1"` // Default to user 1 for now
	Symbol       string      `json:"symbol" gorm:"not null;index"`
	BaseCurrency string      `json:"base_currency" gorm:"not null;index;default:USDT"`
	Side         OrderSide   `json:"side" gorm:"not null"`
	Type         OrderType   `json:"type" gorm:"not null"`
	Quantity     float64     `json:"quantity" gorm:"not null"`
	Status       OrderStatus `json:"status" gorm:"not null;default:'pending'"`
	PlacedAt     int64       `json:"placed_at" gorm:"not null"` // Simulation time in milliseconds
	ExecutedAt   *int64      `json:"executed_at,omitempty"` // Simulation time in milliseconds
	ExecutedPrice *float64    `json:"executed_price,omitempty"`
	CreatedAt    time.Time   `json:"created_at"`
	UpdatedAt    time.Time   `json:"updated_at"`
}

func (Order) TableName() string {
	return "orders"
}

// Trade represents an executed trade
type Trade struct {
	ID         uint      `json:"id" gorm:"primaryKey"`
	OrderID    uint      `json:"order_id" gorm:"not null;index"`
	UserID     uint      `json:"user_id" gorm:"index;not null;default:1"` // Default to user 1 for now
	Symbol     string    `json:"symbol" gorm:"not null;index"`
	BaseCurrency string  `json:"base_currency" gorm:"not null;index;default:USDT"`
	Side       OrderSide `json:"side" gorm:"not null"`
	Quantity   float64   `json:"quantity" gorm:"not null"`
	Price      float64   `json:"price" gorm:"not null"`
	Fee        float64   `json:"fee" gorm:"default:0"`
	ExecutedAt int64     `json:"executed_at" gorm:"not null"` // Simulation time in milliseconds
	CreatedAt  time.Time `json:"created_at"`
	
	// Relationships
	Order Order `json:"order,omitempty" gorm:"foreignKey:OrderID;constraint:OnUpdate:CASCADE,OnDelete:CASCADE"`
}

func (Trade) TableName() string {
	return "trades"
}

// Position represents holdings in a specific symbol or base currency (unified model)
// For base currency positions (e.g., USDT), Symbol="USDT", BaseCurrency="USDT", AveragePrice=1
type Position struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	UserID       uint      `json:"user_id" gorm:"not null;default:1;uniqueIndex:idx_user_symbol_base"`
	Symbol       string    `json:"symbol" gorm:"not null;uniqueIndex:idx_user_symbol_base"` // ETH, USDT, etc.
	BaseCurrency string    `json:"base_currency" gorm:"not null;uniqueIndex:idx_user_symbol_base;default:USDT"` // USDT, USD, etc.
	Quantity     float64   `json:"quantity" gorm:"not null;default:0"` // Can be negative for short positions
	AveragePrice float64   `json:"average_price" gorm:"not null;default:0"` // Always 1 for base currency positions
	TotalCost    float64   `json:"total_cost" gorm:"not null;default:0"` // Total cost basis including fees
	UpdatedAt    time.Time `json:"updated_at"`
	CreatedAt    time.Time `json:"created_at"`
}

func (Position) TableName() string {
	return "positions"
}