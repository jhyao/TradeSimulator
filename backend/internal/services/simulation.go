package services

import (
	"context"
	"fmt"
	"log"
	"sync"
	"time"

	"tradesimulator/internal/models"
)

// WebSocketHub interface to avoid import cycles
type WebSocketHub interface {
	BroadcastMessageString(msgType string, data interface{})
}

type SimulationState string

const (
	StateStopped SimulationState = "stopped"
	StatePlaying SimulationState = "playing"
	StatePaused  SimulationState = "paused"
)

type SimulationEngine struct {
	mu             sync.RWMutex
	state          SimulationState
	speed          int // 1, 5, 10, 60, 120, 300, etc.
	currentIndex   int // Position in baseDataset
	tickerInterval time.Duration
	ticker         *time.Ticker // Controls replay speed
	hub            WebSocketHub // WebSocket broadcasting
	symbol         string
	interval       string
	stopChan       chan struct{}
	startTime      int64 // Start time in milliseconds
	ctx            context.Context
	cancel         context.CancelFunc
	binanceService *BinanceService

	// Base data streaming support
	baseInterval      string         // Optimal base interval (1m, 5m, etc.)
	baseDataset       []models.OHLCV // Base interval historical data
	currentSimTime    int64          // Current simulation time in milliseconds
	lastCandleEndTime int64          // Last candle time processed in milliseconds

	// Dynamic change channels
	speedChangeChan     chan int    // For dynamic speed changes
	timeframeChangeChan chan string // For dynamic timeframe changes

	// Continuous data loading
	dataLoadThreshold float64   // Threshold (0.0-1.0) to trigger data loading
	maxBufferSize     int       // Maximum number of candles to keep in memory
	isLoadingData     bool      // Flag to prevent concurrent loading
	dataLoadChan      chan bool // Channel to signal successful data load
	lastDataLoadTime  int64     // Last timestamp of loaded data in milliseconds
}

type SimulationUpdateData struct {
	Symbol         string       `json:"symbol"`
	BaseCandle     models.OHLCV `json:"baseCandle"` // Single complete base candle
	SimulationTime string       `json:"simulationTime"`
	Progress       float64      `json:"progress"` // 0-100%
	State          string       `json:"state"`
	Speed          int          `json:"speed"`
}

type SimulationStatus struct {
	State        string  `json:"state"`
	Symbol       string  `json:"symbol"`
	Interval     string  `json:"interval"`
	Speed        int     `json:"speed"`
	CurrentIndex int     `json:"currentIndex"`
	TotalCandles int     `json:"totalCandles"`
	Progress     float64 `json:"progress"`
	StartTime    string  `json:"startTime"`
	CurrentTime  string  `json:"currentTime"`
	CurrentPrice float64 `json:"currentPrice"`
}

func NewSimulationEngine(hub WebSocketHub, binanceService *BinanceService) *SimulationEngine {
	ctx, cancel := context.WithCancel(context.Background())

	return &SimulationEngine{
		state:               StateStopped,
		speed:               1,
		hub:                 hub,
		stopChan:            make(chan struct{}),
		ctx:                 ctx,
		cancel:              cancel,
		binanceService:      binanceService,
		speedChangeChan:     make(chan int, 1),
		timeframeChangeChan: make(chan string, 1),
		dataLoadThreshold:   0.8,  // Load more data when 80% consumed
		maxBufferSize:       5000, // Keep max 5000 candles in memory
		dataLoadChan:        make(chan bool, 1),
	}
}

