package market

import (
	"tradesimulator/internal/integrations/binance"
	"tradesimulator/internal/models"
)

// MarketDataService provides market data functionality
type MarketDataService struct {
	binanceClient *binance.BinanceService
}

// MarketDataServiceInterface defines the contract for market data services
type MarketDataServiceInterface interface {
	GetKlines(symbol, interval string, limit int, startTime, endTime *int64) ([]models.Kline, error)
	GetHistoricalData(symbol, interval string, limit int, startTime, endTime *int64, enableIncomplete bool) ([]models.OHLCV, error)
	GetSupportedSymbols() []string
	ValidateInterval(interval string) bool
	GetEarliestAvailableTime(symbol string) (int64, error)
}

// NewMarketDataService creates a new market data service
func NewMarketDataService(binanceClient *binance.BinanceService) MarketDataServiceInterface {
	return &MarketDataService{
		binanceClient: binanceClient,
	}
}

// GetKlines fetches historical kline data for a symbol
func (mds *MarketDataService) GetKlines(symbol, interval string, limit int, startTime, endTime *int64) ([]models.Kline, error) {
	return mds.binanceClient.GetKlines(symbol, interval, limit, startTime, endTime)
}

// GetHistoricalData fetches historical data with optional incomplete candle support
func (mds *MarketDataService) GetHistoricalData(symbol, interval string, limit int, startTime, endTime *int64, enableIncomplete bool) ([]models.OHLCV, error) {
	return mds.binanceClient.GetHistoricalData(symbol, interval, limit, startTime, endTime, enableIncomplete)
}

// GetSupportedSymbols returns list of supported trading pairs
func (mds *MarketDataService) GetSupportedSymbols() []string {
	return mds.binanceClient.GetSupportedSymbols()
}

// ValidateInterval checks if the interval is valid
func (mds *MarketDataService) ValidateInterval(interval string) bool {
	return mds.binanceClient.ValidateInterval(interval)
}

// GetEarliestAvailableTime fetches the earliest available data point for a symbol
func (mds *MarketDataService) GetEarliestAvailableTime(symbol string) (int64, error) {
	return mds.binanceClient.GetEarliestAvailableTime(symbol)
}