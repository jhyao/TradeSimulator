import React, { useState } from 'react';
import { formatNumber } from '../utils/numberFormat';

// Speed presets for quick selection
const SPEED_PRESETS = [
  { value: 1, label: "1x" },
  { value: 30, label: "30x" },
  { value: 60, label: "60x" },
  { value: 120, label: "120x" },
  { value: 300, label: "300x" },
  { value: 600, label: "600x" },
  { value: 1800, label: "1800x" },
  { value: 3600, label: "3600x" },
];


// Helper function to get speed description
const getSpeedDescription = (speed: number): string => {
  const marketMinPerSec = speed / 60;
  if (marketMinPerSec < 1) {
    return `${formatNumber(60/speed, 1, 1)}s → 1m (${speed}x)`;
  } else if (marketMinPerSec < 60) {
    return `1s → ${formatNumber(marketMinPerSec, 1, 1)}m (${speed}x)`;
  } else {
    return `1s → ${formatNumber(marketMinPerSec/60, 1, 1)}h (${speed}x)`;
  }
};

interface SimulationControlsProps {
  selectedStartTime: Date | null;
  onStartSimulation: () => void;
  onPauseSimulation: () => void;
  onResumeSimulation: () => void;
  onStopSimulation: () => void;
  onSpeedChange: (speed: number) => void;
  simulationState: 'stopped' | 'playing' | 'paused';
  currentSpeed: number;
  symbol?: string;
  blockType?: 'speed' | 'controls' | 'timeframe';
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
  symbol = 'BTCUSDT',
  blockType
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const canStart = selectedStartTime && simulationState === 'stopped';
  const isPlaying = simulationState === 'playing';
  const isPaused = simulationState === 'paused';

  const handleStart = async () => {
    setIsLoading(true);
    try {
      await onStartSimulation();
    } finally {
      setIsLoading(false);
    }
  };

  const handlePause = async () => {
    setIsLoading(true);
    try {
      await onPauseSimulation();
    } finally {
      setIsLoading(false);
    }
  };

  const handleResume = async () => {
    setIsLoading(true);
    try {
      await onResumeSimulation();
    } finally {
      setIsLoading(false);
    }
  };

  const handleStop = async () => {
    setIsLoading(true);
    try {
      await onStopSimulation();
    } finally {
      setIsLoading(false);
    }
  };

  // Speed Block
  if (blockType === 'speed') {
    return (
      <div style={{ width: '100%' }}>
        <label style={{ fontSize: '12px', color: '#555', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
          Speed:
        </label>
        
        {/* Speed Slider */}
        <input
          type="range"
          min={1}
          max={3600}
          step={30}
          value={currentSpeed}
          onChange={(e) => onSpeedChange(Number(e.target.value))}
          disabled={isLoading}
          style={{
            width: '100%',
            height: '4px',
            borderRadius: '2px',
            background: '#ddd',
            outline: 'none',
            cursor: isLoading ? 'not-allowed' : 'pointer',
            marginBottom: '6px'
          }}
        />
        
        {/* Speed Preset Buttons */}
        <div style={{ 
          display: 'flex', 
          gap: '3px',
          marginBottom: '6px',
          flexWrap: 'wrap'
        }}>
          {SPEED_PRESETS.map(preset => (
            <button
              key={preset.value}
              onClick={() => onSpeedChange(preset.value)}
              disabled={isLoading}
              style={{
                background: currentSpeed === preset.value ? '#007bff' : '#f8f9fa',
                color: currentSpeed === preset.value ? 'white' : '#666',
                border: '1px solid #dee2e6',
                borderColor: currentSpeed === preset.value ? '#007bff' : '#dee2e6',
                borderRadius: '3px',
                padding: '2px 6px',
                fontSize: '10px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s',
                flex: 1,
                minWidth: '35px'
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        
        {/* Speed Display */}
        <div style={{ 
          textAlign: 'center', 
          fontSize: '10px', 
          fontWeight: 'bold',
          color: '#333',
          backgroundColor: '#e9ecef',
          borderRadius: '3px',
          padding: '2px 4px'
        }}>
          {getSpeedDescription(currentSpeed)}
        </div>
      </div>
    );
  }

  // Controls Block  
  if (blockType === 'controls') {
    return (
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '8px', height: '100%', justifyContent: 'center' }}>
        {/* Main Control Button */}
        <button
          onClick={isPlaying ? handlePause : isPaused ? handleResume : handleStart}
          disabled={(!canStart && simulationState === 'stopped') || isLoading}
          style={{
            padding: '12px 16px',
            fontSize: '14px',
            border: 'none',
            borderRadius: '5px',
            cursor: (!canStart && simulationState === 'stopped') || isLoading ? 'not-allowed' : 'pointer',
            backgroundColor: isPlaying 
              ? '#ffc107' 
              : isPaused 
                ? '#28a745' 
                : canStart 
                  ? '#007bff' 
                  : '#ccc',
            color: 'white',
            fontWeight: '600',
            width: '100%',
            transition: 'all 0.2s',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            flex: 1
          }}
        >
          {isLoading ? 'Loading...' : 
           isPlaying ? '⏸️ Pause' : 
           isPaused ? '▶️ Resume' : 
           '▶️ Start'}
        </button>

        {/* Stop Button */}
        <button
          onClick={handleStop}
          disabled={simulationState === 'stopped' || isLoading}
          style={{
            padding: '12px 16px',
            fontSize: '14px',
            border: 'none',
            borderRadius: '5px',
            cursor: simulationState === 'stopped' || isLoading ? 'not-allowed' : 'pointer',
            backgroundColor: simulationState === 'stopped' ? '#ccc' : '#dc3545',
            color: 'white',
            fontWeight: '600',
            width: '100%',
            transition: 'all 0.2s',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
            flex: 1
          }}
        >
          ⏹️ Stop
        </button>
      </div>
    );
  }

  // Default/Legacy layout (shouldn't be used with new design)
  return null;
};

export default SimulationControls;