func (se *SimulationEngine) Start(symbol, interval string, startTime int64, speed int, initialFunding float64, portfolioService *PortfolioService) error {
	se.mu.Lock()
	defer se.mu.Unlock()

	if se.state != StateStopped {
		return fmt.Errorf("simulation already running")
	}

	// Validate speed (allow any positive integer)
	if speed <= 0 {
		return fmt.Errorf("invalid speed: %d, must be positive", speed)
	}

	// Validate timeframe is compatible with speed
	if !se.isTimeframeAllowed(interval, speed) {
		minAllowed := se.getMinAllowedTimeframe(speed)
		return fmt.Errorf("timeframe %s not allowed at %dx speed. Use %s or higher", interval, speed, minAllowed)
	}

	// Determine optimal base interval for progressive updates
	se.symbol = symbol
	se.interval = interval
	se.speed = speed
	se.baseInterval = se.getOptimalBaseInterval()

	// Load base interval dataset for progressive candle building
	baseDataset, err := se.loadHistoricalDataset(symbol, se.baseInterval, startTime)
	if err != nil {
		return fmt.Errorf("failed to load base dataset: %w", err)
	}

	if len(baseDataset) == 0 {
		return fmt.Errorf("no historical data available from start time")
	}

	// displayDataset removed - only using baseDataset for simulation progression
	se.baseDataset = baseDataset
	se.startTime = startTime
	se.currentSimTime = startTime
	se.lastCandleEndTime = startTime
	se.currentIndex = 0
	se.state = StatePlaying

	// Reset portfolio with initial funding (use user ID 1 as default for simulation)
	if portfolioService != nil && initialFunding > 0 {
		if err := portfolioService.ResetPortfolioWithFunding(1, initialFunding); err != nil {
			return fmt.Errorf("failed to reset portfolio with initial funding: %w", err)
		}
		log.Printf("Portfolio reset with initial funding: $%.2f", initialFunding)
	}

	// Initialize continuous data loading state
	se.isLoadingData = false
	if len(baseDataset) > 0 {
		se.lastDataLoadTime = baseDataset[len(baseDataset)-1].StartTime
	} else {
		se.lastDataLoadTime = startTime
	}

	log.Printf("Starting simulation: %s %s from %d with %d base candles (%s) at %dx speed",
		symbol, interval, startTime, len(baseDataset), se.baseInterval, speed)

	// Broadcast simulation start
	se.broadcastStateChange("simulation_start", "Simulation started")

	// Start the simulation goroutine
	go se.runSimulation()

	return nil
}

func (se *SimulationEngine) loadHistoricalDataset(symbol, interval string, startTime int64) ([]models.OHLCV, error) {
	// Use binance service to fetch historical data with incomplete candle support
	startTimeMs := startTime

	data, err := se.binanceService.GetHistoricalData(symbol, interval, 1000, &startTimeMs, nil, false)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch historical data: %w", err)
	}

	if len(data) == 0 {
		return nil, fmt.Errorf("no historical data returned")
	}

	log.Printf("Loaded %d historical candles for %s %s starting from %d to %d",
		len(data), symbol, interval, data[0].StartTime, data[len(data)-1].StartTime)
	return data, nil
}

