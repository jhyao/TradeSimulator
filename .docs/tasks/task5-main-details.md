# Task 5: Price Replay Simulation Engine - Implementation Details

**Duration**: 2-3 days  
**Priority**: Critical  
**Status**: Ready for Implementation  
**Prerequisites**: Task 5 Pre-step 1 (Simulation Start Time Control) - ✅ COMPLETED

## Overview
Create simulation engine that replays historical data at fixed speeds using the WebSocket foundation from Task 4, starting from the user-selected time point from Task 5 Pre-step 1.

## Current State Analysis
✅ **Task 5 Pre-step 1 Complete**: Historical context loading with start time selection  
✅ **WebSocket Infrastructure**: Full bidirectional communication (Task 4 complete)  
✅ **Chart Display**: Historical data rendering with TradingView charts  
✅ **Backend Foundation**: Go server with Binance API, database, REST endpoints   

## UI Elements to Add/Modify

### New Components Required

#### 1. SimulationControls.tsx
**Location**: `frontend/src/components/SimulationControls.tsx`

**Elements**:
- ▶️ Start button (begins simulation from selectedStartTime)
- ⏸️ Pause/Resume button (toggles simulation state)  
- ⏹️ Stop button (resets to beginning)
- 🏃 Speed selector: 1x, 5x, 10x dropdown/buttons
- 📊 Current simulation status display (playing/paused/stopped)
- ⏱️ Current simulation time indicator

**Component Structure**:
```typescript
interface SimulationControlsProps {
  selectedStartTime: Date | null;
  onStartSimulation: () => void;
  onPauseSimulation: () => void;
  onResumeSimulation: () => void;
  onStopSimulation: () => void;
  onSpeedChange: (speed: 1 | 5 | 10) => void;
  simulationState: 'stopped' | 'playing' | 'paused';
  currentSpeed: 1 | 5 | 10;
  currentSimulationTime?: Date;
}

const SimulationControls: React.FC<SimulationControlsProps> = ({
  selectedStartTime,
  onStartSimulation,
  onPauseSimulation,
  onResumeSimulation,
  onStopSimulation,
  onSpeedChange,
  simulationState,
  currentSpeed,
  currentSimulationTime
}) => {
  const canStart = selectedStartTime && simulationState === 'stopped';
  const isPlaying = simulationState === 'playing';
  const isPaused = simulationState === 'paused';

  return (
    <div style={{ /* simulation controls styling */ }}>
      <div>
        <button 
          onClick={isPlaying ? onPauseSimulation : isPaused ? onResumeSimulation : onStartSimulation}
          disabled={!canStart && simulationState === 'stopped'}
        >
          {isPlaying ? '⏸️ Pause' : isPaused ? '▶️ Resume' : '▶️ Start Simulation'}
        </button>
        
        <button 
          onClick={onStopSimulation}
          disabled={simulationState === 'stopped'}
        >
          ⏹️ Stop
        </button>
      </div>
      
      <div>
        <label>Speed: </label>
        <select value={currentSpeed} onChange={(e) => onSpeedChange(Number(e.target.value) as 1|5|10)}>
          <option value={1}>1x</option>
          <option value={5}>5x</option>
          <option value={10}>10x</option>
        </select>
      </div>
      
      <div>Status: {simulationState}</div>
      {currentSimulationTime && (
        <div>Time: {currentSimulationTime.toLocaleString()}</div>
      )}
    </div>
  );
};
```

#### 2. SimulationStatus.tsx  
**Location**: `frontend/src/components/SimulationStatus.tsx`

**Elements**:
- Current price display during simulation
- Simulation progress indicator (% through dataset)
- Speed indicator (showing current playback speed)

### Modifications Required

