import React from 'react';

interface TimeframeSelectorProps {
  timeframe: string;
  onTimeframeChange: (timeframe: string) => void;
  disabled?: boolean;
  compact?: boolean;
  currentSpeed?: number; // For speed-based validation
}

// Available timeframes with their duration in minutes
const TIMEFRAMES = [
  { value: "1m", label: "1m", minutes: 1 },
  { value: "5m", label: "5m", minutes: 5 },
  { value: "15m", label: "15m", minutes: 15 },
  { value: "1h", label: "1h", minutes: 60 },
  { value: "4h", label: "4h", minutes: 240 },
  { value: "1d", label: "1d", minutes: 1440 },
];

// Calculate minimum allowed timeframe based on speed
const getMinAllowedTimeframe = (speed: number): string => {
  // Y = speed / 60 minutes (how many market minutes per real second)
  const marketMinutesPerSecond = speed / 60;
  
  // Find the largest timeframe that's <= marketMinutesPerSecond
  // This matches the original requirement specification
  let minTimeframe = "1m"; // default to smallest if no match
  for (const tf of TIMEFRAMES) {
    if (tf.minutes <= marketMinutesPerSecond) {
      minTimeframe = tf.value;
    }
  }
  
  return minTimeframe;
};

// Check if timeframe is allowed for given speed
export const isTimeframeAllowed = (timeframe: string, speed: number): boolean => {
  const minAllowed = getMinAllowedTimeframe(speed);
  
  const timeframeMinutes = TIMEFRAMES.find(tf => tf.value === timeframe)?.minutes || 1;
  const minAllowedMinutes = TIMEFRAMES.find(tf => tf.value === minAllowed)?.minutes || 1440;
  
  return timeframeMinutes >= minAllowedMinutes;
};

// Export the min allowed timeframe function for use in App.tsx
export { getMinAllowedTimeframe };

const TimeframeSelector: React.FC<TimeframeSelectorProps> = ({
  timeframe,
  onTimeframeChange,
  disabled = false,
  compact = false,
  currentSpeed = 60 // Default speed
}) => {
  // Filter timeframes based on speed if speed is provided
  const availableTimeframes = currentSpeed ? TIMEFRAMES.filter(tf => isTimeframeAllowed(tf.value, currentSpeed)) : TIMEFRAMES;
  const isCurrentTimeframeValid = currentSpeed ? isTimeframeAllowed(timeframe, currentSpeed) : true;

  // compact mode: dropdown; else buttons
  if (!compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '13px', color: '#555', fontWeight: 'bold' }}>
          Timeframe:
        </span>
        <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
          {TIMEFRAMES.map(tf => {
            const isAvailable = availableTimeframes.some(avail => avail.value === tf.value);
            const isSelected = timeframe === tf.value;
            return (
              <button
                key={tf.value}
                onClick={() => onTimeframeChange(tf.value)}
                disabled={disabled || !isAvailable}
                style={{
                  padding: '4px 8px',
                  fontSize: '12px',
                  border: '1px solid #dee2e6',
                  borderColor: !isCurrentTimeframeValid && isSelected ? '#dc3545' : '#dee2e6',
                  borderRadius: '4px',
                  backgroundColor: isSelected ? '#007bff' : isAvailable ? '#f8f9fa' : '#e9ecef',
                  color: isSelected ? 'white' : isAvailable ? '#333' : '#6c757d',
                  cursor: disabled || !isAvailable ? 'not-allowed' : 'pointer',
                  fontWeight: isSelected ? '600' : '400',
                  transition: 'all 0.2s',
                  minWidth: '32px',
                  opacity: isAvailable ? 1 : 0.5
                }}
                title={!isAvailable ? `Not available at ${currentSpeed}x speed` : undefined}
              >
                {tf.label}
              </button>
            );
          })}
          {/* Validation indicator */}
          {!isCurrentTimeframeValid && (
            <span style={{
              fontSize: '10px',
              color: '#dc3545',
              backgroundColor: '#f8d7da',
              padding: '2px 6px',
              borderRadius: '3px',
              marginLeft: '8px',
              whiteSpace: 'nowrap'
            }}>
              Min: {getMinAllowedTimeframe(currentSpeed)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: '120px' }}>
      <label style={{ fontSize: '14px', color: '#555', fontWeight: 'bold' }}>
        Timeframe:
      </label>
      <select
        value={timeframe}
        onChange={(e) => onTimeframeChange(e.target.value)}
        disabled={disabled}
        style={{
          padding: '8px 12px',
          fontSize: '14px',
          border: '1px solid',
          borderColor: !isCurrentTimeframeValid ? '#dc3545' : '#ddd',
          borderRadius: '4px',
          backgroundColor: disabled ? '#f5f5f5' : !isCurrentTimeframeValid ? '#fff5f5' : 'white',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: disabled ? '#999' : '#333'
        }}
      >
        {TIMEFRAMES.map(tf => {
          const isAvailable = availableTimeframes.some(avail => avail.value === tf.value);
          return (
            <option 
              key={tf.value} 
              value={tf.value}
              disabled={!isAvailable}
            >
              {tf.label} {!isAvailable ? ' (restricted)' : ''}
            </option>
          );
        })}
      </select>
      {/* Validation message */}
      {!isCurrentTimeframeValid && (
        <div style={{
          fontSize: '12px',
          color: '#dc3545',
          backgroundColor: '#f8d7da',
          border: '1px solid #f5c6cb',
          borderRadius: '3px',
          padding: '4px 8px'
        }}>
          Min timeframe for {currentSpeed}x speed: {getMinAllowedTimeframe(currentSpeed)}
        </div>
      )}
    </div>
  );
};

export default TimeframeSelector;