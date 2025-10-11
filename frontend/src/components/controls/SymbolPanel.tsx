import React from 'react';

interface SymbolPanelProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  initialFunding: number;
  onInitialFundingChange: (funding: number) => void;
  disabled?: boolean;
}

const SymbolPanel: React.FC<SymbolPanelProps> = ({
  symbol,
  onSymbolChange,
  initialFunding,
  onInitialFundingChange,
  disabled = false
}) => {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'DOTUSDT', 'LINKUSDT'];

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
        Symbol
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {/* Symbol Selector */}
        <select
          value={symbol}
          onChange={(e) => onSymbolChange(e.target.value)}
          disabled={disabled}
          style={{
            padding: '6px 8px',
            fontSize: '14px',
            border: '1px solid #ccc',
            borderRadius: '4px',
            backgroundColor: disabled ? '#f5f5f5' : 'white',
            cursor: disabled ? 'not-allowed' : 'pointer',
            color: disabled ? '#999' : '#333',
            fontWeight: '500'
          }}
        >
          {symbols.map(sym => (
            <option key={sym} value={sym}>
              {sym}
            </option>
          ))}
        </select>

        {/* Initial Funding */}
        <div>
          <label style={{
            fontSize: '11px',
            color: '#666',
            display: 'block',
            marginBottom: '4px'
          }}>
            Initial Funding ($)
          </label>
          <input
            type="number"
            min="1000"
            max="1000000"
            step="1000"
            value={initialFunding}
            onChange={(e) => onInitialFundingChange(Math.max(1000, parseInt(e.target.value) || 1000))}
            disabled={disabled}
            style={{
              width: '100%',
              padding: '6px 8px',
              fontSize: '12px',
              border: '1px solid #ccc',
              borderRadius: '4px',
              backgroundColor: disabled ? '#f5f5f5' : 'white'
            }}
            placeholder="10000"
          />
        </div>
      </div>
    </div>
  );
};

export default SymbolPanel;