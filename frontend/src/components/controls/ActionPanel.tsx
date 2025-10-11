import React, { useState } from 'react';

interface ControlsPanelProps {
  selectedStartTime: Date | null;
  onStartSimulation: () => void;
  onPauseSimulation: () => void;
  onResumeSimulation: () => void;
  onStopSimulation: () => void;
  simulationState: 'stopped' | 'playing' | 'paused';
  canResume?: boolean;
}

const ActionPanel: React.FC<ControlsPanelProps> = ({
  selectedStartTime,
  onStartSimulation,
  onPauseSimulation,
  onResumeSimulation,
  onStopSimulation,
  simulationState,
  canResume = false
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const canStart = selectedStartTime && simulationState === 'stopped';
  const isPlaying = simulationState === 'playing';

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Title */}
      {/* <div style={{
        fontSize: '12px',
        color: '#333',
        fontWeight: 'bold',
        marginBottom: '8px',
        height: '16px',
        display: 'flex',
        alignItems: 'center'
      }}>
        Controls
      </div> */}

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {/* When stopped, show "Start New" + "Resume" buttons */}
        {simulationState === 'stopped' ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%', justifyContent: 'center' }}>
            {/* Start New Button */}
            <button
              onClick={handleStart}
              disabled={!canStart || isLoading}
              style={{
                padding: '12px 16px',
                fontSize: '14px',
                border: 'none',
                borderRadius: '5px',
                cursor: !canStart || isLoading ? 'not-allowed' : 'pointer',
                backgroundColor: canStart ? '#007bff' : '#ccc',
                color: 'white',
                fontWeight: '600',
                width: '100%',
                transition: 'all 0.2s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                flex: 1
              }}
            >
              {isLoading ? 'Loading...' : '🆕 Start New'}
            </button>

            {/* Resume Button */}
            <button
              onClick={handleResume}
              disabled={!canResume || isLoading}
              style={{
                padding: '12px 16px',
                fontSize: '14px',
                border: 'none',
                borderRadius: '5px',
                cursor: !canResume || isLoading ? 'not-allowed' : 'pointer',
                backgroundColor: canResume ? '#28a745' : '#ccc',
                color: 'white',
                fontWeight: '600',
                width: '100%',
                transition: 'all 0.2s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                flex: 1
              }}
            >
              {isLoading ? 'Loading...' : '▶️ Resume'}
            </button>
          </div>
        ) : (
          /* When playing or paused, show normal controls */
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%', justifyContent: 'center' }}>
            {/* Main Control Button */}
            <button
              onClick={isPlaying ? handlePause : handleResume}
              disabled={isLoading}
              style={{
                padding: '12px 16px',
                fontSize: '14px',
                border: 'none',
                borderRadius: '5px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                backgroundColor: isPlaying ? '#ffc107' : '#28a745',
                color: 'white',
                fontWeight: '600',
                width: '100%',
                transition: 'all 0.2s',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                flex: 1
              }}
            >
              {isLoading ? 'Loading...' :
               isPlaying ? '⏸️ Pause' : '▶️ Resume'}
            </button>

            {/* Stop Button */}
            <button
              onClick={handleStop}
              disabled={isLoading}
              style={{
                padding: '12px 16px',
                fontSize: '14px',
                border: 'none',
                borderRadius: '5px',
                cursor: isLoading ? 'not-allowed' : 'pointer',
                backgroundColor: '#dc3545',
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
        )}
      </div>
    </div>
  );
};

export default ActionPanel;