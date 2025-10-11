import React from 'react';
import SymbolPanel from './SymbolPanel';
import StartTimePanel from './StartTimePanel';
import SpeedPanel from './SpeedPanel';
import TradingModePanel from './TradingModePanel';
import ActionPanel from './ActionPanel';

interface ControlPanelProps {
  // Symbol props
  symbol: string;
  onSymbolChange: (symbol: string) => void;

  // Start time props
  selectedStartTime: Date | null;
  onStartTimeSelected: (startTime: Date) => void;
  currentSimulationTime: number | null;

  // Initial funding props
  initialFunding: number;
  onInitialFundingChange: (funding: number) => void;

  // Speed props
  currentSpeed: number;
  onSpeedChange: (speed: number) => void;

  // Trading mode props
  tradingMode: 'spot' | 'future';
  leverage: number;
  onTradingModeChange: (mode: 'spot' | 'future') => void;
  onLeverageChange: (leverage: number) => void;

  // Controls props
  onStartSimulation: () => void;
  onPauseSimulation: () => void;
  onResumeSimulation: () => void;
  onStopSimulation: () => void;
  canResume: boolean;

  // Common props
  simulationState: 'stopped' | 'playing' | 'paused';
}

const ControlPanels: React.FC<ControlPanelProps> = ({
  symbol,
  onSymbolChange,
  selectedStartTime,
  onStartTimeSelected,
  currentSimulationTime,
  initialFunding,
  onInitialFundingChange,
  currentSpeed,
  onSpeedChange,
  tradingMode,
  leverage,
  onTradingModeChange,
  onLeverageChange,
  onStartSimulation,
  onPauseSimulation,
  onResumeSimulation,
  onStopSimulation,
  canResume,
  simulationState
}) => {
  const isDisabled = simulationState !== 'stopped';

  return (
    <div style={{
      display: 'flex',
      height: '140px',
      backgroundColor: '#f8f9fa',
      border: '1px solid #dee2e6',
      borderRadius: '8px',
      marginBottom: '20px',
      overflow: 'hidden',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      {/* Panel 1: Symbol */}
      <div style={{
        flex: '1',
        padding: '15px',
        borderRight: '1px solid #dee2e6',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <SymbolPanel
          symbol={symbol}
          onSymbolChange={onSymbolChange}
          initialFunding={initialFunding}
          onInitialFundingChange={onInitialFundingChange}
          disabled={isDisabled}
        />
      </div>

      {/* Panel 2: Start Time */}
      <div style={{
        flex: '1.2',
        padding: '15px',
        borderRight: '1px solid #dee2e6',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <StartTimePanel
          onStartTimeSelected={onStartTimeSelected}
          selectedStartTime={selectedStartTime}
          symbol={symbol}
          disabled={isDisabled}
          currentSimulationTime={currentSimulationTime}
        />
      </div>

      {/* Panel 3: Speed */}
      <div style={{
        flex: '1.5',
        padding: '15px',
        borderRight: '1px solid #dee2e6',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <SpeedPanel
          currentSpeed={currentSpeed}
          onSpeedChange={onSpeedChange}
        />
      </div>

      {/* Panel 4: Trading Mode */}
      <div style={{
        flex: '1',
        padding: '15px',
        borderRight: '1px solid #dee2e6',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <TradingModePanel
          tradingMode={tradingMode}
          leverage={leverage}
          onTradingModeChange={onTradingModeChange}
          onLeverageChange={onLeverageChange}
          disabled={isDisabled}
        />
      </div>

      {/* Panel 5: Controls */}
      <div style={{
        flex: '1',
        padding: '15px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <ActionPanel
          selectedStartTime={selectedStartTime}
          onStartSimulation={onStartSimulation}
          onPauseSimulation={onPauseSimulation}
          onResumeSimulation={onResumeSimulation}
          onStopSimulation={onStopSimulation}
          simulationState={simulationState}
          canResume={canResume}
        />
      </div>
    </div>
  );
};

export default ControlPanels;