func (se *SimulationEngine) runSimulation() {
	se.tickerInterval = se.getOptimalTickerInterval()
	se.ticker = time.NewTicker(se.tickerInterval)
	defer se.ticker.Stop()

	log.Printf("Simulation goroutine started with ticker interval: %v", se.getOptimalTickerInterval())

	currentInterval := se.tickerInterval
	for {
		select {
		case <-se.ticker.C:
			se.mu.Lock()
			// Check if ticker interval needs to be updated
			if currentInterval != se.tickerInterval {
				currentInterval = se.tickerInterval
				se.ticker.Stop()
				se.ticker = time.NewTicker(se.tickerInterval)
				log.Printf("Ticker recreated with new interval: %v", se.tickerInterval)
			}

			if se.state == StatePlaying {
				// Check if we need to load more data before processing
				se.checkDataLoadingNeeded()

				if se.processNextBaseUpdate() {
					// Base candle processed and broadcasted
				} else {
					// Reached end of dataset - but don't stop immediately if we're loading more data
					if !se.isLoadingData {
						log.Printf("Simulation reached end of base dataset")
						se.state = StateStopped
						se.broadcastStateChange("simulation_stop", "Simulation completed - reached end of data")
						se.mu.Unlock()
						return
					}
					// If we're loading data, continue the simulation loop
				}
			}
			se.mu.Unlock()

		case newSpeed := <-se.speedChangeChan:
			se.mu.Lock()
			log.Printf("Received speed change from %dx to %dx", se.speed, newSpeed)
			if err := se.handleSpeedChange(newSpeed); err != nil {
				log.Printf("Failed to change speed: %v", err)
				se.broadcastStateChange("simulation_error", fmt.Sprintf("Failed to change speed: %v", err))
			} else {
				se.broadcastStateChange("simulation_speed_change", fmt.Sprintf("Speed changed to %dx", newSpeed))
			}
			se.mu.Unlock()

		case newTimeframe := <-se.timeframeChangeChan:
			se.mu.Lock()
			log.Printf("Received timeframe change from %s to %s", se.interval, newTimeframe)
			if err := se.handleTimeframeChange(newTimeframe); err != nil {
				log.Printf("Failed to change timeframe: %v", err)
				se.broadcastStateChange("simulation_error", fmt.Sprintf("Failed to change timeframe: %v", err))
			} else {
				se.broadcastStateChange("simulation_timeframe_change", fmt.Sprintf("Timeframe changed to %s", newTimeframe))
			}
			se.mu.Unlock()

		case dataLoadSuccess := <-se.dataLoadChan:
			se.mu.Lock()
			if dataLoadSuccess {
				log.Printf("Successfully loaded more historical data")
				se.broadcastStateChange("simulation_data_loaded", "Additional historical data loaded")
			} else {
				log.Printf("Failed to load more historical data")
				se.broadcastStateChange("simulation_error", "Failed to load additional historical data")
			}
			se.mu.Unlock()

		case <-se.stopChan:
			log.Printf("Simulation goroutine stopped via stop channel")
			return
		case <-se.ctx.Done():
			log.Printf("Simulation goroutine stopped via context")
			return
		}
	}
}

// processNextBaseUpdate advances simulation time and processes base candles
func (se *SimulationEngine) processNextBaseUpdate() bool {
	// Only process updates when actively playing
	if se.state != StatePlaying {
		return true // Don't process updates if not playing, but don't end simulation
	}

	// Calculate how much market time to advance based on ticker interval and speed
	tickerIntervalMs := se.tickerInterval.Milliseconds() // Convert to milliseconds
	marketMsPerRealSecond := int64(se.speed * 1000)      // speed in market seconds, convert to ms
	marketMsPerUpdate := (marketMsPerRealSecond * tickerIntervalMs) / 1000

	// Advance simulation time with millisecond precision (only when playing)
	se.currentSimTime += marketMsPerUpdate

	// Process all candles that are ready to be broadcast
	for se.currentIndex < len(se.baseDataset) {
		baseCandle := se.baseDataset[se.currentIndex]

		// Check if this base candle's end time is now <= current simulation time
		if baseCandle.EndTime <= se.currentSimTime {
			// Broadcast this base candle
			se.broadcastBaseCandle(baseCandle)
			se.currentIndex++
			se.lastCandleEndTime = baseCandle.EndTime
		} else {
			// No more candles ready, break out of loop
			break
		}
	}

	// If no more base candles available, end simulation
	if se.currentIndex >= len(se.baseDataset) {
		return false
	}

	return true
}

// broadcastBaseCandle sends a single base candle to clients for frontend aggregation
func (se *SimulationEngine) broadcastBaseCandle(baseCandle models.OHLCV) {
	// Progress calculation placeholder - will be time-based in future
	progress := float64(0)

	updateData := SimulationUpdateData{
		Symbol:         se.symbol,
		BaseCandle:     baseCandle,
		SimulationTime: fmt.Sprintf("%d", se.currentSimTime),
		Progress:       progress,
		State:          string(se.state),
		Speed:          se.speed,
	}

	se.hub.BroadcastMessageString("simulation_update", updateData)
	log.Printf("Broadcasted base candle: %d-%d, SimTime: %d, OHLCV: %.2f/%.2f/%.2f/%.2f/%.2f",
		baseCandle.StartTime, baseCandle.EndTime, se.currentSimTime,
		baseCandle.Open, baseCandle.High, baseCandle.Low, baseCandle.Close, baseCandle.Volume)
}

// broadcastCurrentPrice - removed as it was using unused displayDataset

