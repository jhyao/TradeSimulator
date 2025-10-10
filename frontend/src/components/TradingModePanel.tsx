import React, { useCallback } from 'react';

interface TradingModePanelProps {
  tradingMode: 'spot' | 'future';
  leverage: number;
  onTradingModeChange: (mode: 'spot' | 'future') => void;
  onLeverageChange: (leverage: number) => void;
  disabled: boolean; // Trading mode locked during simulation, leverage always enabled
}

const TradingModePanel: React.FC<TradingModePanelProps> = ({
  tradingMode,
  leverage,
  onTradingModeChange,
  onLeverageChange,
  disabled
}) => {

  const handleTradingModeChange = useCallback((mode: 'spot' | 'future') => {
    if (!disabled) {
      onTradingModeChange(mode);
    }
  }, [disabled, onTradingModeChange]);

  const handleLeverageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value >= 1 && value <= 50) {
      onLeverageChange(value);
    }
  }, [onLeverageChange]);


  const getLeverageDisplayValue = useCallback((leverageValue: number): string => {
    if (leverageValue === Math.floor(leverageValue)) {
      return `${leverageValue}x`;
    }
    return `${leverageValue.toFixed(1)}x`;
  }, []);

  return (
    <div>
      <label style={{
        fontSize: '12px',
        color: '#666',
        display: 'block',
        marginBottom: '4px'
      }}>
        Trading Mode
      </label>

      {/* Trading Mode Toggle */}
      <div style={{
        display: 'flex',
        marginBottom: tradingMode === 'future' ? '8px' : '0',
        border: '1px solid #ccc',
        borderRadius: '4px',
        overflow: 'hidden'
      }}>
        <button
          onClick={() => handleTradingModeChange('spot')}
          disabled={disabled}
          style={{
            flex: 1,
            padding: '6px 8px',
            border: 'none',
            backgroundColor: tradingMode === 'spot' ? '#007bff' : 'white',
            color: tradingMode === 'spot' ? 'white' : '#666',
            fontWeight: tradingMode === 'spot' ? 'bold' : 'normal',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            transition: 'all 0.2s',
            opacity: disabled ? 0.6 : 1
          }}
        >
          Spot
        </button>
        <button
          onClick={() => handleTradingModeChange('future')}
          disabled={disabled}
          style={{
            flex: 1,
            padding: '6px 8px',
            border: 'none',
            backgroundColor: tradingMode === 'future' ? '#007bff' : 'white',
            color: tradingMode === 'future' ? 'white' : '#666',
            fontWeight: tradingMode === 'future' ? 'bold' : 'normal',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            transition: 'all 0.2s',
            opacity: disabled ? 0.6 : 1
          }}
        >
          Futures
        </button>
      </div>

      {/* Compact Leverage Controls - Only show for futures mode */}
      {tradingMode === 'future' && (
        <div style={{ marginTop: '6px' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            marginBottom: '4px'
          }}>
            <label style={{
              fontSize: '11px',
              color: '#666',
              whiteSpace: 'nowrap'
            }}>
              Leverage:
            </label>
            <input
              type="range"
              min="1"
              max="50"
              step="0.1"
              value={leverage}
              onChange={handleLeverageChange}
              style={{
                flex: 1,
                height: '4px',
                borderRadius: '2px',
                background: `linear-gradient(to right, #007bff 0%, #007bff ${((leverage - 1) / 49) * 100}%, #ccc ${((leverage - 1) / 49) * 100}%, #ccc 100%)`,
                outline: 'none',
                cursor: 'pointer'
              }}
            />
            <span style={{
              fontSize: '11px',
              color: '#333',
              fontWeight: 'bold',
              minWidth: '28px',
              textAlign: 'right'
            }}>
              {getLeverageDisplayValue(leverage)}
            </span>
          </div>

          {/* Quick Leverage Preset Buttons */}
          <div style={{
            display: 'flex',
            gap: '2px',
            marginTop: '2px'
          }}>
            {[3, 5, 10, 20, 50].map(preset => (
              <button
                key={preset}
                onClick={() => onLeverageChange(preset)}
                style={{
                  flex: 1,
                  padding: '2px 4px',
                  border: '1px solid #ccc',
                  borderRadius: '2px',
                  backgroundColor: Math.abs(leverage - preset) < 0.1 ? '#007bff' : 'white',
                  color: Math.abs(leverage - preset) < 0.1 ? 'white' : '#666',
                  fontSize: '9px',
                  fontWeight: Math.abs(leverage - preset) < 0.1 ? 'bold' : 'normal',
                  cursor: 'pointer',
                  transition: 'all 0.2s',
                  lineHeight: '1'
                }}
              >
                {preset}x
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TradingModePanel;