#### 1. App.tsx Updates
**State Management**:
```typescript
interface SimulationState {
  isSimulating: boolean;
  state: 'stopped' | 'playing' | 'paused';
  speed: 1 | 5 | 10;
  currentPrice: number | null;
  simulationTime: Date | null;
  progress: number; // 0-100%
}

const [simulationState, setSimulationState] = useState<SimulationState>({
  isSimulating: false,
  state: 'stopped',
  speed: 1,
  currentPrice: null,
  simulationTime: null,
  progress: 0
});

const handleStartSimulation = async () => {
  if (!selectedStartTime) return;
  
  try {
    const response = await fetch('/api/v1/simulation/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        symbol,
        startTime: selectedStartTime.getTime(),
        interval: timeframe,
        speed: simulationState.speed
      })
    });
    
    if (response.ok) {
      setSimulationState(prev => ({ ...prev, state: 'playing', isSimulating: true }));
    }
  } catch (error) {
    console.error('Failed to start simulation:', error);
  }
};
```

**WebSocket Message Handling**:
```typescript
// In WebSocketContext or App.tsx
useEffect(() => {
  if (lastMessage?.type === 'simulation_update') {
    const data = lastMessage.data as SimulationUpdateData;
    setSimulationState(prev => ({
      ...prev,
      currentPrice: data.price,
      simulationTime: new Date(data.timestamp),
      progress: data.progress
    }));
  }
}, [lastMessage]);
```

#### 2. Chart.tsx Updates
**Real-time Price Updates**:
```typescript
interface ChartProps {
  symbol: string;
  timeframe: string;
  selectedStartTime?: Date | null;
  simulationState?: 'stopped' | 'playing' | 'paused';
  currentSimulationPrice?: number;
  currentSimulationTime?: Date;
}

// Add real-time price marker
const addSimulationMarker = useCallback((price: number, time: Date) => {
  if (!chartRef.current) return;
  
  // Add vertical line at current simulation time
  // Add horizontal line at current price
  // Update candlestick data with new candle if needed
}, []);

// Handle simulation updates via WebSocket
useEffect(() => {
  if (currentSimulationPrice && currentSimulationTime && simulationState === 'playing') {
    addSimulationMarker(currentSimulationPrice, currentSimulationTime);
  }
}, [currentSimulationPrice, currentSimulationTime, simulationState, addSimulationMarker]);
```

## Backend APIs to Add

### New Simulation Engine Service
**File**: `backend/internal/services/simulation.go`

