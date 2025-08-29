#!/usr/bin/env node

/**
 * Simple Data Replay Test
 * Quick test script focusing on incomplete candle functionality
 */

const WebSocket = require('ws');

const CONFIG = {
    startTime: '2024-08-27 06:02:00',
    symbol: 'BTCUSDT',
    timeframe: '5m',
    speed: 60,
    testDurationMs: 30000, // 30 seconds
    backendUrl: 'http://localhost:8080',
    wsUrl: 'ws://localhost:8080/api/v1/websocket',
};

class SimpleReplayTester {
    constructor() {
        this.candles = new Map(); // Track candles by startTime
        this.totalUpdates = 0;
        this.ws = null;
    }

    async run() {
        console.log('🚀 Starting Simple Data Replay Test');
        console.log(`📅 Start Time: ${CONFIG.startTime} (${CONFIG.timeframe} @ ${CONFIG.speed}x)`);
        
        await this.connectWebSocket();
        await this.startSimulation();
        await this.monitorForDuration(CONFIG.testDurationMs);
        await this.analyzeResults();
        await this.cleanup();
    }

    connectWebSocket() {
        return new Promise((resolve, reject) => {
            this.ws = new WebSocket(CONFIG.wsUrl);
            
            this.ws.on('open', () => {
                console.log('✅ WebSocket connected');
                resolve();
            });
            
            this.ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                if (message.type === 'simulation_update') {
                    this.totalUpdates++;
                    const update = message.data;
                    const startTime = update.ohlcv.startTime;
                    
                    // Track progressive updates for same candle
                    if (this.candles.has(startTime)) {
                        const existing = this.candles.get(startTime);
                        existing.updateCount++;
                        existing.data = update;
                        existing.lastUpdate = Date.now();
                    } else {
                        this.candles.set(startTime, {
                            data: update,
                            updateCount: 1,
                            firstUpdate: Date.now(),
                            lastUpdate: Date.now()
                        });
                    }
                }
            });
            
            this.ws.on('error', reject);
        });
    }

    async startSimulation() {
        const startTimestamp = new Date(CONFIG.startTime).getTime();
        
        console.log('🎬 Starting simulation...');
        
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
            throw new Error(`Failed to start: ${response.status}`);
        }

        console.log('✅ Simulation started');
    }

    async monitorForDuration(ms) {
        console.log(`⏱️  Monitoring for ${ms/1000} seconds...`);
        
        return new Promise(resolve => {
            setTimeout(async () => {
                console.log(`📊 Received ${this.totalUpdates} total updates for ${this.candles.size} unique candles`);
                
                // Stop simulation
                console.log('🛑 Auto-stopping simulation...');
                try {
                    await fetch(`${CONFIG.backendUrl}/api/v1/simulation/stop`, { method: 'POST' });
                    console.log('✅ Simulation stopped');
                } catch (e) {
                    console.log('⚠️  Failed to auto-stop simulation');
                }
                
                resolve();
            }, ms);
        });
    }

    analyzeResults() {
        console.log('\n📈 ANALYSIS:');
        
        if (this.candles.size === 0) {
            console.log('❌ No candles received');
            return;
        }

        const candleArray = Array.from(this.candles.values());
        const incomplete = candleArray.filter(c => !c.data.ohlcv.isComplete);
        const complete = candleArray.filter(c => c.data.ohlcv.isComplete);
        
        console.log(`   Total updates: ${this.totalUpdates}`);
        console.log(`   Unique candles: ${this.candles.size}`);
        console.log(`   Complete candles: ${complete.length}`);
        console.log(`   Incomplete candles: ${incomplete.length}`);
        
        if (incomplete.length > 0) {
            console.log('✅ Incomplete candles detected - progressive updates working!');
            
            // Show details for candles with multiple updates
            const multiUpdate = candleArray.filter(c => c.updateCount > 1);
            if (multiUpdate.length > 0) {
                console.log(`   Candles with progressive updates: ${multiUpdate.length}`);
                const maxUpdates = Math.max(...multiUpdate.map(c => c.updateCount));
                const mostUpdated = multiUpdate.find(c => c.updateCount === maxUpdates);
                console.log(`   Max updates for single candle: ${maxUpdates}`);
                
                if (mostUpdated) {
                    const startTime = new Date(mostUpdated.data.ohlcv.startTime).toISOString().slice(11, 19);
                    console.log(`   Most updated candle: ${startTime} (${mostUpdated.updateCount} updates)`);
                    console.log(`   Final price: ${mostUpdated.data.price}`);
                }
            }
        } else {
            console.log('⚠️  No incomplete candles - may need different start time');
        }
    }

    async cleanup() {
        if (this.ws) {
            this.ws.close();
        }
        
        try {
            await fetch(`${CONFIG.backendUrl}/api/v1/simulation/stop`, { method: 'POST' });
            console.log('🛑 Simulation stopped');
        } catch (e) {
            console.log('⚠️  Failed to stop simulation');
        }
    }
}

// Global fetch polyfill for Node.js
global.fetch = require('node-fetch');

// Run test
if (require.main === module) {
    new SimpleReplayTester().run().catch(console.error);
}