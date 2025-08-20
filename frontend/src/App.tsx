import React, { useState } from 'react';
import Chart from './components/Chart';
import ChartControls from './components/ChartControls';
import './App.css';

function App() {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('1h');

  return (
    <div className="App">
      <div style={{
        maxWidth: '1200px',
        margin: '20px auto',
        padding: '0 20px'
      }}>
        <h1 style={{
          textAlign: 'center',
          margin: '0 0 20px 0',
          fontSize: '24px',
          color: '#333'
        }}>
          Trade Simulator
        </h1>
        
        <div style={{
          backgroundColor: 'white',
          borderRadius: '8px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          overflow: 'hidden'
        }}>
          <ChartControls
            symbol={symbol}
            timeframe={timeframe}
            onSymbolChange={setSymbol}
            onTimeframeChange={setTimeframe}
          />
          <Chart symbol={symbol} timeframe={timeframe} />
        </div>
      </div>
    </div>
  );
}

export default App;