```go
package services

import (
    "context"
    "fmt"
    "time"
    "sync"
    
    "your-project/internal/handlers"
    "your-project/internal/models"
)

type SimulationState string

const (
    StateStopped SimulationState = "stopped"
    StatePlaying SimulationState = "playing"
    StatePaused  SimulationState = "paused"
)

type SimulationEngine struct {
    mu             sync.RWMutex
    state          SimulationState
    speed          int            // 1, 5, 10
    currentIndex   int           // Position in historical dataset
    dataset        []models.OHLCV // Historical data from selected start time
    ticker         *time.Ticker  // Controls replay speed
    hub            *handlers.Hub // WebSocket broadcasting
    symbol         string
    interval       string
    stopChan       chan struct{}
    startTime      time.Time
    ctx            context.Context
    cancel         context.CancelFunc
}

type SimulationUpdateData struct {
    Symbol         string  `json:"symbol"`
    Price          float64 `json:"price"`
    Timestamp      int64   `json:"timestamp"`
    OHLCV          models.OHLCV `json:"ohlcv"`
    SimulationTime string  `json:"simulationTime"`
    Progress       float64 `json:"progress"` // 0-100%
    State          string  `json:"state"`
    Speed          int     `json:"speed"`
}

func NewSimulationEngine(hub *handlers.Hub) *SimulationEngine {
    ctx, cancel := context.WithCancel(context.Background())
    
    return &SimulationEngine{
        state:    StateStopped,
        speed:    1,
        hub:      hub,
        stopChan: make(chan struct{}),
        ctx:      ctx,
        cancel:   cancel,
    }
}

func (se *SimulationEngine) Start(symbol, interval string, startTime time.Time, speed int) error {
    se.mu.Lock()
    defer se.mu.Unlock()
    
    if se.state != StateStopped {
        return fmt.Errorf("simulation already running")
    }
    
    // Load historical dataset starting from startTime
    dataset, err := se.loadHistoricalDataset(symbol, interval, startTime)
    if err != nil {
        return fmt.Errorf("failed to load dataset: %w", err)
    }
    
    se.dataset = dataset
    se.symbol = symbol
    se.interval = interval
    se.startTime = startTime
    se.speed = speed
    se.currentIndex = 0
    se.state = StatePlaying
    
    // Start the simulation goroutine
    go se.runSimulation()
    
    return nil
}

func (se *SimulationEngine) runSimulation() {
    se.ticker = time.NewTicker(se.getTickerInterval())
    defer se.ticker.Stop()
    
    for {
        select {
        case <-se.ticker.C:
            se.mu.RLock()
            if se.state == StatePlaying && se.currentIndex < len(se.dataset) {
                se.broadcastCurrentPrice()
                se.currentIndex++
            } else if se.currentIndex >= len(se.dataset) {
                // Reached end of dataset
                se.mu.RUnlock()
                se.Stop()
                return
            }
            se.mu.RUnlock()
            
        case <-se.stopChan:
            return
        case <-se.ctx.Done():
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
    
    se.hub.BroadcastMessage(handlers.MessageType("simulation_update"), updateData)
}

func (se *SimulationEngine) getTickerInterval() time.Duration {
    // 1 second = 1 minute of real market data
    baseInterval := 1000 * time.Millisecond
    return baseInterval / time.Duration(se.speed)
}

func (se *SimulationEngine) Pause() error {
    se.mu.Lock()
    defer se.mu.Unlock()
    
    if se.state != StatePlaying {
        return fmt.Errorf("simulation not playing")
    }
    
    se.state = StatePaused
    se.broadcastStateChange()
    return nil
}

func (se *SimulationEngine) Resume() error {
    se.mu.Lock()
    defer se.mu.Unlock()
    
    if se.state != StatePaused {
        return fmt.Errorf("simulation not paused")
    }
    
    se.state = StatePlaying
    se.broadcastStateChange()
    return nil
}

func (se *SimulationEngine) Stop() error {
    se.mu.Lock()
    defer se.mu.Unlock()
    
    if se.state == StateStopped {
        return nil
    }
    
    se.state = StateStopped
    se.currentIndex = 0
    
    if se.ticker != nil {
        se.ticker.Stop()
        se.ticker = nil
    }
    
    select {
    case se.stopChan <- struct{}{}:
    default:
    }
    
    se.broadcastStateChange()
    return nil
}

func (se *SimulationEngine) SetSpeed(speed int) error {
    se.mu.Lock()
    defer se.mu.Unlock()
    
    if speed != 1 && speed != 5 && speed != 10 {
        return fmt.Errorf("invalid speed: %d", speed)
    }
    
    se.speed = speed
    
    // Update ticker if simulation is running
    if se.state == StatePlaying && se.ticker != nil {
        se.ticker.Stop()
        se.ticker = time.NewTicker(se.getTickerInterval())
    }
    
    se.broadcastStateChange()
    return nil
}
```

### New API Endpoints
**File**: `backend/internal/handlers/simulation.go`