func (se *SimulationEngine) broadcastStateChange(messageType, message string) {
	stateData := map[string]interface{}{
		"state":   string(se.state),
		"message": message,
		"symbol":  se.symbol,
		"speed":   se.speed,
	}

	se.hub.BroadcastMessageString(messageType, stateData)
}

func (se *SimulationEngine) getOptimalTickerInterval() time.Duration {
	// Get base interval duration in seconds
	baseIntervalDurationMs := models.GetIntervalDurationMs(se.baseInterval)
	baseIntervalSeconds := float64(baseIntervalDurationMs) / 1000.0

	// Calculate how many market seconds we advance per real second
	marketSecondsPerRealSecond := float64(se.speed) // speed is already in seconds

	// Calculate how much of a base candle we consume per real second
	baseCandlesPerSecond := marketSecondsPerRealSecond / baseIntervalSeconds

	// Calculate ticker interval
	tickerInterval := time.Duration(float64(time.Second) / baseCandlesPerSecond)
	return tickerInterval

}

// getOptimalBaseInterval determines the best base interval for fetching data
func (se *SimulationEngine) getOptimalBaseInterval() string {

	// Available timeframes supported by Binance API in ascending order
	timeframes := []string{"1m", "5m", "15m", "1h", "4h", "1d"}

	// Find the largest timeframe that's <= speed
	baseInterval := "1m" // default to most granular
	for _, tf := range timeframes {
		intervalDurationMs := models.GetIntervalDurationMs(tf)
		intervalDurationSeconds := intervalDurationMs / 1000

		if se.speed >= int(intervalDurationSeconds) {
			baseInterval = tf
		} else {
			break // Since timeframes are in ascending order, we can break early
		}
	}
	return baseInterval
}

// getMinAllowedTimeframe calculates minimum allowed display timeframe based on speed
func (se *SimulationEngine) getMinAllowedTimeframe(speed int) string {
	// Speed is in seconds: how many market seconds per real second
	marketSecondsPerRealSecond := float64(speed)

	// Find the largest timeframe that's <= marketSecondsPerRealSecond
	// Available timeframes in ascending order (in seconds)
	timeframes := []struct {
		name    string
		seconds float64
	}{
		{"1m", 60},
		{"5m", 300},
		{"15m", 900},
		{"1h", 3600},
		{"4h", 14400},
		{"1d", 86400},
	}

	// Find the largest timeframe that's <= marketSecondsPerRealSecond
	minTimeframe := "1m" // default to smallest if no match
	for _, tf := range timeframes {
		if tf.seconds <= marketSecondsPerRealSecond {
			minTimeframe = tf.name
		}
	}

	return minTimeframe
}

// isTimeframeAllowed checks if timeframe is allowed for current speed
func (se *SimulationEngine) isTimeframeAllowed(timeframe string, speed int) bool {
	minAllowed := se.getMinAllowedTimeframe(speed)

	// Get timeframe values in seconds for comparison
	timeframeSeconds := models.GetIntervalDurationMs(timeframe) / 1000
	minAllowedSeconds := models.GetIntervalDurationMs(minAllowed) / 1000

	return timeframeSeconds >= minAllowedSeconds
}

func (se *SimulationEngine) Pause() error {
	se.mu.Lock()
	defer se.mu.Unlock()

	if se.state != StatePlaying {
		return fmt.Errorf("simulation not playing")
	}

	se.state = StatePaused
	log.Printf("Simulation paused at index %d", se.currentIndex)
	se.broadcastStateChange("simulation_pause", "Simulation paused")
	return nil
}

func (se *SimulationEngine) Resume() error {
	se.mu.Lock()
	defer se.mu.Unlock()

	if se.state != StatePaused {
		return fmt.Errorf("simulation not paused")
	}

	se.state = StatePlaying
	log.Printf("Simulation resumed at index %d", se.currentIndex)
	se.broadcastStateChange("simulation_resume", "Simulation resumed")
	return nil
}

