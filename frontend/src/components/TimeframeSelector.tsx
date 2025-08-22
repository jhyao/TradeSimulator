import React from 'react';

interface TimeframeSelectorProps {
  timeframe: string;
  onTimeframeChange: (timeframe: string) => void;
  disabled?: boolean;
  compact?: boolean;
}

const TimeframeSelector: React.FC<TimeframeSelectorProps> = ({
  timeframe,
  onTimeframeChange,
  disabled = false,
  compact = false
}) => {
  const timeframes = [
    { value: '1m', label: '1m' },
    { value: '5m', label: '5m' },
    { value: '15m', label: '15m' },
    { value: '1h', label: '1h' },
    { value: '4h', label: '4h' },
    { value: '1d', label: '1d' },
    { value: '1w', label: '1w' },
    { value: '1M', label: '1M' },
  ];

  if (compact) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '13px', color: '#555', fontWeight: 'bold' }}>
          Timeframe:
        </span>
        <div style={{ display: 'flex', gap: '2px' }}>
          {timeframes.map(tf => (
            <button
              key={tf.value}
              onClick={() => onTimeframeChange(tf.value)}
              disabled={disabled}
              style={{
                padding: '4px 8px',
                fontSize: '12px',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                backgroundColor: timeframe === tf.value ? '#007bff' : '#f8f9fa',
                color: timeframe === tf.value ? 'white' : '#333',
                cursor: disabled ? 'not-allowed' : 'pointer',
                fontWeight: timeframe === tf.value ? '600' : '400',
                transition: 'all 0.2s',
                minWidth: '32px'
              }}
            >
              {tf.label}
            </button>
          ))}
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
          border: '1px solid #ddd',
          borderRadius: '4px',
          backgroundColor: disabled ? '#f5f5f5' : 'white',
          cursor: disabled ? 'not-allowed' : 'pointer',
          color: disabled ? '#999' : '#333'
        }}
      >
        {timeframes.map(tf => (
          <option key={tf.value} value={tf.value}>
            {tf.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default TimeframeSelector;