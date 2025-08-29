#!/usr/bin/env node

/**
 * Data Replay Test Script
 * 
 * Tests the data replay functionality with incomplete candles:
 * 1. Loads historical data with incomplete candle from start time (06:02)
 * 2. Starts realtime simulation updates at 60x speed
 * 3. Updates candles progressively on loaded data
 * 4. After some time, fetches real historical data from API to compare
 * 
 * Usage: node test_data_replay.js
 */

const WebSocket = require('ws');
const fetch = require('node-fetch'); // You may need: npm install node-fetch@2

// Test Configuration
const CONFIG = {
    // Test parameters matching your example
    historyStartTime: '2025-08-01 05:00:00', // Historical data start time
    startTime: '2025-08-01 06:02:00', // Start at 06:02
    symbol: 'BTCUSDT',
    timeframe: '5m',
    speed: 60, // 60x speed
    testDurationMs: 13000, // Run test for 13 seconds, so the last candle will to 06:15:00
    
    // API endpoints
    backendUrl: 'http://localhost:8080',
    wsUrl: 'ws://localhost:8080/ws',
    
    // Binance API for comparison
    binanceApiUrl: 'https://api.binance.com/api/v3/klines'
};

class DataReplayTester {
    constructor() {
        this.ws = null;
        this.simulationData = [];
        this.realHistoricalData = [];
        this.testStartTime = null;
        this.isTestRunning = false;
        this.receivedUpdates = 0;
    }

    // Convert date string to timestamp
    dateToTimestamp(dateStr) {
        return new Date(dateStr).getTime();
    }

    // Format timestamp for display
    formatTimestamp(timestamp) {
        return new Date(timestamp).toISOString().replace('T', ' ').slice(0, 19);
    }

    // Start the test
    async runTest() {
        console.log('='.repeat(80));
        console.log('DATA REPLAY TEST SCRIPT');
        console.log('='.repeat(80));
        console.log(`Test Config:`);
        console.log(`  Start Time: ${CONFIG.startTime}`);
        console.log(`  Symbol: ${CONFIG.symbol}`);
        console.log(`  Timeframe: ${CONFIG.timeframe}`);
        console.log(`  Speed: ${CONFIG.speed}x`);
        console.log(`  Duration: ${CONFIG.testDurationMs / 1000}s`);
        console.log('');

        try {
            // Step 1: Load historical data with incomplete candle
            console.log('Step 1: Loading historical data with incomplete candle...');
            await this.loadHistoricalDataWithIncompleteCandle();

            // Step 2: Start realtime simulation
            console.log('\nStep 2: Starting realtime simulation...');
            await this.startRealtimeSimulation();

            // Step 3: Monitor updates for test duration
            console.log('\nStep 3: Monitoring progressive candle updates...');
            await this.monitorUpdates();

            // Step 4: Fetch real historical data for comparison
            console.log('\nStep 4: Fetching real historical data for comparison...');
            await this.fetchRealHistoricalData();

            // Step 5: Compare results
            console.log('\nStep 5: Comparing simulation vs real data...');
            this.compareResults();

        } catch (error) {
            console.error('Test failed:', error);
        } finally {
            await this.cleanup();
        }
    }

    // Step 1: Load historical data with incomplete candle
    async loadHistoricalDataWithIncompleteCandle() {
        const historicalStartTimestamp = this.dateToTimestamp(CONFIG.historyStartTime);
        const startTimestamp = this.dateToTimestamp(CONFIG.startTime);
        console.log(`  Requesting data from: ${historicalStartTimestamp} (${CONFIG.historyStartTime}) to ${startTimestamp} (${CONFIG.startTime})`);

        try {
            // First, let's check what data would be available
            const response = await fetch(`${CONFIG.backendUrl}/api/v1/market/historical?` + new URLSearchParams({
                symbol: CONFIG.symbol,
                interval: CONFIG.timeframe,
                limit: 1000,
                startTime: historicalStartTimestamp,
                endTime: startTimestamp,
                enableIncomplete: 'true'
            }));

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const responseText = await response.text();
            const data = JSON.parse(responseText).data || [];
            console.log(`  Received ${data.length || 0} historical candles`);
            
            if (data.length > 0) {
                const firstCandle = data[0];
                const lastCandle = data[data.length - 1];
                console.log(`  First candle: ${this.formatTimestamp(firstCandle.startTime)} - ${this.formatTimestamp(firstCandle.endTime)}`);
                console.log(`  Last candle:  ${this.formatTimestamp(lastCandle.startTime)} - ${this.formatTimestamp(lastCandle.endTime)}`);
                console.log(`  Last candle complete: ${lastCandle.isComplete}`);
            }

        } catch (error) {
            console.log(`  Historical data fetch failed (this is expected if no API endpoint): ${error.message}`);
        }
    }