```go
package handlers

import (
    "net/http"
    "strconv"
    "time"
    
    "github.com/gin-gonic/gin"
    "your-project/internal/services"
)

type SimulationHandler struct {
    engine *services.SimulationEngine
}

func NewSimulationHandler(engine *services.SimulationEngine) *SimulationHandler {
    return &SimulationHandler{
        engine: engine,
    }
}

type StartSimulationRequest struct {
    Symbol    string `json:"symbol" binding:"required"`
    StartTime int64  `json:"startTime" binding:"required"`
    Interval  string `json:"interval" binding:"required"`
    Speed     int    `json:"speed"`
}

// POST /api/v1/simulation/start
func (sh *SimulationHandler) StartSimulation(c *gin.Context) {
    var req StartSimulationRequest
    if err := c.ShouldBindJSON(&req); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    
    if req.Speed == 0 {
        req.Speed = 1
    }
    
    startTime := time.Unix(req.StartTime/1000, 0)
    
    if err := sh.engine.Start(req.Symbol, req.Interval, startTime, req.Speed); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    
    c.JSON(http.StatusOK, gin.H{
        "message": "Simulation started",
        "symbol": req.Symbol,
        "startTime": startTime.Format(time.RFC3339),
        "speed": req.Speed,
    })
}

// POST /api/v1/simulation/pause
func (sh *SimulationHandler) PauseSimulation(c *gin.Context) {
    if err := sh.engine.Pause(); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    
    c.JSON(http.StatusOK, gin.H{"message": "Simulation paused"})
}

// POST /api/v1/simulation/resume  
func (sh *SimulationHandler) ResumeSimulation(c *gin.Context) {
    if err := sh.engine.Resume(); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    
    c.JSON(http.StatusOK, gin.H{"message": "Simulation resumed"})
}

// POST /api/v1/simulation/stop
func (sh *SimulationHandler) StopSimulation(c *gin.Context) {
    if err := sh.engine.Stop(); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    
    c.JSON(http.StatusOK, gin.H{"message": "Simulation stopped"})
}

// POST /api/v1/simulation/speed
func (sh *SimulationHandler) SetSpeed(c *gin.Context) {
    speedStr := c.PostForm("speed")
    if speedStr == "" {
        c.JSON(http.StatusBadRequest, gin.H{"error": "speed parameter required"})
        return
    }
    
    speed, err := strconv.Atoi(speedStr)
    if err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": "invalid speed value"})
        return
    }
    
    if err := sh.engine.SetSpeed(speed); err != nil {
        c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
        return
    }
    
    c.JSON(http.StatusOK, gin.H{
        "message": "Speed updated",
        "speed": speed,
    })
}

// GET /api/v1/simulation/status
func (sh *SimulationHandler) GetStatus(c *gin.Context) {
    status := sh.engine.GetStatus()
    c.JSON(http.StatusOK, status)
}
```

### New WebSocket Message Types
Add to existing `backend/internal/handlers/websocket.go`:

```go
const (
    // ... existing message types
    SimulationStart  MessageType = "simulation_start"
    SimulationPause  MessageType = "simulation_pause" 
    SimulationResume MessageType = "simulation_resume"
    SimulationStop   MessageType = "simulation_stop"
    SimulationUpdate MessageType = "simulation_update"
)
```

## Interactive Flow Changes

### Primary Simulation Flow
```
1. User selects start time via StartTimeSelector (already implemented)
2. Historical context loads on chart (already implemented)  
3. User clicks ▶️ "Start Simulation" button
4. Frontend calls POST /api/v1/simulation/start with selectedStartTime
5. Backend loads dataset from selectedStartTime forward (next 1000+ candles)
6. Backend starts goroutine with ticker for selected speed (1x/5x/10x)
7. Backend streams price updates via WebSocket every ticker interval
8. Frontend receives updates via WebSocketContext
9. Chart displays real-time price marker and updates
```

### Control Flow Integration
```
Pause/Resume:
- User clicks ⏸️ → Frontend calls POST /simulation/pause → Backend pauses ticker → WebSocket sends pause event
- User clicks ▶️ → Frontend calls POST /simulation/resume → Backend resumes ticker → WebSocket sends resume event

Speed Change:  
- User selects 5x speed → Frontend calls POST /simulation/speed → Backend adjusts ticker interval → Continue simulation

Stop/Reset:
- User clicks ⏹️ → Frontend calls POST /simulation/stop → Backend stops goroutine → Reset to selectedStartTime → Chart shows historical context
```

