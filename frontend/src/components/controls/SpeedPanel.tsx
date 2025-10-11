import React, { useState } from 'react';
import { formatNumber } from '../../utils/numberFormat';

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

interface SpeedPanelProps {
  currentSpeed: number;
  onSpeedChange: (speed: number) => void;
}

const SpeedPanel: React.FC<SpeedPanelProps> = ({
  currentSpeed,
  onSpeedChange
}) => {
  const [isLoading] = useState(false);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Title */}
      <div style={{
        fontSize: '12px',
        color: '#333',
        fontWeight: 'bold',
        marginBottom: '8px',
        height: '16px',
        display: 'flex',
        alignItems: 'center'
      }}>
        Speed
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
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
    </div>
  );
};

export default SpeedPanel;