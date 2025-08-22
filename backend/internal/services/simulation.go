package services

import (
	"context"
	"fmt"
	"log"
	"math"
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
	speed          int                // 1, 5, 10, 60, 120, 300, etc.
	currentIndex   int                // Position in historical dataset
	dataset        []models.OHLCV     // Historical data from selected start time
	ticker         *time.Ticker       // Controls replay speed
	hub            WebSocketHub       // WebSocket broadcasting
	symbol         string
	interval       string
	stopChan       chan struct{}
	startTime      time.Time
	ctx            context.Context
	cancel         context.CancelFunc
	binanceService *BinanceService
	
	// Progressive candle support
	baseInterval       string             // Optimal base interval (1m, 5m, etc.)
	baseDataset        []models.OHLCV     // Base interval historical data
	currentProgressive *ProgressiveCandle // Current progressive candle
	currentSimTime     time.Time          // Current simulation time
}

type SimulationUpdateData struct {
	Symbol         string        `json:"symbol"`
	Price          float64       `json:"price"`
	Timestamp      int64         `json:"timestamp"`
	OHLCV          models.OHLCV  `json:"ohlcv"`
	SimulationTime string        `json:"simulationTime"`
	Progress       float64       `json:"progress"` // 0-100%
	State          string        `json:"state"`
	Speed          int           `json:"speed"`
}

// ProgressiveCandle represents a candle being built progressively from base data
type ProgressiveCandle struct {
	StartTime       time.Time      `json:"startTime"`
	DisplayInterval string         `json:"displayInterval"`
	BaseCandles     []models.OHLCV `json:"baseCandles"`
	CurrentOHLCV    models.OHLCV   `json:"currentOHLCV"`
	IsComplete      bool           `json:"isComplete"`
	ExpectedCount   int            `json:"expectedCount"`
}

// AddBaseCandle adds a base candle to the progressive aggregation
func (pc *ProgressiveCandle) AddBaseCandle(candle models.OHLCV) {
	pc.BaseCandles = append(pc.BaseCandles, candle)
	pc.updateAggregation()
	pc.IsComplete = (len(pc.BaseCandles) >= pc.ExpectedCount)
}

// updateAggregation recalculates the aggregated OHLCV values
func (pc *ProgressiveCandle) updateAggregation() {
	if len(pc.BaseCandles) == 0 {
		return
	}
	
	// Aggregation rules:
	// open = first open (unchanged)
	// high = running maximum
	// low = running minimum  
	// close = latest close (continuously updating)
	// volume = cumulative sum
	first := pc.BaseCandles[0]
	latest := pc.BaseCandles[len(pc.BaseCandles)-1]
	
	pc.CurrentOHLCV = models.OHLCV{
		Time:   pc.StartTime.Unix() * 1000,
		Open:   first.Open,
		High:   pc.getMaxHigh(),
		Low:    pc.getMinLow(),
		Close:  latest.Close,
		Volume: pc.getSumVolume(),
	}
}

func (pc *ProgressiveCandle) getMaxHigh() float64 {
	max := pc.BaseCandles[0].High
	for _, candle := range pc.BaseCandles {
		if candle.High > max {
			max = candle.High
		}
	}
	return max
}

func (pc *ProgressiveCandle) getMinLow() float64 {
	min := pc.BaseCandles[0].Low
	for _, candle := range pc.BaseCandles {
		if candle.Low < min {
			min = candle.Low
		}
	}
	return min
}

func (pc *ProgressiveCandle) getSumVolume() float64 {
	sum := 0.0
	for _, candle := range pc.BaseCandles {
		sum += candle.Volume
	}
	return sum
}

type SimulationStatus struct {
	State          string        `json:"state"`
	Symbol         string        `json:"symbol"`
	Interval       string        `json:"interval"`
	Speed          int           `json:"speed"`
	CurrentIndex   int           `json:"currentIndex"`
	TotalCandles   int           `json:"totalCandles"`
	Progress       float64       `json:"progress"`
	StartTime      string        `json:"startTime"`
	CurrentTime    string        `json:"currentTime"`
	CurrentPrice   float64       `json:"currentPrice"`
}

