import React, { useState, useCallback, useEffect } from 'react';
import Chart from './components/Chart';
import StartTimeSelector from './components/StartTimeSelector';
import SimulationControls from './components/SimulationControls';
import SymbolSelector from './components/SymbolSelector';
import TimeframeSelector, { isTimeframeAllowed, getMinAllowedTimeframe } from './components/TimeframeSelector';
import OrderPanel from './components/OrderPanel';
import Portfolio from './components/Portfolio';
import TradingTabs from './components/TradingTabs';
import FloatingMessage from './components/FloatingMessage';
import { WebSocketProvider, useWebSocketContext } from './contexts/WebSocketContext';
import { PositionsProvider } from './contexts/PositionsContext';
import { ConnectionState } from './hooks/useWebSocket';
// Removed SimulationApiService import - now using WebSocket
import './App.css';

interface SimulationState {
  state: 'stopped' | 'playing' | 'paused';
  speed: number;
  simulationTime: number | null; // Current simulation time in milliseconds
  startTime: number | null; // Simulation start time in milliseconds
  progress: number;
  lastCandle: {
    startTime: number;
    endTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    isComplete: boolean;
  } | null;
}

function AppContent() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [selectedStartTime, setSelectedStartTime] = useState<Date | null>(null);
  const [initialFunding, setInitialFunding] = useState<number>(10000);
  const [simulationState, setSimulationState] = useState<SimulationState>({
    state: 'stopped',
    speed: 60, // Default to 60x (1s → 1m)
    simulationTime: null,
    startTime: null,
    progress: 0,
    lastCandle: null
  });

  const { 
    lastSimulationUpdate,
    currentSimulationStatus,
    connectionState,
    floatingMessages,
    removeFloatingMessage,
    startSimulation: wsStartSimulation,
    stopSimulation: wsStopSimulation,
    pauseSimulation: wsPauseSimulation,
    resumeSimulation: wsResumeSimulation,
    setSpeed: wsSetSpeed,
    setTimeframe: wsSetTimeframe,
    getStatus: wsGetStatus
  } = useWebSocketContext();

  // Sync simulation state on component mount
  useEffect(() => {
    const syncSimulationState = async () => {
      try {
        const status = await wsGetStatus();
        console.log('Syncing simulation state from backend:', status);
        
        setSimulationState(prev => ({
          ...prev,
          state: status.state as 'stopped' | 'playing' | 'paused',
          speed: status.speed,
          simulationTime: status.currentPriceTime || null,
          startTime: status.startTime ? parseInt(status.startTime) : null,
          progress: status.progress,
          lastCandle: null // Clear on sync
        }));

        // If simulation is running, also sync the selected start time and symbol
        if (status.state !== 'stopped' && status.symbol && status.startTime) {
          setSymbol(status.symbol);
          setSelectedStartTime(new Date(parseInt(status.startTime)));
          // Set timeframe based on backend interval
          if (status.interval) {
            setTimeframe(status.interval);
          }
        }
      } catch (error) {
        console.error('Failed to sync simulation state:', error);
      }
    };

    // Only sync when WebSocket is connected
    if (connectionState === ConnectionState.CONNECTED) {
      const timer = setTimeout(syncSimulationState, 500);
      return () => clearTimeout(timer);
    }
  }, [connectionState, wsGetStatus]);

  // Handle simulation updates from WebSocket
  useEffect(() => {
    if (lastSimulationUpdate) {
      setSimulationState(prev => ({
        ...prev,
        state: lastSimulationUpdate.state as 'stopped' | 'playing' | 'paused',
        simulationTime: lastSimulationUpdate.simulationTime,
        progress: lastSimulationUpdate.progress,
        speed: lastSimulationUpdate.speed,
        startTime: prev.startTime, // Preserve start time
        lastCandle: lastSimulationUpdate.baseCandle // Always update candle from backend
      }));
    }
  }, [lastSimulationUpdate]);

  // Handle status updates from WebSocket (like when simulation stops due to end of data)
  useEffect(() => {
    if (currentSimulationStatus) {
      setSimulationState(prev => ({
        ...prev,
        state: currentSimulationStatus.state as 'stopped' | 'playing' | 'paused',
        speed: currentSimulationStatus.speed,
        simulationTime: currentSimulationStatus.currentPriceTime || prev.simulationTime,
        progress: currentSimulationStatus.progress,
        startTime: currentSimulationStatus.startTime ? parseInt(currentSimulationStatus.startTime) : prev.startTime
      }));

      // If simulation stopped and we have symbol/interval info, sync them
      if (currentSimulationStatus.state === 'stopped' && currentSimulationStatus.symbol) {
        setSymbol(currentSimulationStatus.symbol);
        if (currentSimulationStatus.interval) {
          setTimeframe(currentSimulationStatus.interval);
        }
      }
    }
  }, [currentSimulationStatus]);

  const handleStartTimeSelected = useCallback((startTime: Date) => {
    setSelectedStartTime(startTime);
    
    // Reset simulation time when new start time is selected (if not currently running)
    if (simulationState.state === 'stopped') {
      setSimulationState(prev => ({
        ...prev,
        simulationTime: null,
        startTime: null,
        lastCandle: null
      }));
    }
  }, [simulationState.state]);

  const handleTimeframeChange = useCallback(async (newTimeframe: string) => {
    // If simulation is running, use WebSocket to change timeframe mid-simulation
    if (simulationState.state === 'playing' || simulationState.state === 'paused') {
      try {
        await wsSetTimeframe(newTimeframe);
        console.log(`Timeframe changed to ${newTimeframe} during simulation`);
      } catch (error) {
        console.error('Failed to change timeframe during simulation:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error(`Failed to change timeframe: ${errorMessage}`);
        return; // Don't update local state if call failed
      }
    }
    
    setTimeframe(newTimeframe);
  }, [simulationState.state, wsSetTimeframe]);

  const handleStartSimulation = useCallback(async () => {
    if (!selectedStartTime) return;

    try {
      await wsStartSimulation(symbol, selectedStartTime, timeframe, simulationState.speed, initialFunding);
      setSimulationState(prev => ({ 
        ...prev, 
        state: 'playing',
        startTime: selectedStartTime.getTime(),
        simulationTime: selectedStartTime.getTime()
      }));
    } catch (error) {
      console.error('Failed to start simulation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('simulation already running')) {
        console.warn('A simulation is already running. Please stop the current simulation before starting a new one.');
        // Refresh the simulation state to sync with backend
        try {
          const status = await wsGetStatus();
          setSimulationState(prev => ({
            ...prev,
            state: status.state as 'stopped' | 'playing' | 'paused',
            speed: status.speed,
            simulationTime: status.currentPriceTime || null,
            startTime: status.startTime ? parseInt(status.startTime) : null,
            progress: status.progress
          }));
        } catch (syncError) {
          console.error('Failed to sync simulation state:', syncError);
        }
      } else {
        console.error(`Failed to start simulation: ${errorMessage}`);
      }
    }
  }, [selectedStartTime, symbol, timeframe, simulationState.speed, initialFunding, wsStartSimulation, wsGetStatus]);

  const handlePauseSimulation = useCallback(async () => {
    try {
      await wsPauseSimulation();
      setSimulationState(prev => ({ ...prev, state: 'paused' }));
    } catch (error) {
      console.error('Failed to pause simulation:', error);
    }
  }, [wsPauseSimulation]);

  const handleResumeSimulation = useCallback(async () => {
    try {
      await wsResumeSimulation();
      setSimulationState(prev => ({ ...prev, state: 'playing' }));
    } catch (error) {
      console.error('Failed to resume simulation:', error);
    }
  }, [wsResumeSimulation]);

  const handleStopSimulation = useCallback(async () => {
    try {
      await wsStopSimulation();
      setSimulationState(prev => ({
        ...prev,
        state: 'stopped',
        progress: 0
        // Keep simulationTime, startTime, and lastCandle to show final state
      }));
    } catch (error) {
      console.error('Failed to stop simulation:', error);
    }
  }, [wsStopSimulation]);

  const handleSpeedChange = useCallback(async (speed: number) => {
    try {
      await wsSetSpeed(speed);
      setSimulationState(prev => ({ ...prev, speed }));
      
      // Check if current timeframe is still valid with new speed
      if (!isTimeframeAllowed(timeframe, speed)) {
        const minAllowedTimeframe = getMinAllowedTimeframe(speed);
        console.log(`Speed change to ${speed}x makes current timeframe ${timeframe} invalid. Auto-switching to ${minAllowedTimeframe}`);
        
        // Auto-adjust timeframe to minimum allowed
        try {
          await handleTimeframeChange(minAllowedTimeframe);
        } catch (timeframeError) {
          console.error('Failed to auto-adjust timeframe:', timeframeError);
          // Don't alert here as the speed change itself succeeded
        }
      }
    } catch (error) {
      console.error('Failed to change speed:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error(`Failed to change speed: ${errorMessage}`);
    }
  }, [timeframe, handleTimeframeChange, wsSetSpeed]);

  return (
    <div className="App">
      <div style={{
        maxWidth: '100%',
        margin: '20px auto',
        padding: '0 20px'
      }}>
        <h1 style={{
          textAlign: 'center',
          margin: '0 0 20px 0',
          fontSize: '24px',
          color: '#333'
        }}>
          Trade Simulator
        </h1>
        
        {/* 5-Block Control Panel */}
        <div style={{
          display: 'flex',
          height: '120px',
          backgroundColor: '#f8f9fa',
          border: '1px solid #dee2e6',
          borderRadius: '8px',
          marginBottom: '20px',
          overflow: 'hidden',
          boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
        }}>
          {/* Block 1: Symbol + Latest Price */}
          <div style={{
            flex: '1',
            padding: '15px',
            borderRight: '1px solid #dee2e6',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}>
            <SymbolSelector
              symbol={symbol}
              onSymbolChange={setSymbol}
              disabled={simulationState.state !== 'stopped'}
            />
          </div>
          
          {/* Block 2: Start Time Picker */}
          <div style={{
            flex: '1.2',
            padding: '15px',
            borderRight: '1px solid #dee2e6',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}>
            <StartTimeSelector
              onStartTimeSelected={handleStartTimeSelected}
              selectedStartTime={selectedStartTime}
              symbol={symbol}
              compact={true}
            />
          </div>

          {/* Block 3: Initial Funding */}
          <div style={{
            flex: '1',
            padding: '15px',
            borderRight: '1px solid #dee2e6',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}>
            <div>
              <label style={{ 
                fontSize: '12px', 
                color: '#666',
                display: 'block',
                marginBottom: '4px'
              }}>
                Initial Funding ($)
              </label>
              <input
                type="number"
                min="1000"
                max="1000000"
                step="1000"
                value={initialFunding}
                onChange={(e) => setInitialFunding(Math.max(1000, parseInt(e.target.value) || 1000))}
                disabled={simulationState.state !== 'stopped'}
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  fontSize: '14px',
                  border: '1px solid #ccc',
                  borderRadius: '4px',
                  backgroundColor: simulationState.state !== 'stopped' ? '#f5f5f5' : 'white'
                }}
                placeholder="10000"
              />
            </div>
          </div>
          
          {/* Block 4: Speed Controls */}
          <div style={{
            flex: '1.5',
            padding: '15px',
            borderRight: '1px solid #dee2e6',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}>
            <SimulationControls
              selectedStartTime={selectedStartTime}
              onStartSimulation={handleStartSimulation}
              onPauseSimulation={handlePauseSimulation}
              onResumeSimulation={handleResumeSimulation}
              onStopSimulation={handleStopSimulation}
              onSpeedChange={handleSpeedChange}
              simulationState={simulationState.state}
              currentSpeed={simulationState.speed}
              symbol={symbol}
              blockType="speed"
            />
          </div>
          
          {/* Block 5: Start/Stop Controls */}
          <div style={{
            flex: '1',
            padding: '15px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center'
          }}>
            <SimulationControls
              selectedStartTime={selectedStartTime}
              onStartSimulation={handleStartSimulation}
              onPauseSimulation={handlePauseSimulation}
              onResumeSimulation={handleResumeSimulation}
              onStopSimulation={handleStopSimulation}
              onSpeedChange={handleSpeedChange}
              simulationState={simulationState.state}
              currentSpeed={simulationState.speed}
              symbol={symbol}
              blockType="controls"
            />
          </div>
        </div>
        
        {/* Main Content Area - Chart and Trading */}
        <PositionsProvider
          connectionState={connectionState}
          currentPrice={simulationState.lastCandle?.close || 0}
          symbol={symbol}
          simulationState={simulationState.state}
        >
          <div style={{
            display: 'flex',
            gap: '20px',
            marginBottom: '20px'
          }}>
            {/* Chart Section */}
            <div style={{
              flex: '2',
              backgroundColor: 'white',
              borderRadius: '8px',
              boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
              overflow: 'hidden'
            }}>
              {/* Timeframe Selector at top of chart */}
              <div style={{
                padding: '10px 15px',
                backgroundColor: '#f8f9fa',
                borderBottom: '1px solid #dee2e6',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <h3 style={{ margin: 0, fontSize: '16px', color: '#333' }}>
                  Price Chart - {symbol}
                </h3>
                <TimeframeSelector
                  timeframe={timeframe}
                  onTimeframeChange={handleTimeframeChange}
                  compact={false}
                  currentSpeed={simulationState.speed}
                />
              </div>
              
              <Chart 
                symbol={symbol} 
                timeframe={timeframe}
                selectedStartTime={selectedStartTime}
                simulationState={simulationState}
              />
            </div>

            {/* Trading Panel */}
            <div style={{
              flex: '1',
              display: 'flex',
              flexDirection: 'column',
              gap: '20px'
            }}>
              {/* Order Panel */}
              <OrderPanel
                symbol={symbol}
                currentPrice={simulationState.lastCandle?.close || 0}
                simulationState={simulationState.state}
              />

              {/* Portfolio Summary */}
              <Portfolio
                initialFunding={initialFunding}
              />
            </div>
          </div>

          {/* Trading Tabs Section - Under Chart */}
          <div style={{
            marginBottom: '20px'
          }}>
            <TradingTabs
              connectionState={connectionState}
              currentPrice={simulationState.lastCandle?.close || 0}
              symbol={symbol}
              simulationState={simulationState.state}
            />
          </div>
        </PositionsProvider>
      </div>
      
      {/* Floating Messages */}
      <FloatingMessage 
        messages={floatingMessages}
        onMessageExpire={removeFloatingMessage}
      />
    </div>
  );
}

function App() {
  return (
    <WebSocketProvider>
      <AppContent />
    </WebSocketProvider>
  );
}

export default App;
