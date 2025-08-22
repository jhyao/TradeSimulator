import React, { useState } from 'react';

// Speed presets for the slider
const SPEED_PRESETS = [
  { value: 30, label: "30x", description: "2s → 1m" },
  { value: 60, label: "1m", description: "1s → 1m" },
  { value: 120, label: "2m", description: "1s → 2m" },
  { value: 300, label: "5m", description: "1s → 5m" },
  { value: 600, label: "10m", description: "1s → 10m" },
  { value: 1800, label: "30m", description: "1s → 30m" },
  { value: 3600, label: "1h", description: "1s → 1h" },
];

// Helper function to get speed description
const getSpeedDescription = (speed: number): string => {
  const marketMinPerSec = speed / 60;
  if (marketMinPerSec < 1) {
    return `${(60/speed).toFixed(1)}s → 1m (${speed}x)`;
  } else if (marketMinPerSec < 60) {
    return `1s → ${marketMinPerSec}m (${speed}x)`;
  } else {
    return `1s → ${(marketMinPerSec/60).toFixed(1)}h (${speed}x)`;
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
  currentSimulationTime?: Date | null;
  currentPrice?: number | null;
  progress?: number;
  symbol?: string;
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
  currentSimulationTime,
  currentPrice,
  progress,
  symbol = 'BTCUSDT'
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const canStart = selectedStartTime && simulationState === 'stopped';
  const isPlaying = simulationState === 'playing';
  const isPaused = simulationState === 'paused';
  const isRunning = isPlaying || isPaused;

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

  const getStateColor = () => {
    switch (simulationState) {
      case 'playing': return '#28a745';
      case 'paused': return '#ffc107';
      case 'stopped': return '#6c757d';
      default: return '#6c757d';
    }
  };

  const getStateIcon = () => {
    switch (simulationState) {
      case 'playing': return '▶️';
      case 'paused': return '⏸️';
      case 'stopped': return '⏹️';
      default: return '⏹️';
    }
  };

  const formatPrice = (price: number) => {
    return price.toLocaleString('en-US', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 8
    });
  };

  return (
    <div style={{
      padding: '15px',
      backgroundColor: '#f8f9fa',
      border: '1px solid #dee2e6',
      borderRadius: '8px',
      marginBottom: '20px'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '15px'
      }}>
        <h3 style={{ 
          margin: 0, 
          fontSize: '16px', 
          color: '#333',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}>
          {getStateIcon()} Simulation Controls
        </h3>
        
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '14px',
          color: getStateColor(),
          fontWeight: '500'
        }}>
          Status: {simulationState.toUpperCase()}
          {isRunning && (
            <span style={{ color: '#666' }}>
              @ {currentSpeed}x speed
            </span>
          )}
        </div>
      </div>

      {/* Main Controls */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        marginBottom: '15px',
        flexWrap: 'wrap'
      }}>
        {/* Start/Pause/Resume Button */}
        <button
          onClick={isPlaying ? handlePause : isPaused ? handleResume : handleStart}
          disabled={(!canStart && simulationState === 'stopped') || isLoading}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            border: 'none',
            borderRadius: '4px',
            cursor: (!canStart && simulationState === 'stopped') || isLoading ? 'not-allowed' : 'pointer',
            backgroundColor: isPlaying 
              ? '#ffc107' 
              : isPaused 
                ? '#28a745' 
                : canStart 
                  ? '#007bff' 
                  : '#ccc',
            color: 'white',
            fontWeight: '500',
            minWidth: '120px'
          }}
        >
          {isLoading ? 'Loading...' : 
           isPlaying ? '⏸️ Pause' : 
           isPaused ? '▶️ Resume' : 
           '▶️ Start Simulation'}
        </button>

        {/* Stop Button */}
        <button
          onClick={handleStop}
          disabled={simulationState === 'stopped' || isLoading}
          style={{
            padding: '8px 16px',
            fontSize: '14px',
            border: 'none',
            borderRadius: '4px',
            cursor: simulationState === 'stopped' || isLoading ? 'not-allowed' : 'pointer',
            backgroundColor: simulationState === 'stopped' ? '#ccc' : '#dc3545',
            color: 'white',
            fontWeight: '500'
          }}
        >
          ⏹️ Stop
        </button>

        {/* Enhanced Speed Control */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '250px' }}>
          <label style={{ fontSize: '14px', color: '#555', fontWeight: 'bold' }}>
            Simulation Speed:
          </label>
          
          {/* Speed Slider */}
          <div style={{ position: 'relative' }}>
            <input
              type="range"
              min={30}
              max={3600}
              step={30}
              value={currentSpeed}
              onChange={(e) => onSpeedChange(Number(e.target.value))}
              disabled={simulationState === 'stopped' || isLoading}
              style={{
                width: '100%',
                height: '6px',
                borderRadius: '3px',
                background: '#ddd',
                outline: 'none',
                cursor: simulationState === 'stopped' ? 'not-allowed' : 'pointer'
              }}
            />
          </div>
          
          {/* Preset Markers */}
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginTop: '-5px',
            paddingLeft: '2px',
            paddingRight: '2px'
          }}>
            {SPEED_PRESETS.map(preset => (
              <button
                key={preset.value}
                onClick={() => onSpeedChange(preset.value)}
                disabled={simulationState === 'stopped' || isLoading}
                title={preset.description}
                style={{
                  background: currentSpeed === preset.value ? '#007bff' : '#f0f0f0',
                  color: currentSpeed === preset.value ? 'white' : '#666',
                  border: '1px solid #ccc',
                  borderColor: currentSpeed === preset.value ? '#007bff' : '#ccc',
                  borderRadius: '4px',
                  padding: '2px 6px',
                  fontSize: '11px',
                  cursor: simulationState === 'stopped' ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s',
                  minWidth: '32px'
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
          
          {/* Current Speed Display */}
          <div style={{ 
            textAlign: 'center', 
            fontSize: '13px', 
            fontWeight: 'bold',
            color: '#333',
            padding: '4px',
            backgroundColor: '#e9ecef',
            borderRadius: '4px'
          }}>
            {getSpeedDescription(currentSpeed)}
          </div>
        </div>
      </div>

      {/* Simulation Info */}
      {isRunning && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '15px',
          padding: '12px',
          backgroundColor: 'white',
          borderRadius: '6px',
          border: '1px solid #e9ecef'
        }}>
          {/* Current Price */}
          <div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '2px' }}>
              Current Price ({symbol})
            </div>
            <div style={{ 
              fontSize: '16px', 
              fontWeight: '600', 
              color: '#333',
              fontFamily: 'monospace'
            }}>
              ${currentPrice ? formatPrice(currentPrice) : '---'}
            </div>
          </div>

          {/* Simulation Time */}
          <div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '2px' }}>
              Simulation Time
            </div>
            <div style={{ 
              fontSize: '14px', 
              fontWeight: '500', 
              color: '#333',
              fontFamily: 'monospace'
            }}>
              {currentSimulationTime ? currentSimulationTime.toLocaleString() : '---'}
            </div>
          </div>

          {/* Progress */}
          <div>
            <div style={{ fontSize: '12px', color: '#666', marginBottom: '2px' }}>
              Progress
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{
                flex: 1,
                height: '6px',
                backgroundColor: '#e9ecef',
                borderRadius: '3px',
                overflow: 'hidden'
              }}>
                <div style={{
                  height: '100%',
                  backgroundColor: '#007bff',
                  width: `${progress || 0}%`,
                  transition: 'width 0.3s ease'
                }} />
              </div>
              <span style={{ 
                fontSize: '12px', 
                color: '#666',
                minWidth: '40px',
                fontFamily: 'monospace'
              }}>
                {progress ? `${progress.toFixed(1)}%` : '0%'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Help Text */}
      {!selectedStartTime && (
        <div style={{
          marginTop: '10px',
          padding: '8px 12px',
          backgroundColor: '#d1ecf1',
          borderRadius: '4px',
          fontSize: '14px',
          color: '#0c5460',
          border: '1px solid #bee5eb'
        }}>
          💡 Select a start time above to begin simulation
        </div>
      )}
    </div>
  );
};

export default SimulationControls;