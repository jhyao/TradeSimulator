import React, { useState, useCallback, useEffect } from 'react';
import Chart from './components/Chart';
import StartTimeSelector from './components/StartTimeSelector';
import SimulationControls from './components/SimulationControls';
import SymbolSelector from './components/SymbolSelector';
import TimeframeSelector, { isTimeframeAllowed, getMinAllowedTimeframe } from './components/TimeframeSelector';
import { WebSocketProvider, useWebSocketContext } from './contexts/WebSocketContext';
import { SimulationApiService } from './services/simulationApi';
import './App.css';

interface SimulationState {
  state: 'stopped' | 'playing' | 'paused';
  speed: number;
  currentPrice: number | null;
  simulationTime: Date | null;
  progress: number;
}

function AppContent() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1h');
  const [selectedStartTime, setSelectedStartTime] = useState<Date | null>(null);
  const [simulationState, setSimulationState] = useState<SimulationState>({
    state: 'stopped',
    speed: 60, // Default to 60x (1s → 1m)
    currentPrice: null,
    simulationTime: null,
    progress: 0
  });

  const { lastSimulationUpdate } = useWebSocketContext();

  // Sync simulation state on component mount
  useEffect(() => {
    const syncSimulationState = async () => {
      try {
        const status = await SimulationApiService.getStatus();
        console.log('Syncing simulation state from backend:', status);
        
        setSimulationState(prev => ({
          ...prev,
          state: status.state as 'stopped' | 'playing' | 'paused',
          speed: status.speed,
          currentPrice: status.currentPrice || null,
          simulationTime: status.currentTime ? new Date(status.currentTime) : null,
          progress: status.progress
        }));

        // If simulation is running, also sync the selected start time and symbol
        if (status.state !== 'stopped' && status.symbol && status.startTime) {
          setSymbol(status.symbol);
          setSelectedStartTime(new Date(status.startTime));
          // Set timeframe based on backend interval
          if (status.interval) {
            setTimeframe(status.interval);
          }
        }
      } catch (error) {
        console.error('Failed to sync simulation state:', error);
      }
    };

    syncSimulationState();
  }, []);

  // Handle simulation updates from WebSocket
  useEffect(() => {
    if (lastSimulationUpdate) {
      setSimulationState(prev => ({
        ...prev,
        state: lastSimulationUpdate.state as 'stopped' | 'playing' | 'paused',
        currentPrice: lastSimulationUpdate.price,
        simulationTime: new Date(lastSimulationUpdate.timestamp),
        progress: lastSimulationUpdate.progress,
        speed: lastSimulationUpdate.speed
      }));
    }
  }, [lastSimulationUpdate]);

  const handleStartTimeSelected = useCallback((startTime: Date) => {
    setSelectedStartTime(startTime);
  }, []);

  const handleTimeframeChange = useCallback(async (newTimeframe: string) => {
    // If simulation is running, call API to change timeframe mid-simulation
    if (simulationState.state === 'playing' || simulationState.state === 'paused') {
      try {
        await SimulationApiService.setTimeframe(newTimeframe);
        console.log(`Timeframe changed to ${newTimeframe} during simulation`);
      } catch (error) {
        console.error('Failed to change timeframe during simulation:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        alert(`Failed to change timeframe: ${errorMessage}`);
        return; // Don't update local state if API call failed
      }
    }
    
    setTimeframe(newTimeframe);
  }, [simulationState.state]);

  const handleStartSimulation = useCallback(async () => {
    if (!selectedStartTime) return;

    try {
      await SimulationApiService.startSimulation(symbol, selectedStartTime, timeframe, simulationState.speed);
      setSimulationState(prev => ({ ...prev, state: 'playing' }));
    } catch (error) {
      console.error('Failed to start simulation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      
      if (errorMessage.includes('simulation already running')) {
        alert('A simulation is already running. Please stop the current simulation before starting a new one.');
        // Refresh the simulation state to sync with backend
        try {
          const status = await SimulationApiService.getStatus();
          setSimulationState(prev => ({
            ...prev,
            state: status.state as 'stopped' | 'playing' | 'paused',
            speed: status.speed,
            currentPrice: status.currentPrice || null,
            simulationTime: status.currentTime ? new Date(status.currentTime) : null,
            progress: status.progress
          }));
        } catch (syncError) {
          console.error('Failed to sync simulation state:', syncError);
        }
      } else {
        alert(`Failed to start simulation: ${errorMessage}`);
      }
    }
  }, [selectedStartTime, symbol, timeframe, simulationState.speed]);

  const handlePauseSimulation = useCallback(async () => {
    try {
      await SimulationApiService.pauseSimulation();
      setSimulationState(prev => ({ ...prev, state: 'paused' }));
    } catch (error) {
      console.error('Failed to pause simulation:', error);
    }
  }, []);

  const handleResumeSimulation = useCallback(async () => {
    try {
      await SimulationApiService.resumeSimulation();
      setSimulationState(prev => ({ ...prev, state: 'playing' }));
    } catch (error) {
      console.error('Failed to resume simulation:', error);
    }
  }, []);

  const handleStopSimulation = useCallback(async () => {
    try {
      await SimulationApiService.stopSimulation();
      setSimulationState(prev => ({
        ...prev,
        state: 'stopped',
        currentPrice: null,
        simulationTime: null,
        progress: 0
      }));
    } catch (error) {
      console.error('Failed to stop simulation:', error);
    }
  }, []);

  const handleSpeedChange = useCallback(async (speed: number) => {
    try {
      await SimulationApiService.setSpeed(speed);
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
      alert(`Failed to change speed: ${errorMessage}`);
    }
  }, [timeframe, handleTimeframeChange]);

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
        
        {/* 4-Block Control Panel */}
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
            flex: '1.5',
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
          
          {/* Block 3: Speed Controls */}
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
          
          {/* Block 4: Start/Stop Controls */}
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
        
        <div style={{
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
            simulationState={simulationState.state}
            simulationData={lastSimulationUpdate ? {
              price: lastSimulationUpdate.price,
              timestamp: lastSimulationUpdate.timestamp,
              ohlcv: lastSimulationUpdate.ohlcv,
              simulationTime: lastSimulationUpdate.simulationTime
            } : null}
          />
        </div>
      </div>
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
