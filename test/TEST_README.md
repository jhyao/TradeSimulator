# Data Replay Test Scripts

This directory contains test scripts to verify the data replay functionality, specifically testing incomplete candle updates in your TradeSimulator.

## Test Scripts

### 1. `test_data_replay.js` - Comprehensive Test
Full-featured test script that:
- ✅ Loads historical data with incomplete candles
- ✅ Starts realtime simulation at 60x speed
- ✅ Monitors progressive candle updates
- ✅ Fetches real historical data from Binance API for comparison
- ✅ Analyzes incomplete vs complete candles
- ✅ Provides detailed comparison results

### 2. `test_simple.js` - Quick Test
Simplified version for rapid testing:
- ✅ Quick 30-second test
- ✅ Focuses on incomplete candle detection
- ✅ Minimal output for easy debugging

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Ensure your backend is running:**
   ```bash
   cd backend
   go run cmd/server/main.go
   ```

3. **Run tests:**
   ```bash
   # Comprehensive test (2 minutes)
   npm test
   # or
   node test_data_replay.js
   
   # Quick test (30 seconds)
   npm run test:simple
   # or
   node test_simple.js
   ```

## Test Configuration

The test uses these settings (matching your requirements):
- **Start Time:** 2024-08-27 06:02:00 (incomplete candle scenario)
- **Symbol:** BTCUSDT
- **Timeframe:** 5m
- **Speed:** 60x
- **Backend URL:** http://localhost:8080
- **WebSocket URL:** ws://localhost:8080/api/v1/websocket

## Expected Results

### ✅ Successful Test Output:
```
📊 INCOMPLETE CANDLE ANALYSIS:

Candle 2024-08-27 06:00:00:
  Updates: 12
  Price progression: 65420.50 → 65435.20
  OHLC: 65420.50/65440.10/65415.30/65435.20
  Volume: 145.2345
  Real OHLC: 65420.50/65440.15/65415.25/65435.25
  Real Volume: 145.2387
  Price difference: 0.05 (0.0001%)
  ✅ Price match is excellent

✅ TEST PASSED: Both incomplete and complete candles were generated
```

### ❌ Common Issues:

1. **No incomplete candles generated:**
   - Choose a different start time (try 06:02, 06:07, 06:12, etc.)
   - Ensure the start time falls within a candle period, not at the exact start

2. **WebSocket connection failed:**
   - Verify backend is running on port 8080
   - Check WebSocket endpoint is accessible

3. **No simulation updates:**
   - Check simulation API endpoints are working
   - Verify historical data is available for the chosen time period

## Understanding the Test

### Progressive Candle Building
The test verifies that:
1. When starting at 06:02 with 5m timeframe, the simulation loads the incomplete 06:00-06:05 candle
2. As simulation progresses, the candle updates progressively (showing partial OHLCV data)
3. Once the candle period is complete (at 06:05), it becomes complete
4. New incomplete candles start building for the next period

### Comparison Logic
The test compares:
- **Simulated candles** (built progressively from base data)
- **Real historical candles** (fetched from Binance API)
- Price accuracy, volume accuracy, and timing

## Modifying the Test

To test different scenarios:

```javascript
const CONFIG = {
    startTime: '2024-08-27 14:32:00',  // Different incomplete candle time
    timeframe: '1m',                    // Different timeframe
    speed: 120,                         // Different speed
    testDurationMs: 60000,              // Different test duration
    // ... other settings
};
```

## Troubleshooting

1. **Install issues:**
   ```bash
   npm install --legacy-peer-deps
   ```

2. **Backend not responding:**
   - Check if backend is running: `curl http://localhost:8080/api/v1/health`
   - Check WebSocket: Browser dev tools → Network → WS tab

3. **Binance API rate limits:**
   - The test includes rate limiting
   - If you hit limits, wait a few minutes before retesting

## Test Architecture

```
test_data_replay.js
├── DataReplayTester class
├── Step 1: loadHistoricalDataWithIncompleteCandle()
├── Step 2: startRealtimeSimulation()
├── Step 3: monitorUpdates()
├── Step 4: fetchRealHistoricalData()
└── Step 5: compareResults()
```

The test validates the core progressive candle functionality that powers your simulation's realistic market behavior.