func (se *SimulationEngine) Stop() error {
	se.mu.Lock()
	defer se.mu.Unlock()

	if se.state == StateStopped {
		return nil // Already stopped
	}

	se.state = StateStopped
	se.currentIndex = 0

	// Reset all time-related state to ensure clean start for next simulation
	se.currentSimTime = 0
	se.lastCandleEndTime = 0
	se.startTime = 0
	se.lastDataLoadTime = 0

	// Clear data arrays
	se.baseDataset = nil

	if se.ticker != nil {
		se.ticker.Stop()
		se.ticker = nil
	}

	// Send stop signal to goroutine
	select {
	case se.stopChan <- struct{}{}:
	default:
		// Channel might be full or goroutine already stopped
	}

	log.Printf("Simulation stopped and reset")
	se.broadcastStateChange("simulation_stop", "Simulation stopped")
	return nil
}

func (se *SimulationEngine) SetSpeed(speed int) error {
	se.mu.RLock()
	defer se.mu.RUnlock()

	if speed <= 0 {
		return fmt.Errorf("invalid speed: %d, must be positive", speed)
	}

	// If simulation is running, send speed change to goroutine via channel
	if se.state == StatePlaying {
		select {
		case se.speedChangeChan <- speed:
			log.Printf("Speed change request sent: %dx", speed)
		default:
			// Channel full, replace with new value
			select {
			case <-se.speedChangeChan:
			default:
			}
			se.speedChangeChan <- speed
			log.Printf("Speed change request replaced: %dx", speed)
		}
	} else {
		// If not running, update speed directly
		se.mu.RUnlock()
		se.mu.Lock()
		se.speed = speed
		se.mu.Unlock()
		se.mu.RLock()
		log.Printf("Speed updated directly to %dx (simulation not running)", speed)
	}

	return nil
}

// GetMinAllowedTimeframeForSpeed exposes the min timeframe calculation for frontend
func (se *SimulationEngine) GetMinAllowedTimeframeForSpeed(speed int) string {
	return se.getMinAllowedTimeframe(speed)
}

// SetTimeframe changes the timeframe during simulation
func (se *SimulationEngine) SetTimeframe(newTimeframe string) error {
	se.mu.RLock()
	defer se.mu.RUnlock()

	// Validate timeframe is allowed for current speed
	if !se.isTimeframeAllowed(newTimeframe, se.speed) {
		minAllowed := se.getMinAllowedTimeframe(se.speed)
		return fmt.Errorf("timeframe %s not allowed at %dx speed. Minimum allowed: %s", newTimeframe, se.speed, minAllowed)
	}

	// If simulation is running, send timeframe change to goroutine via channel
	if se.state == StatePlaying || se.state == StatePaused {
		select {
		case se.timeframeChangeChan <- newTimeframe:
			log.Printf("Timeframe change request sent: %s", newTimeframe)
		default:
			// Channel full, replace with new value
			select {
			case <-se.timeframeChangeChan:
			default:
			}
			se.timeframeChangeChan <- newTimeframe
			log.Printf("Timeframe change request replaced: %s", newTimeframe)
		}
	} else {
		// If not running, update timeframe directly
		se.mu.RUnlock()
		se.mu.Lock()
		se.interval = newTimeframe
		se.mu.Unlock()
		se.mu.RLock()
		log.Printf("Timeframe updated directly to %s (simulation not running)", newTimeframe)
	}

	return nil
}

