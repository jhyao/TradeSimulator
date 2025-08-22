import React from 'react';

interface SymbolSelectorProps {
  symbol: string;
  onSymbolChange: (symbol: string) => void;
  disabled?: boolean;
}

const SymbolSelector: React.FC<SymbolSelectorProps> = ({
  symbol,
  onSymbolChange,
  disabled = false
}) => {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'ADAUSDT', 'DOTUSDT', 'LINKUSDT'];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
      <label style={{ fontSize: '12px', color: '#555', fontWeight: 'bold', margin: 0 }}>
        Symbol:
      </label>
      <select
        value={symbol}
        onChange={(e) => onSymbolChange(e.target.value)}
        disabled={disabled}
        style={{
          padding: '8px 12px',
          fontSize: '14px',
          border: '1px solid #ddd',
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
    </div>
  );
};

export default SymbolSelector;