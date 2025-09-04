import React, { useState } from 'react';
import { ConnectionState } from '../hooks/useWebSocket';
import PositionsList from './PositionsList';
import OrderHistory from './OrderHistory';
import TradeHistory from './TradeHistory';

interface TradingTabsProps {
  connectionState: ConnectionState;
  currentPrice: number;
  symbol: string;
  simulationState: 'stopped' | 'playing' | 'paused';
}

type TabType = 'positions' | 'orders' | 'trades';

const TradingTabs: React.FC<TradingTabsProps> = ({ 
  connectionState, 
  currentPrice, 
  symbol,
  simulationState 
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('positions');

  const tabs: { id: TabType; label: string }[] = [
    { id: 'positions', label: 'Positions' },
    { id: 'orders', label: 'Order History' },
    { id: 'trades', label: 'Trade History' }
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'positions':
        return (
          <PositionsList
            connectionState={connectionState}
            currentPrice={currentPrice}
            symbol={symbol}
            simulationState={simulationState}
          />
        );
      case 'orders':
        return (
          <OrderHistory
            connectionState={connectionState}
            simulationState={simulationState}
          />
        );
      case 'trades':
        return (
          <TradeHistory
            connectionState={connectionState}
            simulationState={simulationState}
          />
        );
      default:
        return null;
    }
  };

  return (
    <div style={{
      backgroundColor: 'white',
      border: '1px solid #dee2e6',
      borderRadius: '8px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
      overflow: 'hidden'
    }}>
      {/* Tab Headers */}
      <div style={{
        display: 'flex',
        backgroundColor: '#f8f9fa',
        borderBottom: '1px solid #dee2e6'
      }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              flex: '1',
              padding: '12px 20px',
              border: 'none',
              backgroundColor: activeTab === tab.id ? 'white' : 'transparent',
              color: activeTab === tab.id ? '#333' : '#6c757d',
              fontWeight: activeTab === tab.id ? 'bold' : 'normal',
              cursor: 'pointer',
              borderBottom: activeTab === tab.id ? '2px solid #007bff' : '2px solid transparent',
              fontSize: '14px',
              transition: 'all 0.2s ease'
            }}
            onMouseEnter={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.backgroundColor = '#e9ecef';
              }
            }}
            onMouseLeave={(e) => {
              if (activeTab !== tab.id) {
                e.currentTarget.style.backgroundColor = 'transparent';
              }
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div>
        {renderTabContent()}
      </div>
    </div>
  );
};

export default TradingTabs;