    // Step 2: Start realtime simulation
    async startRealtimeSimulation() {
        return new Promise((resolve, reject) => {
            try {
                // Connect to WebSocket
                console.log('  Connecting to WebSocket...');
                this.ws = new WebSocket(CONFIG.wsUrl);

                this.ws.on('open', async () => {
                    console.log('  WebSocket connected');

                    try {
                        // Start simulation via API
                        const startTimestamp = this.dateToTimestamp(CONFIG.startTime);
                        const response = await fetch(`${CONFIG.backendUrl}/api/v1/simulation/start`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                symbol: CONFIG.symbol,
                                startTime: startTimestamp,
                                interval: CONFIG.timeframe,
                                speed: CONFIG.speed
                            })
                        });

                        if (!response.ok) {
                            const errorText = await response.text();
                            throw new Error(`Failed to start simulation: ${response.status} ${errorText}`);
                        }

                        const result = await response.json();
                        console.log('  Simulation started:', result.message);
                        this.testStartTime = Date.now();
                        this.isTestRunning = true;
                        resolve();

                    } catch (error) {
                        reject(error);
                    }
                });

                this.ws.on('message', (data) => {
                    try {
                        const message = JSON.parse(data.toString());
                        this.handleWebSocketMessage(message);
                    } catch (error) {
                        console.log('  Failed to parse WebSocket message:', error);
                    }
                });

                this.ws.on('error', (error) => {
                    console.error('  WebSocket error:', error);
                    reject(error);
                });

                this.ws.on('close', () => {
                    console.log('  WebSocket closed');
                });

            } catch (error) {
                reject(error);
            }
        });
    }

    // Handle WebSocket messages
    handleWebSocketMessage(message) {
        if (message.type === 'simulation_update' && message.data) {
            this.receivedUpdates++;
            const update = message.data;
            const candleStartTime = update.ohlcv.startTime;
            
            // Find existing candle data or create new entry
            let existingIndex = this.simulationData.findIndex(item => item.ohlcv.startTime === candleStartTime);
            
            const candleData = {
                timestamp: Date.now(),
                simulationTime: parseInt(update.simulationTime),
                ohlcv: update.ohlcv,
                price: update.price,
                speed: update.speed,
                progress: update.progress,
                updateCount: 1
            };

            if (existingIndex >= 0) {
                // Update existing candle with latest data
                const existing = this.simulationData[existingIndex];
                candleData.updateCount = existing.updateCount + 1;
                this.simulationData[existingIndex] = candleData;
                
                // Log progressive updates for incomplete candles
                if (!update.ohlcv.isComplete) {
                    console.log(`  Progressive update #${candleData.updateCount} for candle ${this.formatTimestamp(candleStartTime)}: ohlcv=${update.ohlcv}`);
                }
            } else {
                // New candle
                this.simulationData.push(candleData);
                console.log(`  New candle started: ${this.formatTimestamp(candleStartTime)}, Price=${update.price}, Complete=${update.ohlcv.isComplete}`);
            }

            // Log summary every 20 updates
            if (this.receivedUpdates % 20 === 0) {
                const totalCandles = this.simulationData.length;
                const incompleteCandles = this.simulationData.filter(item => !item.ohlcv.isComplete).length;
                console.log(`  Update #${this.receivedUpdates}: ${totalCandles} candles tracked (${incompleteCandles} incomplete)`);
            }
        } else if (message.type === 'simulation_start') {
            console.log('  Simulation started via WebSocket');
        } else if (message.type === 'simulation_stop') {
            console.log('  Simulation stopped');
            this.isTestRunning = false;
        }
    }

    // Step 3: Monitor updates for specified duration
    async monitorUpdates() {
        return new Promise((resolve) => {
            console.log(`  Monitoring for ${CONFIG.testDurationMs / 1000} seconds...`);
            
            const interval = setInterval(async () => {
                const elapsed = Date.now() - this.testStartTime;
                const remaining = Math.max(0, CONFIG.testDurationMs - elapsed);
                
                if (remaining === 0) {
                    clearInterval(interval);
                    console.log(`  Monitoring complete. Received ${this.receivedUpdates} updates`);
                    
                    // Stop the simulation
                    console.log(`  Stopping simulation after ${CONFIG.testDurationMs / 1000} seconds...`);
                    try {
                        const response = await fetch(`${CONFIG.backendUrl}/api/v1/simulation/stop`, {
                            method: 'POST'
                        });
                        
                        if (response.ok) {
                            console.log('  ✅ Simulation stopped successfully');
                        } else {
                            console.log('  ⚠️  Failed to stop simulation via API');
                        }
                    } catch (error) {
                        console.log(`  ⚠️  Error stopping simulation: ${error.message}`);
                    }
                    
                    resolve();
                } else if (Math.floor(remaining / 1000) % 10 === 0) {
                    console.log(`  Monitoring... ${Math.floor(remaining / 1000)}s remaining, ${this.receivedUpdates} updates received`);
                }
            }, 1000);
        });
    }

    // Step 4: Fetch real historical data from Binance API
    async fetchRealHistoricalData() {
        try {
            const historicalStartTimestamp = this.dateToTimestamp(CONFIG.historyStartTime);
            const startTimestamp = this.dateToTimestamp(CONFIG.startTime);
            const endTimestamp = startTimestamp + CONFIG.testDurationMs * CONFIG.speed; // Simulate end time based on speed

            console.log(`  Fetching real data from Binance API...`);
            console.log(`  Period: ${this.formatTimestamp(startTimestamp)} to ${this.formatTimestamp(endTimestamp)}`);

            const params = new URLSearchParams({
                symbol: CONFIG.symbol,
                interval: CONFIG.timeframe,
                startTime: historicalStartTimestamp,
                endTime: endTimestamp,
                limit: 1000
            });

            const response = await fetch(`${CONFIG.binanceApiUrl}?${params}`);
            
            if (!response.ok) {
                throw new Error(`Binance API error: ${response.status}`);
            }

            const rawData = await response.json();
            
            // Convert Binance format to our format
            this.realHistoricalData = rawData.map(kline => ({
                startTime: parseInt(kline[0]),
                endTime: parseInt(kline[6]),
                open: parseFloat(kline[1]),
                high: parseFloat(kline[2]),
                low: parseFloat(kline[3]),
                close: parseFloat(kline[4]),
                volume: parseFloat(kline[5]),
                isComplete: true // Real historical data is always complete
            }));

            console.log(`  Fetched ${this.realHistoricalData.length} real candles from Binance`);
            
            if (this.realHistoricalData.length > 0) {
                const first = this.realHistoricalData[0];
                const last = this.realHistoricalData[this.realHistoricalData.length - 1];
                console.log(`  Real data range: ${this.formatTimestamp(first.startTime)} to ${this.formatTimestamp(last.endTime)}`);
            }

        } catch (error) {
            console.error('  Failed to fetch real historical data:', error.message);
        }
    }

    // Step 5: Compare simulation data with real historical data
    compareResults() {
        console.log('\n' + '='.repeat(80));
        console.log('COMPARISON RESULTS');
        console.log('='.repeat(80));

        if (this.simulationData.length === 0) {
            console.log('❌ No simulation data received - test failed');
            return;
        }

        if (this.realHistoricalData.length === 0) {
            console.log('❌ No real historical data available for comparison');
            return;
        }

        console.log(`Simulation updates: ${this.simulationData.length}`);
        console.log(`Real candles: ${this.realHistoricalData.length}`);

        // Analyze incomplete candles
        const incompleteCandles = this.simulationData.filter(candle => !candle.ohlcv.isComplete);
        const completeCandles = this.simulationData.filter(candle => candle.ohlcv.isComplete);

        console.log(`\nIncomplete candles: ${incompleteCandles.length}`);
        console.log(`Complete candles: ${completeCandles.length}`);
        
        // Show total progressive updates
        const totalProgressiveUpdates = this.simulationData.reduce((sum, candle) => sum + candle.updateCount, 0);
        console.log(`Total progressive updates: ${totalProgressiveUpdates}`);

        if (incompleteCandles.length > 0) {
            console.log('\n📊 INCOMPLETE CANDLE ANALYSIS:');

            incompleteCandles.forEach(candleData => {
                const startTime = candleData.ohlcv.startTime;
                
                console.log(`\nCandle ${this.formatTimestamp(startTime)}:`);
                console.log(`  Progressive updates: ${candleData.updateCount}`);
                console.log(`  Final price: ${candleData.ohlcv.close}`);
                console.log(`  OHLC: ${candleData.ohlcv.open}/${candleData.ohlcv.high}/${candleData.ohlcv.low}/${candleData.ohlcv.close}`);
                console.log(`  Volume: ${candleData.ohlcv.volume}`);
                
                // Find matching real candle
                const realCandle = this.realHistoricalData.find(candle => candle.startTime === startTime);
                if (realCandle) {
                    console.log(`  Real OHLC: ${realCandle.open}/${realCandle.high}/${realCandle.low}/${realCandle.close}`);
                    console.log(`  Real Volume: ${realCandle.volume}`);
                    
                    // Compare values
                    const priceDiff = Math.abs(candleData.ohlcv.close - realCandle.close);
                    const pricePercDiff = (priceDiff / realCandle.close * 100).toFixed(4);
                    const volumeDiff = Math.abs(candleData.ohlcv.volume - realCandle.volume);
                    const volumePercDiff = realCandle.volume > 0 ? (volumeDiff / realCandle.volume * 100).toFixed(4) : 'N/A';
                    
                    console.log(`  Price difference: ${priceDiff} (${pricePercDiff}%)`);
                    console.log(`  Volume difference: ${volumeDiff} (${volumePercDiff}%)`);
                    
                    if (parseFloat(pricePercDiff) < 0.01) {
                        console.log('  ✅ Price match is excellent');
                    } else if (parseFloat(pricePercDiff) < 0.1) {
                        console.log('  ✅ Price match is good');
                    } else {
                        console.log('  ❌ Price difference is significant');
                    }
                } else {
                    console.log('  ⚠️  No matching real candle found');
                }
            });
        }

        // Overall test result
        console.log('\n' + '='.repeat(80));
        if (incompleteCandles.length > 0 && completeCandles.length > 0) {
            console.log('✅ TEST PASSED: Both incomplete and complete candles were generated');
        } else if (incompleteCandles.length > 0) {
            console.log('⚠️  PARTIAL PASS: Only incomplete candles generated (simulation may have ended early)');
        } else {
            console.log('❌ TEST FAILED: No incomplete candles were generated');
        }

        console.log(`\nPerformance metrics:`);
        console.log(`  Updates per second: ${(this.receivedUpdates / (CONFIG.testDurationMs / 1000)).toFixed(2)}`);
        console.log(`  Average simulation speed: ${CONFIG.speed}x (configured)`);
        console.log('='.repeat(80));
    }

    // Cleanup
    async cleanup() {
        console.log('\nCleaning up...');
        
        if (this.ws && this.isTestRunning) {
            try {
                // Stop simulation
                await fetch(`${CONFIG.backendUrl}/api/v1/simulation/stop`, {
                    method: 'POST'
                });
                console.log('  Simulation stopped');
            } catch (error) {
                console.log('  Failed to stop simulation:', error.message);
            }
        }

        if (this.ws) {
            this.ws.close();
            console.log('  WebSocket closed');
        }

        console.log('Cleanup complete');
    }
}

// Run the test
async function main() {
    const tester = new DataReplayTester();
    await tester.runTest();
    process.exit(0);
}

// Handle process termination
process.on('SIGINT', async () => {
    console.log('\n\nTest interrupted by user');
    process.exit(1);
});

process.on('SIGTERM', async () => {
    console.log('\n\nTest terminated');
    process.exit(1);
});

// Check if we're running this script directly
if (require.main === module) {
    main().catch(error => {
        console.error('Test failed with error:', error);
        process.exit(1);
    });
}

module.exports = DataReplayTester;