### Data Streaming Architecture
```
Simulation Engine (Go) → WebSocket Hub → Frontend WebSocket Hook → Chart Component
                    ↓
            Price Update Message:
            {
              type: "simulation_update",
              data: {
                symbol: "BTCUSDT",
                price: 45123.45,
                timestamp: 1642636800000,
                ohlcv: {
                  time: 1642636800000,
                  open: 45100,
                  high: 45200,
                  low: 45050,
                  close: 45123.45,
                  volume: 156.789
                },
                simulationTime: "2024-01-15T10:15:00Z",
                progress: 25.5,
                state: "playing",
                speed: 5
              }
            }
```

## Implementation Steps

### Step 1: Backend Simulation Engine
1. Create `internal/services/simulation.go` with SimulationEngine struct
2. Implement Start/Pause/Resume/Stop/SetSpeed methods
3. Add goroutine-based price replay with ticker
4. Integrate with existing WebSocket hub for broadcasting

### Step 2: Backend API Endpoints  
1. Create `internal/handlers/simulation.go` with REST endpoints
2. Add routes to main.go: /api/v1/simulation/* endpoints
3. Implement request/response structures
4. Add proper error handling and validation

### Step 3: Frontend Simulation Controls
1. Create `frontend/src/components/SimulationControls.tsx`
2. Implement start/pause/resume/stop button logic
3. Add speed selector (1x/5x/10x) dropdown
4. Create simulation status display

### Step 4: Frontend State Management
1. Add simulation state to App.tsx
2. Implement API calls for simulation control
3. Handle WebSocket simulation messages
4. Update Chart component for real-time updates

### Step 5: Chart Real-time Updates
1. Add simulation price marker to Chart.tsx
2. Handle streaming price updates via WebSocket
3. Implement smooth transitions between historical/simulation modes
4. Add visual indicators for simulation state

### Step 6: Integration Testing
1. Test complete simulation flow: start → pause → resume → stop
2. Verify speed controls work without data loss
3. Test WebSocket reliability during long simulations
4. Verify chart updates in real-time with proper markers

## Technical Considerations

### Backend Goroutine Management
- Use context for proper goroutine lifecycle management
- Implement graceful shutdown on server stop
- Handle ticker cleanup to prevent memory leaks
- Thread-safe state management with mutex

### Frontend State Management
- Centralized simulation state in App.tsx
- Real-time updates via WebSocket without polling
- Proper cleanup on component unmount
- Error handling for API failures

### WebSocket Message Handling
- Efficient JSON serialization/deserialization  
- Message queuing for high-frequency updates
- Connection recovery during simulation
- Proper message type handling

### Chart Performance
- Efficient real-time data updates
- Memory management for long simulations
- Smooth visual transitions
- Responsive UI during high-speed simulation

## Success Criteria
- [ ] Can start simulation and see chart updating in real-time from selected start time
- [ ] Pause/resume works correctly without data loss or position drift
- [ ] Stop resets simulation to historical context view
- [ ] Speed controls (1x, 5x, 10x) work smoothly with proper timing
- [ ] Current simulation price available for order execution (Task 6 foundation)
- [ ] WebSocket connections remain stable during extended simulations
- [ ] Chart displays both historical context and real-time simulation seamlessly
- [ ] Simulation state persists across speed changes without interruption

## What NOT to Do
- Don't implement variable speed control (only 1x, 5x, 10x)
- Don't add state persistence to database yet
- Don't support multiple concurrent simulations
- Don't implement complex error recovery beyond basic retry
- Don't add simulation analytics or statistics
- Don't optimize for production-scale performance yet

## Foundation for Future Tasks

This implementation creates the essential **streaming price foundation** that enables:
- **Task 6**: Market orders execute at current simulation price
- **Task 7**: Portfolio P&L updates in real-time with simulation
- **Phase 1 Features**: Advanced order types, risk management, analytics

The simulation engine provides **scalable infrastructure** ready for production-level trading simulation features.