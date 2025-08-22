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
	speed          int                // 1, 5, 10
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

	// Validate speed
	if speed != 1 && speed != 5 && speed != 10 {
		return fmt.Errorf("invalid speed: %d, must be 1, 5, or 10", speed)
	}

	// Load historical dataset starting from startTime
	dataset, err := se.loadHistoricalDataset(symbol, interval, startTime)
	if err != nil {
		return fmt.Errorf("failed to load dataset: %w", err)
	}

	if len(dataset) == 0 {
		return fmt.Errorf("no historical data available from start time")
	}

	se.dataset = dataset
	se.symbol = symbol
	se.interval = interval
	se.startTime = startTime
	se.speed = speed
	se.currentIndex = 0
	se.state = StatePlaying

	log.Printf("Starting simulation: %s %s from %s with %d candles at %dx speed",
		symbol, interval, startTime.Format(time.RFC3339), len(dataset), speed)

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
				if se.currentIndex < len(se.dataset) {
					se.broadcastCurrentPrice()
					se.currentIndex++
				} else {
					// Reached end of dataset
					log.Printf("Simulation reached end of dataset")
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
	// Base interval: 1 second = 1 minute of real market data
	// For different timeframes, adjust accordingly
	baseInterval := 1000 * time.Millisecond

	// Adjust base interval based on timeframe
	switch se.interval {
	case "1m":
		baseInterval = 1000 * time.Millisecond // 1 second = 1 minute
	case "5m":
		baseInterval = 5000 * time.Millisecond // 5 seconds = 5 minutes
	case "15m":
		baseInterval = 15000 * time.Millisecond // 15 seconds = 15 minutes
	case "1h":
		baseInterval = 60000 * time.Millisecond // 60 seconds = 1 hour
	case "4h":
		baseInterval = 240000 * time.Millisecond // 240 seconds = 4 hours
	case "1d":
		baseInterval = 1440000 * time.Millisecond // 1440 seconds = 1 day
	}

	// Apply speed multiplier
	return baseInterval / time.Duration(se.speed)
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

	if speed != 1 && speed != 5 && speed != 10 {
		return fmt.Errorf("invalid speed: %d, must be 1, 5, or 10", speed)
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