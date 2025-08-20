import React from 'react';

interface ChartControlsProps {
  symbol: string;
  timeframe: string;
  onSymbolChange: (symbol: string) => void;
  onTimeframeChange: (timeframe: string) => void;
}

const symbols = [
  { value: 'BTCUSDT', label: 'BTC/USDT' },
  { value: 'ETHUSDT', label: 'ETH/USDT' }
];

const timeframes = [
  { value: '1m', label: '1m' },
  { value: '5m', label: '5m' },
  { value: '15m', label: '15m' },
  { value: '1h', label: '1h' },
  { value: '4h', label: '4h' },
  { value: '1d', label: '1d' }
];

const ChartControls: React.FC<ChartControlsProps> = ({
  symbol,
  timeframe,
  onSymbolChange,
  onTimeframeChange
}) => {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      padding: '12px 16px',
      backgroundColor: '#f8f9fa',
      borderBottom: '1px solid #e9ecef',
      borderRadius: '4px 4px 0 0',
      flexWrap: 'wrap'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ fontSize: '14px', fontWeight: '500', color: '#495057' }}>
          Symbol:
        </label>
        <select
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value)}
          style={{
            padding: '6px 12px',
            fontSize: '14px',
            border: '1px solid #ced4da',
            borderRadius: '4px',
            backgroundColor: 'white',
            cursor: 'pointer'
          }}
        >
          {symbols.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <label style={{ fontSize: '14px', fontWeight: '500', color: '#495057' }}>
          Timeframe:
        </label>
        <div style={{ display: 'flex', gap: '2px' }}>
          {timeframes.map((tf) => (
            <button
              key={tf.value}
              onClick={() => onTimeframeChange(tf.value)}
              style={{
                padding: '6px 12px',
                fontSize: '14px',
                border: '1px solid #ced4da',
                backgroundColor: timeframe === tf.value ? '#007bff' : 'white',
                color: timeframe === tf.value ? 'white' : '#495057',
                cursor: 'pointer',
                borderRadius: '4px',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => {
                if (timeframe !== tf.value) {
                  e.currentTarget.style.backgroundColor = '#e9ecef';
                }
              }}
              onMouseLeave={(e) => {
                if (timeframe !== tf.value) {
                  e.currentTarget.style.backgroundColor = 'white';
                }
              }}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default ChartControls;