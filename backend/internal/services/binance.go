package services

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/adshao/go-binance/v2"
	"tradesimulator/internal/models"
)

// BinanceService wraps the Binance API client
type BinanceService struct {
	client       *binance.Client
	rateLimiter  chan struct{}
	lastRequest  time.Time
	requestMutex sync.Mutex
}

// NewBinanceService creates a new Binance service instance
// Note: Using testnet=false for real data, no API keys needed for public data
func NewBinanceService() *BinanceService {
	client := binance.NewClient("", "") // No API key needed for public data
	
	// Create rate limiter - Binance allows 1200 requests per minute for public endpoints
	// We'll be conservative and allow 1 request per 100ms (600 requests per minute)
	rateLimiter := make(chan struct{}, 1)
	rateLimiter <- struct{}{} // Initialize with one token
	
	return &BinanceService{
		client:      client,
		rateLimiter: rateLimiter,
		lastRequest: time.Now(),
	}
}

// GetKlines fetches historical kline data for a symbol
func (b *BinanceService) GetKlines(symbol, interval string, limit int, startTime, endTime *int64) ([]models.Kline, error) {
	// Apply rate limiting
	if err := b.waitForRateLimit(); err != nil {
		return nil, fmt.Errorf("rate limit error: %w", err)
	}

	// Validate supported symbols
	if !b.isSupportedSymbol(symbol) {
		return nil, fmt.Errorf("unsupported symbol: %s. Only BTCUSDT and ETHUSDT are supported", symbol)
	}

	// Create klines service
	klineService := b.client.NewKlinesService().
		Symbol(symbol).
		Interval(interval).
		Limit(limit)

	// Add optional time filters
	if startTime != nil {
		klineService = klineService.StartTime(*startTime)
	}
	if endTime != nil {
		klineService = klineService.EndTime(*endTime)
	}

	// Execute the request with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	klines, err := klineService.Do(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch klines: %w", err)
	}

	// Convert to our model format
	result := make([]models.Kline, len(klines))
	for i, kline := range klines {
		result[i] = models.Kline{
			OpenTime:                 kline.OpenTime,
			Open:                     kline.Open,
			High:                     kline.High,
			Low:                      kline.Low,
			Close:                    kline.Close,
			Volume:                   kline.Volume,
			CloseTime:                kline.CloseTime,
			QuoteAssetVolume:         kline.QuoteAssetVolume,
			NumberOfTrades:           int(kline.TradeNum),
			TakerBuyBaseAssetVolume:  kline.TakerBuyBaseAssetVolume,
			TakerBuyQuoteAssetVolume: kline.TakerBuyQuoteAssetVolume,
		}
	}

	return result, nil
}

// GetHistoricalData fetches historical data and converts to OHLCV format
func (b *BinanceService) GetHistoricalData(symbol, interval string, limit int, startTime, endTime *int64) ([]models.OHLCV, error) {
	klines, err := b.GetKlines(symbol, interval, limit, startTime, endTime)
	if err != nil {
		return nil, err
	}

	// Convert to OHLCV format
	ohlcvData := make([]models.OHLCV, 0, len(klines))
	for _, kline := range klines {
		ohlcv, err := kline.ToOHLCV()
		if err != nil {
			// Log error but continue with other data points
			fmt.Printf("Warning: failed to convert kline to OHLCV: %v\n", err)
			continue
		}
		ohlcvData = append(ohlcvData, *ohlcv)
	}

	return ohlcvData, nil
}

// isSupportedSymbol checks if the symbol is in our supported list
func (b *BinanceService) isSupportedSymbol(symbol string) bool {
	supportedSymbols := map[string]bool{
		"BTCUSDT": true,
		"ETHUSDT": true,
	}
	return supportedSymbols[symbol]
}

// GetSupportedSymbols returns list of supported trading pairs
func (b *BinanceService) GetSupportedSymbols() []string {
	return []string{"BTCUSDT", "ETHUSDT"}
}

// ValidateInterval checks if the interval is valid
func (b *BinanceService) ValidateInterval(interval string) bool {
	validIntervals := map[string]bool{
		"1m":  true,
		"3m":  true,
		"5m":  true,
		"15m": true,
		"30m": true,
		"1h":  true,
		"2h":  true,
		"4h":  true,
		"6h":  true,
		"8h":  true,
		"12h": true,
		"1d":  true,
		"3d":  true,
		"1w":  true,
		"1M":  true,
	}
	return validIntervals[interval]
}

// waitForRateLimit implements basic rate limiting
func (b *BinanceService) waitForRateLimit() error {
	b.requestMutex.Lock()
	defer b.requestMutex.Unlock()

	// Wait for at least 100ms between requests
	minInterval := 100 * time.Millisecond
	elapsed := time.Since(b.lastRequest)
	
	if elapsed < minInterval {
		time.Sleep(minInterval - elapsed)
	}
	
	b.lastRequest = time.Now()
	return nil
}