func NewSimulationEngine(hub WebSocketHub, binanceService *BinanceService) *SimulationEngine {
	ctx, cancel := context.WithCancel(context.Background())

	return &SimulationEngine{
		state:          StateStopped,
		speed:          1,
		hub:            hub,
		stopChan:       make(chan struct{}),
		ctx:            ctx,
		cancel:         cancel,
		binanceService: binanceService,
	}
}

func (se *SimulationEngine) Start(symbol, interval string, startTime time.Time, speed int) error {
	se.mu.Lock()
	defer se.mu.Unlock()

	if se.state != StateStopped {
		return fmt.Errorf("simulation already running")
	}

	// Validate speed (allow any positive integer)
	if speed <= 0 {
		return fmt.Errorf("invalid speed: %d, must be positive", speed)
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

	// Keep original dataset for display reference and base dataset for progression
	displayDataset, _ := se.loadHistoricalDataset(symbol, interval, startTime)
	se.dataset = displayDataset
	se.baseDataset = baseDataset
	se.startTime = startTime
	se.currentSimTime = startTime
	se.currentIndex = 0
	se.currentProgressive = nil
	se.state = StatePlaying

	log.Printf("Starting simulation: %s %s from %s with %d base candles (%s) at %dx speed",
		symbol, interval, startTime.Format(time.RFC3339), len(baseDataset), se.baseInterval, speed)

	// Broadcast simulation start
	se.broadcastStateChange("simulation_start", "Simulation started")

	// Start the simulation goroutine
	go se.runSimulation()

	return nil
}

func (se *SimulationEngine) loadHistoricalDataset(symbol, interval string, startTime time.Time) ([]models.OHLCV, error) {
	// Calculate end time - get data for about 24-48 hours forward
	endTime := startTime.Add(48 * time.Hour)
	if endTime.After(time.Now()) {
		endTime = time.Now()
	}

	log.Printf("Loading historical data from %s to %s", startTime.Format(time.RFC3339), endTime.Format(time.RFC3339))

	// Use binance service to fetch historical data
	startTimeMs := startTime.Unix() * 1000
	endTimeMs := endTime.Unix() * 1000
	data, err := se.binanceService.GetHistoricalData(symbol, interval, 1000, &startTimeMs, &endTimeMs)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch historical data: %w", err)
	}

	if len(data) == 0 {
		return nil, fmt.Errorf("no historical data returned")
	}

	log.Printf("Loaded %d candles for simulation", len(data))
	return data, nil
}

