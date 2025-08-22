import React, { useState, useCallback, useEffect } from 'react';
import Chart from './components/Chart';
import ChartControls from './components/ChartControls';
import StartTimeSelector from './components/StartTimeSelector';
import SimulationControls from './components/SimulationControls';
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

  const handleTimeframeChange = useCallback((newTimeframe: string) => {
    setTimeframe(newTimeframe);
  }, []);

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
    } catch (error) {
      console.error('Failed to change speed:', error);
    }
  }, []);

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
        
        <StartTimeSelector
          onStartTimeSelected={handleStartTimeSelected}
          selectedStartTime={selectedStartTime}
          symbol={symbol}
        />
        
        <SimulationControls
          selectedStartTime={selectedStartTime}
          onStartSimulation={handleStartSimulation}
          onPauseSimulation={handlePauseSimulation}
          onResumeSimulation={handleResumeSimulation}
          onStopSimulation={handleStopSimulation}
          onSpeedChange={handleSpeedChange}
          simulationState={simulationState.state}
          currentSpeed={simulationState.speed}
          currentSimulationTime={simulationState.simulationTime}
          currentPrice={simulationState.currentPrice}
          progress={simulationState.progress}
          symbol={symbol}
        />
        
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <ChartControls
            symbol={symbol}
            timeframe={timeframe}
            onSymbolChange={setSymbol}
            onTimeframeChange={handleTimeframeChange}
          />
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
