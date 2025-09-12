package models

import (
	"database/sql/driver"
	"encoding/json"
	"fmt"
	"time"
)

type OrderSide string
type OrderType string
type OrderStatus string

const (
	OrderSideBuy  OrderSide = "buy"
	OrderSideSell OrderSide = "sell"
	
	OrderTypeMarket    OrderType = "market"
	OrderTypeLimit     OrderType = "limit"
	OrderTypeStopLimit OrderType = "stop_limit"
	// Future order types: stop_market, take_profit, etc.
	
	OrderStatusPending   OrderStatus = "pending"
	OrderStatusExecuted  OrderStatus = "executed"
	OrderStatusFailed    OrderStatus = "failed"
	OrderStatusCancelled OrderStatus = "cancelled"
)

// Order represents a trading order with flexible type-specific parameters
type Order struct {
	ID           uint        `json:"id" gorm:"primaryKey"`
	UserID       uint        `json:"user_id" gorm:"index;not null;default:1"` // Default to user 1 for now
	SimulationID *uint       `json:"simulation_id" gorm:"index"` // Link to simulation record
	Symbol       string      `json:"symbol" gorm:"not null;index"`
	BaseCurrency string      `json:"base_currency" gorm:"not null;index;default:USDT"`
	Side         OrderSide   `json:"side" gorm:"not null"`
	Type         OrderType   `json:"type" gorm:"not null"`
	Quantity     float64     `json:"quantity" gorm:"not null"`
	Status       OrderStatus `json:"status" gorm:"not null;default:'pending'"`
	PlacedAt     int64       `json:"placed_at" gorm:"not null"` // Simulation time in milliseconds
	ExecutedAt   *int64      `json:"executed_at,omitempty"` // Simulation time in milliseconds
	ExecutedPrice *float64    `json:"executed_price,omitempty"`
	
	// Flexible order parameters stored as JSON for different order types
	OrderParams  OrderParameters `json:"order_params" gorm:"type:json"`
	
	CreatedAt    time.Time   `json:"created_at"`
	UpdatedAt    time.Time   `json:"updated_at"`
}

func (Order) TableName() string {
	return "orders"
}

// OrderParameters contains flexible parameters for different order types
type OrderParameters struct {
	// Limit Order Parameters
	LimitPrice *float64 `json:"limit_price,omitempty"` // Price for limit orders
	
	// Stop Limit Order Parameters
	StopPrice     *float64 `json:"stop_price,omitempty"`     // Trigger price for stop orders
	StopLimitPrice *float64 `json:"stop_limit_price,omitempty"` // Limit price after stop is triggered
	
	// Take Profit / Stop Loss Parameters (future)
	TakeProfitPrice *float64 `json:"take_profit_price,omitempty"` // Take profit trigger price
	StopLossPrice   *float64 `json:"stop_loss_price,omitempty"`   // Stop loss trigger price
	
	// Time in Force Parameters (future)
	TimeInForce   *string `json:"time_in_force,omitempty"`   // GTC, IOC, FOK, etc.
	ExpireTime    *int64  `json:"expire_time,omitempty"`     // Expiration time in milliseconds
	
	// Advanced Parameters (future)
	ReduceOnly    *bool   `json:"reduce_only,omitempty"`     // Reduce position only flag
	PostOnly      *bool   `json:"post_only,omitempty"`       // Post-only flag for makers
	
	// Conditional Parameters (future)
	ParentOrderID *uint   `json:"parent_order_id,omitempty"` // For OCO, bracket orders
	TriggerCondition *string `json:"trigger_condition,omitempty"` // Condition for activation
}

// Scan implements the Scanner interface for GORM
func (op *OrderParameters) Scan(value interface{}) error {
	if value == nil {
		*op = OrderParameters{}
		return nil
	}
	
	bytes, ok := value.([]byte)
	if !ok {
		return fmt.Errorf("cannot scan %T into OrderParameters", value)
	}
	
	if len(bytes) == 0 {
		*op = OrderParameters{}
		return nil
	}
	
	return json.Unmarshal(bytes, op)
}

