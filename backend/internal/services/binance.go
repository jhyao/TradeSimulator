package services

import (
	"context"
	"fmt"
	"sync"
	"time"

	"tradesimulator/internal/models"

	"github.com/adshao/go-binance/v2"
)

// BinanceService wraps the Binance API client
type BinanceService struct {
	client       *binance.Client
	rateLimiter  chan struct{}
	lastRequest  int64 // Last request time in milliseconds
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
		lastRequest: time.Now().UnixMilli(),
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

// GetHistoricalData fetches historical data with optional incomplete candle support
func (b *BinanceService) GetHistoricalData(symbol, interval string, limit int, startTime, endTime *int64, enableIncomplete bool) ([]models.OHLCV, error) {
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

	// Check if we need to create an incomplete last candle (only if enableIncomplete is true)
	if enableIncomplete && endTime != nil && len(ohlcvData) > 0 {
		lastCandle := ohlcvData[len(ohlcvData)-1]

		// If endTime falls within the last candle's time range, create incomplete candle
		if *endTime > lastCandle.StartTime && *endTime < lastCandle.EndTime {
			fmt.Printf("Detected incomplete candle scenario: endTime=%d falls within candle range [%d, %d]\n",
				*endTime, lastCandle.StartTime, lastCandle.EndTime)

			// Calculate the proper candle start time
			candleStartTime := models.CalculateCandleStartTime(*endTime, interval)

			// Get 1m data to build the incomplete candle
			incompleteCandle, err := b.buildIncompleteCandleFromMinuteData(symbol, candleStartTime, *endTime, interval)
			if err != nil {
				fmt.Printf("Warning: failed to build incomplete candle, using original: %v\n", err)
			} else {
				// Replace the last complete candle with the incomplete one
				ohlcvData[len(ohlcvData)-1] = incompleteCandle
				fmt.Printf("Replaced complete candle with incomplete candle: time=%d, endTime=%d, isComplete=%t\n",
					incompleteCandle.StartTime, incompleteCandle.EndTime, incompleteCandle.IsComplete)
			}
		}
	}

	return ohlcvData, nil
}

// buildIncompleteCandleFromMinuteData builds an incomplete candle using 1m data
// Handles large intervals by making multiple API calls if needed
func (b *BinanceService) buildIncompleteCandleFromMinuteData(symbol string, candleStartTime, targetEndTime int64, targetInterval string) (models.OHLCV, error) {
	requiredMinutes := (targetEndTime - candleStartTime) / (60 * 1000)
	fmt.Printf("Building incomplete candle: need %d minutes of 1m data from %d to %d\n",
		requiredMinutes, candleStartTime, targetEndTime)

	var allMinuteData []models.OHLCV
	currentStartTime := candleStartTime
	apiCallCount := 0

	// Make multiple API calls if needed
	for currentStartTime < targetEndTime {
		apiCallCount++

		fmt.Printf("Fetching 1m data batch #%d: starting from %d\n", apiCallCount, currentStartTime)

		// Fetch this batch of 1m data using limit=1000, no endTime
		klines, err := b.GetKlines(symbol, "1m", 1000, &currentStartTime, nil)
		if err != nil {
			return models.OHLCV{}, fmt.Errorf("failed to fetch 1m klines batch for incomplete candle: %w", err)
		}

		if len(klines) == 0 {
			fmt.Printf("No more 1m data available, stopping\n")
			break
		}

		// Convert klines to OHLCV and add to collection
		var lastCandleEndTime int64
		reachedTarget := false

		for _, kline := range klines {
			ohlcv, err := kline.ToOHLCV()
			if err != nil {
				continue
			}

			// Only include data within our target range
			if ohlcv.StartTime >= candleStartTime && ohlcv.StartTime < targetEndTime {
				allMinuteData = append(allMinuteData, *ohlcv)
			}

			lastCandleEndTime = ohlcv.EndTime

			// If we've reached our target time, mark as reached and stop processing
			if ohlcv.StartTime >= targetEndTime {
				reachedTarget = true
				break
			}
		}

		// If we've reached target time, exit the outer loop
		if reachedTarget {
			fmt.Printf("Reached target time %d, stopping data collection\n", targetEndTime)
			break
		}

		// Update currentStartTime for next batch: last candle's endTime + 1
		currentStartTime = lastCandleEndTime + 1

		// If we got less than 1000 candles, we've reached the end of available data
		if len(klines) < 1000 {
			fmt.Printf("Received %d candles (< 1000), reached end of available data\n", len(klines))
			break
		}

		// Add small delay between API calls to respect rate limits
		time.Sleep(100 * time.Millisecond)
	}

	if len(allMinuteData) == 0 {
		return models.OHLCV{}, fmt.Errorf("no 1m data available for incomplete candle")
	}

	// Create incomplete candle from all collected minute data
	incompleteCandle := models.CreateIncompleteCandle(candleStartTime, targetEndTime, targetInterval, allMinuteData)

	fmt.Printf("Built incomplete candle from %d minute candles (across %d API calls): OHLCV=%.2f/%.2f/%.2f/%.2f/%.2f\n",
		len(allMinuteData), apiCallCount,
		incompleteCandle.Open, incompleteCandle.High, incompleteCandle.Low, incompleteCandle.Close, incompleteCandle.Volume)

	return incompleteCandle, nil
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

// GetEarliestAvailableTime fetches the earliest available data point for a symbol
func (b *BinanceService) GetEarliestAvailableTime(symbol string) (int64, error) {
	// Apply rate limiting
	if err := b.waitForRateLimit(); err != nil {
		return 0, fmt.Errorf("rate limit error: %w", err)
	}

	// Validate supported symbols
	if !b.isSupportedSymbol(symbol) {
		return 0, fmt.Errorf("unsupported symbol: %s. Only BTCUSDT and ETHUSDT are supported", symbol)
	}

	// Get the earliest kline data with limit 1 and start time 0
	// This will return the oldest available data point
	klineService := b.client.NewKlinesService().
		Symbol(symbol).
		Interval("1d"). // Use daily interval to get the earliest date
		Limit(1).
		StartTime(0) // Start from epoch to get earliest available data

	// Execute the request with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	klines, err := klineService.Do(ctx)
	if err != nil {
		return 0, fmt.Errorf("failed to fetch earliest kline: %w", err)
	}

	if len(klines) == 0 {
		return 0, fmt.Errorf("no data available for symbol %s", symbol)
	}

	// Return the open time of the first (earliest) kline
	return klines[0].OpenTime, nil
}

// waitForRateLimit implements basic rate limiting
func (b *BinanceService) waitForRateLimit() error {
	b.requestMutex.Lock()
	defer b.requestMutex.Unlock()

	// Wait for at least 100ms between requests
	minIntervalMs := int64(100)
	currentTime := time.Now().UnixMilli()
	elapsed := currentTime - b.lastRequest

	if elapsed < minIntervalMs {
		sleepDuration := time.Duration(minIntervalMs-elapsed) * time.Millisecond
		time.Sleep(sleepDuration)
	}

	b.lastRequest = time.Now().UnixMilli()
	return nil
}