// handleSpeedChange processes speed changes during simulation
func (se *SimulationEngine) handleSpeedChange(newSpeed int) error {
	log.Printf("Handling speed change from %dx to %dx", se.speed, newSpeed)

	oldSpeed := se.speed
	se.speed = newSpeed

	// Recalculate optimal base interval for new speed
	newBaseInterval := se.getOptimalBaseInterval()

	// If base interval needs to change, reload base dataset
	if newBaseInterval != se.baseInterval {
		log.Printf("Base interval changing from %s to %s", se.baseInterval, newBaseInterval)
		oldBaseInterval := se.baseInterval
		se.baseInterval = newBaseInterval

		// Load data from aligned boundary for new base interval
		// Find the boundary time that aligns with new base interval before current simulation time
		newBaseIntervalMs := models.GetIntervalDurationMs(se.baseInterval)
		alignedStartTime := (se.lastCandleEndTime / newBaseIntervalMs) * newBaseIntervalMs

		// Go back a few intervals to ensure we have enough data
		loadStartTime := alignedStartTime - (newBaseIntervalMs * 10)

		log.Printf("Loading new base data from aligned time %d (aligned: %d, last candle end time: %d)",
			loadStartTime, alignedStartTime, se.lastCandleEndTime)

		newBaseDataset, err := se.binanceService.GetHistoricalData(se.symbol, se.baseInterval, 1000, &loadStartTime, nil, false)
		if err != nil {
			// Revert changes on error
			se.speed = oldSpeed
			se.baseInterval = oldBaseInterval
			// Ticker interval will be recalculated in main loop
			return fmt.Errorf("failed to reload base dataset: %w", err)
		}

		se.baseDataset = newBaseDataset

		// Find current position in new base dataset
		// Look for the first candle that hasn't been completed yet (endTime > lastCandleEndTime)
		newIndex := len(newBaseDataset) // Default to end if not found
		for i, candle := range newBaseDataset {
			if candle.EndTime > se.lastCandleEndTime {
				newIndex = i
				break
			}
		}
		se.currentIndex = newIndex

		log.Printf("Repositioned to index %d in new base dataset (next candle: %d-%d)",
			se.currentIndex,
			func() int64 {
				if se.currentIndex < len(newBaseDataset) {
					return newBaseDataset[se.currentIndex].StartTime
				} else {
					return 0
				}
			}(),
			func() int64 {
				if se.currentIndex < len(newBaseDataset) {
					return newBaseDataset[se.currentIndex].EndTime
				} else {
					return 0
				}
			}())
	}

	// Update ticker interval
	se.tickerInterval = se.getOptimalTickerInterval()
	// Ticker will be recreated in main loop
	log.Printf("Ticker interval updated to: %v", se.tickerInterval)

	// No progressive candle state to reset

	log.Printf("Speed change completed: %dx -> %dx (base: %s)", oldSpeed, newSpeed, se.baseInterval)
	return nil
}

// handleTimeframeChange processes timeframe changes during simulation
func (se *SimulationEngine) handleTimeframeChange(newTimeframe string) error {
	log.Printf("Handling timeframe change from %s to %s", se.interval, newTimeframe)

	oldInterval := se.interval
	se.interval = newTimeframe

	// No progressive candle state to reset

	log.Printf("Timeframe change completed: %s -> %s (base: %s unchanged)", oldInterval, newTimeframe, se.baseInterval)
	return nil
}

func (se *SimulationEngine) GetStatus() SimulationStatus {
	se.mu.RLock()
	defer se.mu.RUnlock()

	var currentPrice float64
	var currentTime string

	// Get current price from most recent processed base candle
	if se.currentIndex > 0 && se.currentIndex <= len(se.baseDataset) {
		lastProcessedCandle := se.baseDataset[se.currentIndex-1]
		currentPrice = lastProcessedCandle.Close
		currentTime = fmt.Sprintf("%d", se.currentSimTime)
	}

	// Progress calculation placeholder - will be time-based in future
	progress := float64(0)

	return SimulationStatus{
		State:        string(se.state),
		Symbol:       se.symbol,
		Interval:     se.interval,
		Speed:        se.speed,
		CurrentIndex: se.currentIndex,
		TotalCandles: len(se.baseDataset),
		Progress:     progress,
		StartTime:    fmt.Sprintf("%d", se.startTime),
		CurrentTime:  currentTime,
		CurrentPrice: currentPrice,
	}
}

func (se *SimulationEngine) GetCurrentPrice() float64 {
	se.mu.RLock()
	defer se.mu.RUnlock()

	if se.currentIndex > 0 && se.currentIndex <= len(se.baseDataset) {
		lastProcessedCandle := se.baseDataset[se.currentIndex-1]
		return lastProcessedCandle.Close
	}
	return 0
}

func (se *SimulationEngine) IsRunning() bool {
	se.mu.RLock()
	defer se.mu.RUnlock()
	return se.state == StatePlaying || se.state == StatePaused
}