// Value implements the Valuer interface for GORM
func (op OrderParameters) Value() (driver.Value, error) {
	if op == (OrderParameters{}) {
		return []byte("{}"), nil
	}
	return json.Marshal(op)
}

// Convenience methods for accessing order parameters

// GetLimitPrice returns the limit price for limit orders
func (o *Order) GetLimitPrice() *float64 {
	return o.OrderParams.LimitPrice
}

// SetLimitPrice sets the limit price for limit orders
func (o *Order) SetLimitPrice(price float64) {
	o.OrderParams.LimitPrice = &price
}

// GetStopPrice returns the stop price for stop orders
func (o *Order) GetStopPrice() *float64 {
	return o.OrderParams.StopPrice
}

// SetStopPrice sets the stop price for stop orders
func (o *Order) SetStopPrice(price float64) {
	o.OrderParams.StopPrice = &price
}

// GetStopLimitPrice returns the stop limit price for stop-limit orders
func (o *Order) GetStopLimitPrice() *float64 {
	return o.OrderParams.StopLimitPrice
}

// SetStopLimitPrice sets the stop limit price for stop-limit orders
func (o *Order) SetStopLimitPrice(price float64) {
	o.OrderParams.StopLimitPrice = &price
}

// IsLimitOrder checks if this is a limit order
func (o *Order) IsLimitOrder() bool {
	return o.Type == OrderTypeLimit && o.OrderParams.LimitPrice != nil
}

// IsStopOrder checks if this is a stop order (stop-limit)
func (o *Order) IsStopOrder() bool {
	return o.Type == OrderTypeStopLimit && o.OrderParams.StopPrice != nil
}

// GetEffectivePrice returns the relevant price for order execution
func (o *Order) GetEffectivePrice() *float64 {
	switch o.Type {
	case OrderTypeLimit:
		return o.OrderParams.LimitPrice
	case OrderTypeStopLimit:
		return o.OrderParams.StopLimitPrice
	default:
		return nil // Market orders don't have a preset price
	}
}

// Trade represents an executed trade
type Trade struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	OrderID      uint      `json:"order_id" gorm:"not null;index"`
	UserID       uint      `json:"user_id" gorm:"index;not null;default:1"` // Default to user 1 for now
	SimulationID *uint     `json:"simulation_id" gorm:"index"` // Link to simulation record
	Symbol       string    `json:"symbol" gorm:"not null;index"`
	BaseCurrency string    `json:"base_currency" gorm:"not null;index;default:USDT"`
	Side         OrderSide `json:"side" gorm:"not null"`
	Quantity     float64   `json:"quantity" gorm:"not null"`
	Price        float64   `json:"price" gorm:"not null"`
	Fee          float64   `json:"fee" gorm:"default:0"`
	ExecutedAt   int64     `json:"executed_at" gorm:"not null"` // Simulation time in milliseconds
	CreatedAt    time.Time `json:"created_at"`
	
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
	UserID       uint      `json:"user_id" gorm:"not null;default:1;uniqueIndex:idx_user_symbol_base_sim"`
	SimulationID *uint     `json:"simulation_id" gorm:"index;uniqueIndex:idx_user_symbol_base_sim"` // Link to simulation record
	Symbol       string    `json:"symbol" gorm:"not null;uniqueIndex:idx_user_symbol_base_sim"` // ETH, USDT, etc.
	BaseCurrency string    `json:"base_currency" gorm:"not null;uniqueIndex:idx_user_symbol_base_sim;default:USDT"` // USDT, USD, etc.
	Quantity     float64   `json:"quantity" gorm:"not null;default:0"` // Can be negative for short positions
	AveragePrice float64   `json:"average_price" gorm:"not null;default:0"` // Always 1 for base currency positions
	TotalCost    float64   `json:"total_cost" gorm:"not null;default:0"` // Total cost basis including fees
	UpdatedAt    time.Time `json:"updated_at"`
	CreatedAt    time.Time `json:"created_at"`
}

func (Position) TableName() string {
	return "positions"
}