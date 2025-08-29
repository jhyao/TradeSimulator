package models

import (
	"regexp"
	"strconv"
)

// Kline represents a single candlestick/kline data point
type Kline struct {
	OpenTime                 int64  `json:"openTime"`
	Open                     string `json:"open"`
	High                     string `json:"high"`
	Low                      string `json:"low"`
	Close                    string `json:"close"`
	Volume                   string `json:"volume"`
	CloseTime                int64  `json:"closeTime"`
	QuoteAssetVolume         string `json:"quoteAssetVolume"`
	NumberOfTrades           int    `json:"numberOfTrades"`
	TakerBuyBaseAssetVolume  string `json:"takerBuyBaseAssetVolume"`
	TakerBuyQuoteAssetVolume string `json:"takerBuyQuoteAssetVolume"`
}

// OHLCV represents simplified price data for charts
type OHLCV struct {
	StartTime  int64   `json:"startTime"` // Start time of the candle
	EndTime    int64   `json:"endTime"`   // End time of the candle
	Open       float64 `json:"open"`
	High       float64 `json:"high"`
	Low        float64 `json:"low"`
	Close      float64 `json:"close"`
	Volume     float64 `json:"volume"`
	IsComplete bool    `json:"isComplete"` // Whether this candle is complete or partial
}

// ToOHLCV converts a Kline to OHLCV format
func (k *Kline) ToOHLCV() (*OHLCV, error) {
	open, err := strconv.ParseFloat(k.Open, 64)
	if err != nil {
		return nil, err
	}

	high, err := strconv.ParseFloat(k.High, 64)
	if err != nil {
		return nil, err
	}

	low, err := strconv.ParseFloat(k.Low, 64)
	if err != nil {
		return nil, err
	}

	close, err := strconv.ParseFloat(k.Close, 64)
	if err != nil {
		return nil, err
	}

	volume, err := strconv.ParseFloat(k.Volume, 64)
	if err != nil {
		return nil, err
	}

	return &OHLCV{
		StartTime:  k.OpenTime,  // Keep in milliseconds
		EndTime:    k.CloseTime, // Keep in milliseconds
		Open:       open,
		High:       high,
		Low:        low,
		Close:      close,
		Volume:     volume,
		IsComplete: true, // Klines from Binance API are always complete
	}, nil
}

// HistoricalDataRequest represents request parameters for historical data
type HistoricalDataRequest struct {
	Symbol    string `json:"symbol" binding:"required"`
	Interval  string `json:"interval"`
	StartTime *int64 `json:"startTime"`
	EndTime   *int64 `json:"endTime"`
	Limit     *int   `json:"limit"`
}

// HistoricalDataResponse represents the response structure
type HistoricalDataResponse struct {
	Symbol string  `json:"symbol"`
	Data   []OHLCV `json:"data"`
}

// EarliestTimeResponse represents the response for earliest available time
type EarliestTimeResponse struct {
	Symbol          string `json:"symbol"`
	EarliestTime    int64  `json:"earliestTime"`
	EarliestTimeISO string `json:"earliestTimeISO"`
}

// CreateIncompleteCandle creates an incomplete OHLCV from base candles
func CreateIncompleteCandle(startTime int64, targetEndTime int64, interval string, baseCandles []OHLCV) OHLCV {
	if len(baseCandles) == 0 {
		return OHLCV{
			StartTime:  startTime,
			EndTime:    targetEndTime,
			IsComplete: false,
		}
	}

	// Calculate aggregated values
	first := baseCandles[0]
	last := baseCandles[len(baseCandles)-1]

	high := first.High
	low := first.Low
	volume := 0.0

	for _, candle := range baseCandles {
		if candle.High > high {
			high = candle.High
		}
		if candle.Low < low {
			low = candle.Low
		}
		volume += candle.Volume
	}

	return OHLCV{
		StartTime:  startTime,
		EndTime:    targetEndTime,
		Open:       first.Open,
		High:       high,
		Low:        low,
		Close:      last.Close,
		Volume:     volume,
		IsComplete: false,
	}
}

// parseInterval parses interval string and returns duration in milliseconds
func parseInterval(interval string) int64 {
	// Regex to parse intervals like "1m", "5m", "1h", "2h", "1d", "3d", "1w", "1M"
	re := regexp.MustCompile(`^(\d+)([smhdwM])$`)
	matches := re.FindStringSubmatch(interval)

	if len(matches) != 3 {
		return 60 * 1000 // Default to 1m if invalid format
	}

	value, err := strconv.Atoi(matches[1])
	if err != nil {
		return 60 * 1000 // Default to 1m if invalid number
	}

	unit := matches[2]

	switch unit {
	case "s": // seconds
		return int64(value) * 1000
	case "m": // minutes
		return int64(value) * 60 * 1000
	case "h": // hours
		return int64(value) * 60 * 60 * 1000
	case "d": // days
		return int64(value) * 24 * 60 * 60 * 1000
	case "w": // weeks
		return int64(value) * 7 * 24 * 60 * 60 * 1000
	case "M": // months (approximate)
		return int64(value) * 30 * 24 * 60 * 60 * 1000
	default:
		return 60 * 1000 // Default to 1m
	}
}

// GetIntervalDurationMs returns the duration of an interval in milliseconds
func GetIntervalDurationMs(interval string) int64 {
	return parseInterval(interval)
}

// CalculateCandleStartTime calculates the start time of a candle for given timestamp and interval
func CalculateCandleStartTime(timestamp int64, interval string) int64 {
	durationMs := GetIntervalDurationMs(interval)
	return (timestamp / durationMs) * durationMs
}