func (se *SimulationEngine) runSimulation() {
	se.ticker = time.NewTicker(se.getTickerInterval())
	defer se.ticker.Stop()

	log.Printf("Simulation goroutine started with ticker interval: %v", se.getTickerInterval())

	for {
		select {
		case <-se.ticker.C:
			se.mu.Lock()
			if se.state == StatePlaying {
				if se.processNextProgressiveUpdate() {
					se.broadcastProgressiveUpdate()
				} else {
					// Reached end of dataset
					log.Printf("Simulation reached end of base dataset")
					se.state = StateStopped
					se.broadcastStateChange("simulation_stop", "Simulation completed - reached end of data")
					se.mu.Unlock()
					return
				}
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

// processNextProgressiveUpdate advances simulation time and updates progressive candles
func (se *SimulationEngine) processNextProgressiveUpdate() bool {
	// Calculate how much market time to advance per update
	marketMinutesPerSecond := float64(se.speed) / 60.0
	updatesPerSecond := int(math.Min(math.Ceil(marketMinutesPerSecond), 10))
	marketMinutesPerUpdate := marketMinutesPerSecond / float64(updatesPerSecond)
	
	// Advance simulation time
	se.currentSimTime = se.currentSimTime.Add(time.Duration(marketMinutesPerUpdate * float64(time.Minute)))
	
	// Find base candles that should be included up to current simulation time
	newBaseCandlesFound := se.collectBaseCandlesUpTo(se.currentSimTime)
	
	// If no more base candles available, end simulation
	if !newBaseCandlesFound && se.currentIndex >= len(se.baseDataset) {
		return false
	}
	
	return true
}

// collectBaseCandlesUpTo collects base candles up to the given time and adds them to progressive candle
func (se *SimulationEngine) collectBaseCandlesUpTo(targetTime time.Time) bool {
	foundNewCandles := false
	
	// Process base candles up to target time
	for se.currentIndex < len(se.baseDataset) {
		baseCandle := se.baseDataset[se.currentIndex]
		baseCandleTime := time.Unix(baseCandle.Time/1000, 0)
		
		// Stop if this base candle is beyond our target time
		if baseCandleTime.After(targetTime) {
			break
		}
		
		// Determine which display candle this base candle belongs to
		displayCandleStart := se.getDisplayCandleStartTime(baseCandleTime)
		
		// Check if we need a new progressive candle
		if se.currentProgressive == nil || se.currentProgressive.StartTime != displayCandleStart {
			// Start new progressive candle
			se.currentProgressive = &ProgressiveCandle{
				StartTime:       displayCandleStart,
				DisplayInterval: se.interval,
				BaseCandles:     []models.OHLCV{},
				IsComplete:      false,
				ExpectedCount:   se.getExpectedBaseCount(displayCandleStart),
			}
		}
		
		// Add base candle to progressive aggregation
		se.currentProgressive.AddBaseCandle(baseCandle)
		se.currentIndex++
		foundNewCandles = true
	}
	
	return foundNewCandles
}

// getDisplayCandleStartTime calculates the start time of the display candle for a given time
func (se *SimulationEngine) getDisplayCandleStartTime(t time.Time) time.Time {
	switch se.interval {
	case "1m":
		return t.Truncate(1 * time.Minute)
	case "5m":
		return t.Truncate(5 * time.Minute)
	case "15m":
		return t.Truncate(15 * time.Minute)
	case "1h":
		return t.Truncate(1 * time.Hour)
	case "4h":
		return t.Truncate(4 * time.Hour)
	case "1d":
		return t.Truncate(24 * time.Hour)
	default:
		return t.Truncate(1 * time.Minute)
	}
}

// getExpectedBaseCount calculates how many base candles should make up one display candle
func (se *SimulationEngine) getExpectedBaseCount(displayCandleStart time.Time) int {
	displayDuration := se.parseTimeframeToDuration(se.interval)
	baseDuration := se.parseTimeframeToDuration(se.baseInterval)
	return int(displayDuration / baseDuration)
}

// broadcastProgressiveUpdate sends the current progressive candle state to clients
func (se *SimulationEngine) broadcastProgressiveUpdate() {
	if se.currentProgressive == nil {
		return
	}
	
	// Calculate progress based on base dataset position
	progress := float64(se.currentIndex) / float64(len(se.baseDataset)) * 100
	
	updateData := SimulationUpdateData{
		Symbol:         se.symbol,
		Price:          se.currentProgressive.CurrentOHLCV.Close,
		Timestamp:      se.currentProgressive.CurrentOHLCV.Time,
		OHLCV:          se.currentProgressive.CurrentOHLCV,
		SimulationTime: se.currentSimTime.Format(time.RFC3339),
		Progress:       progress,
		State:          string(se.state),
		Speed:          se.speed,
	}
	
	se.hub.BroadcastMessageString("simulation_update", updateData)
}

func (se *SimulationEngine) broadcastCurrentPrice() {
	if se.currentIndex >= len(se.dataset) {
		return
	}

	currentCandle := se.dataset[se.currentIndex]
	progress := float64(se.currentIndex) / float64(len(se.dataset)) * 100

	updateData := SimulationUpdateData{
		Symbol:         se.symbol,
		Price:          currentCandle.Close,
		Timestamp:      currentCandle.Time,
		OHLCV:          currentCandle,
		SimulationTime: time.Unix(currentCandle.Time/1000, 0).Format(time.RFC3339),
		Progress:       progress,
		State:          string(se.state),
		Speed:          se.speed,
	}

	se.hub.BroadcastMessageString("simulation_update", updateData)
}

func (se *SimulationEngine) broadcastStateChange(messageType, message string) {
	stateData := map[string]interface{}{
		"state":   string(se.state),
		"message": message,
		"symbol":  se.symbol,
		"speed":   se.speed,
	}

	se.hub.BroadcastMessageString(messageType, stateData)
}

func (se *SimulationEngine) getTickerInterval() time.Duration {
	// Calculate how many market minutes we advance per real second
	marketMinutesPerSecond := float64(se.speed) / 60.0
	
	// For progressive candle updates, we want frequent updates
	// Determine optimal update frequency based on speed
	if marketMinutesPerSecond <= 1.0 {
		// Slow speeds: 1 update per second is sufficient
		return 1 * time.Second
	} else {
		// Fast speeds: need multiple updates per second for smooth progression
		// Calculate updates per second (at least 1, up to 10 for very fast speeds)
		updatesPerSecond := int(math.Min(math.Ceil(marketMinutesPerSecond), 10))
		intervalMs := 1000 / updatesPerSecond
		return time.Duration(intervalMs) * time.Millisecond
	}
}

// getOptimalBaseInterval determines the best base interval for fetching data
// based on display timeframe and speed to ensure smooth progressive updates
func (se *SimulationEngine) getOptimalBaseInterval() string {
	displayTimeframeDuration := se.parseTimeframeToDuration(se.interval)
	marketMinutesPerSecond := float64(se.speed) / 60.0
	speedAdvance := time.Duration(marketMinutesPerSecond * float64(time.Minute))
	
	// How many updates do we need per display candle?
	updatesNeeded := displayTimeframeDuration / speedAdvance
	
	// If we need ≤1 update per display candle, use display timeframe itself
	if updatesNeeded <= 1 {
		return se.interval
	}
	
	// Otherwise, find the smallest interval that gives us enough granularity
	intervals := []string{"1m", "5m", "15m", "1h", "4h", "1d"}
	for _, interval := range intervals {
		intervalDuration := se.parseTimeframeToDuration(interval)
		maxUpdatesFromBase := displayTimeframeDuration / intervalDuration
		if maxUpdatesFromBase >= updatesNeeded {
			return interval
		}
	}
	
	return "1m" // fallback to most granular
}

// parseTimeframeToDuration converts timeframe string to time.Duration
func (se *SimulationEngine) parseTimeframeToDuration(timeframe string) time.Duration {
	switch timeframe {
	case "1m":
		return 1 * time.Minute
	case "5m":
		return 5 * time.Minute
	case "15m":
		return 15 * time.Minute
	case "1h":
		return 1 * time.Hour
	case "4h":
		return 4 * time.Hour
	case "1d":
		return 24 * time.Hour
	default:
		return 1 * time.Minute
	}
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
	se.mu.Lock()
	defer se.mu.Unlock()

	if speed <= 0 {
		return fmt.Errorf("invalid speed: %d, must be positive", speed)
	}

	oldSpeed := se.speed
	se.speed = speed

	// Update ticker if simulation is running
	if se.state == StatePlaying && se.ticker != nil {
		se.ticker.Stop()
		se.ticker = time.NewTicker(se.getTickerInterval())
	}

	log.Printf("Simulation speed changed from %dx to %dx", oldSpeed, speed)
	se.broadcastStateChange("simulation_speed_change", fmt.Sprintf("Speed changed to %dx", speed))
	return nil
}

func (se *SimulationEngine) GetStatus() SimulationStatus {
	se.mu.RLock()
	defer se.mu.RUnlock()

	var currentPrice float64
	var currentTime string

	if se.currentIndex > 0 && se.currentIndex <= len(se.dataset) {
		currentCandle := se.dataset[se.currentIndex-1]
		currentPrice = currentCandle.Close
		currentTime = time.Unix(currentCandle.Time/1000, 0).Format(time.RFC3339)
	}

	progress := float64(0)
	if len(se.dataset) > 0 {
		progress = float64(se.currentIndex) / float64(len(se.dataset)) * 100
	}

	return SimulationStatus{
		State:        string(se.state),
		Symbol:       se.symbol,
		Interval:     se.interval,
		Speed:        se.speed,
		CurrentIndex: se.currentIndex,
		TotalCandles: len(se.dataset),
		Progress:     progress,
		StartTime:    se.startTime.Format(time.RFC3339),
		CurrentTime:  currentTime,
		CurrentPrice: currentPrice,
	}
}

func (se *SimulationEngine) GetCurrentPrice() float64 {
	se.mu.RLock()
	defer se.mu.RUnlock()

	if se.currentIndex > 0 && se.currentIndex <= len(se.dataset) {
		return se.dataset[se.currentIndex-1].Close
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