func (se *SimulationEngine) Cleanup() {
	se.mu.Lock()
	defer se.mu.Unlock()

	se.cancel()

	if se.ticker != nil {
		se.ticker.Stop()
	}

	select {
	case se.stopChan <- struct{}{}:
	default:
	}

	log.Printf("Simulation engine cleanup completed")
}

// loadMoreHistoricalData loads additional historical data from the last loaded timestamp
func (se *SimulationEngine) loadMoreHistoricalData() error {
	if se.isLoadingData {
		return nil // Already loading data
	}

	se.isLoadingData = true
	defer func() { se.isLoadingData = false }()

	// Calculate start time for next data chunk (use last candle's timestamp + 1ms)
	var startTimeMs int64
	if len(se.baseDataset) > 0 {
		lastCandle := se.baseDataset[len(se.baseDataset)-1]
		startTimeMs = lastCandle.StartTime + 1
	} else {
		// Fallback to last known time
		startTimeMs = se.lastDataLoadTime
	}

	// Fetch new data chunk with retry logic
	var newData []models.OHLCV
	var err error
	maxRetries := 3
	for attempt := 1; attempt <= maxRetries; attempt++ {
		newData, err = se.binanceService.GetHistoricalData(se.symbol, se.baseInterval, 1000, &startTimeMs, nil, false)
		if err == nil {
			break
		}

		if attempt < maxRetries {
			waitTime := time.Duration(attempt) * 2 * time.Second // Exponential backoff: 2s, 4s, 6s
			log.Printf("Data loading attempt %d failed: %v. Retrying in %v...", attempt, err, waitTime)
			time.Sleep(waitTime)
		}
	}

	if err != nil {
		return fmt.Errorf("failed to load more historical data after %d attempts: %w", maxRetries, err)
	}

	if len(newData) == 0 {
		log.Printf("No more historical data available")
		return nil
	}

	// Append new data to existing dataset
	se.baseDataset = append(se.baseDataset, newData...)
	se.lastDataLoadTime = newData[len(newData)-1].StartTime

	log.Printf("Loaded %d historical candles for %s %s starting from %d to %d",
		len(newData), se.baseInterval, se.baseInterval, newData[0].EndTime, newData[len(newData)-1].StartTime)

	// displayDataset loading removed - no longer needed

	// Perform memory cleanup if needed
	se.cleanupOldData()

	return nil
}

// cleanupOldData removes old candles from memory to prevent unlimited growth
func (se *SimulationEngine) cleanupOldData() {
	if len(se.baseDataset) <= se.maxBufferSize {
		return // No cleanup needed
	}

	// Keep the most recent candles and remove old ones
	// Leave some buffer before current position to allow for rewind scenarios
	minKeepIndex := se.currentIndex - 100 // Keep 100 candles before current position
	if minKeepIndex < 0 {
		minKeepIndex = 0
	}

	removeCount := len(se.baseDataset) - se.maxBufferSize
	if removeCount > minKeepIndex {
		removeCount = minKeepIndex // Don't remove too close to current position
	}

	if removeCount > 0 {
		// Remove old data from beginning
		se.baseDataset = se.baseDataset[removeCount:]
		se.currentIndex -= removeCount

		// displayDataset cleanup removed - no longer needed

		log.Printf("Cleaned up %d old candles, current index adjusted to %d", removeCount, se.currentIndex)
	}
}

// checkDataLoadingNeeded checks if more data loading is needed based on current position
func (se *SimulationEngine) checkDataLoadingNeeded() {
	if se.isLoadingData {
		return // Already loading
	}

	// Check if we're approaching the end of available data
	if len(se.baseDataset) == 0 {
		return
	}

	progress := float64(se.currentIndex) / float64(len(se.baseDataset))
	if progress >= se.dataLoadThreshold {
		// Trigger background data loading
		go func() {
			if err := se.loadMoreHistoricalData(); err != nil {
				log.Printf("Failed to load more data: %v", err)
				// Notify simulation loop about data loading failure
				select {
				case se.dataLoadChan <- false:
				default:
				}
			} else {
				// Notify simulation loop about successful data loading
				select {
				case se.dataLoadChan <- true:
				default:
				}
			}
		}()
	}

}
