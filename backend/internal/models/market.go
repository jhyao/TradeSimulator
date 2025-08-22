package models

import (
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
	Time   int64   `json:"time"`
	Open   float64 `json:"open"`
	High   float64 `json:"high"`
	Low    float64 `json:"low"`
	Close  float64 `json:"close"`
	Volume float64 `json:"volume"`
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
		Time:   k.OpenTime, // Keep in milliseconds
		Open:   open,
		High:   high,
		Low:    low,
		Close:  close,
		Volume: volume,
	}, nil
}

// HistoricalDataRequest represents request parameters for historical data
type HistoricalDataRequest struct {
	Symbol    string    `json:"symbol" binding:"required"`
	Interval  string    `json:"interval"`
	StartTime *int64    `json:"startTime"`
	EndTime   *int64    `json:"endTime"`
	Limit     *int      `json:"limit"`
}

// HistoricalDataResponse represents the response structure
type HistoricalDataResponse struct {
	Symbol string   `json:"symbol"`
	Data   []OHLCV  `json:"data"`
}

// EarliestTimeResponse represents the response for earliest available time
type EarliestTimeResponse struct {
	Symbol      string `json:"symbol"`
	EarliestTime int64 `json:"earliestTime"`
	EarliestTimeISO string `json:"earliestTimeISO"`
}