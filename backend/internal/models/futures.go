package models

import (
	"math"
	"time"
)

// FuturesPosition represents a futures position for a user
type FuturesPosition struct {
	ID           uint      `json:"id" gorm:"primaryKey"`
	UserID       uint      `json:"user_id" gorm:"not null;default:1;uniqueIndex:idx_user_simulation_symbol_side"`
	SimulationID *uint     `json:"simulation_id" gorm:"index;uniqueIndex:idx_user_simulation_symbol_side"`
	Symbol       string    `json:"symbol" gorm:"not null;uniqueIndex:idx_user_simulation_symbol_side"`
	BaseCurrency string    `json:"base_currency" gorm:"not null;default:USDT"`
	PositionSide string    `json:"position_side" gorm:"not null;uniqueIndex:idx_user_simulation_symbol_side"` // 'long' or 'short'
	Size         float64   `json:"size" gorm:"not null;default:0"`                                         // Position size (always positive)
	EntryPrice   float64   `json:"entry_price" gorm:"not null;default:0"`                                  // Average entry price
	MarginAmount float64   `json:"margin_amount" gorm:"not null;default:0"`                                // Allocated margin for this position
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

func (FuturesPosition) TableName() string {
	return "futures_positions"
}

// CalculatePnL calculates the unrealized profit and loss for the position
func (fp *FuturesPosition) CalculatePnL(currentPrice float64) float64 {
	if fp.Size == 0 {
		return 0
	}

	var pnl float64
	if fp.PositionSide == "long" {
		// For long positions: PnL = (current_price - entry_price) * size
		pnl = (currentPrice - fp.EntryPrice) * fp.Size
	} else {
		// For short positions: PnL = (entry_price - current_price) * size
		pnl = (fp.EntryPrice - currentPrice) * fp.Size
	}

	return pnl
}

// CalculateLiquidationPrice calculates the liquidation price for the position
// Using cross margin mode with a simple liquidation threshold
func (fp *FuturesPosition) CalculateLiquidationPrice(leverage float64) float64 {
	if fp.Size == 0 || leverage <= 0 {
		return 0
	}

	// For cross margin, we use a maintenance margin ratio of 5%
	// Liquidation happens when unrealized loss equals margin - maintenance margin
	maintenanceMarginRatio := 0.05
	maintenanceMargin := fp.MarginAmount * maintenanceMarginRatio
	maxLoss := fp.MarginAmount - maintenanceMargin

	if fp.PositionSide == "long" {
		// For long: liquidation_price = entry_price - (max_loss / size)
		return fp.EntryPrice - (maxLoss / fp.Size)
	} else {
		// For short: liquidation_price = entry_price + (max_loss / size)
		return fp.EntryPrice + (maxLoss / fp.Size)
	}
}

// CalculateMarginRatio calculates the current margin ratio
func (fp *FuturesPosition) CalculateMarginRatio(currentPrice float64) float64 {
	if fp.MarginAmount == 0 {
		return 0
	}

	pnl := fp.CalculatePnL(currentPrice)
	equity := fp.MarginAmount + pnl
	notionalValue := fp.Size * currentPrice

	if notionalValue == 0 {
		return 0
	}

	return equity / notionalValue
}

// IsLiquidated checks if the position should be liquidated at the current price
func (fp *FuturesPosition) IsLiquidated(currentPrice, leverage float64) bool {
	liquidationPrice := fp.CalculateLiquidationPrice(leverage)

	if fp.PositionSide == "long" {
		return currentPrice <= liquidationPrice
	} else {
		return currentPrice >= liquidationPrice
	}
}

// CalculateRequiredMargin calculates the required margin for a given position size and leverage
func CalculateRequiredMargin(size, price, leverage float64) float64 {
	if leverage <= 0 {
		return 0
	}

	notionalValue := size * price
	return notionalValue / leverage
}

// ValidateLeverage checks if the leverage is within acceptable bounds (1x-50x)
func ValidateLeverage(leverage float64) bool {
	return leverage >= 1.0 && leverage <= 50.0
}

// CalculateFuturesFee calculates trading fees for futures orders
// Maker fee: 0.02%, Taker fee: 0.04%
func CalculateFuturesFee(notionalValue float64, isMaker bool) float64 {
	var feeRate float64
	if isMaker {
		feeRate = 0.0002 // 0.02%
	} else {
		feeRate = 0.0004 // 0.04%
	}

	return notionalValue * feeRate
}

// RoundToDecimals rounds a float64 to specified decimal places
func RoundToDecimals(value float64, decimals int) float64 {
	multiplier := math.Pow(10, float64(decimals))
	return math.Round(value*multiplier) / multiplier
}