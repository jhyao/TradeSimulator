import React, { useState } from 'react';
import { ConnectionState } from '../hooks/useWebSocket';
import PositionsList from './PositionsList';
import OrderHistory from './OrderHistory';
import TradeHistory from './TradeHistory';
import SimulationHistory from './SimulationHistory';

interface TradingTabsProps {
  connectionState: ConnectionState;
  currentPrice: number;
  symbol: string;
  simulationState: 'stopped' | 'playing' | 'paused';
  onLoadFromHistory?: (simulation: any) => void;
}

type TabType = 'positions' | 'orders' | 'trades' | 'history';

const TradingTabs: React.FC<TradingTabsProps> = ({ 
  connectionState, 
  currentPrice, 
  symbol,
  simulationState,
  onLoadFromHistory 
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('positions');
  
  // Refs to store refresh functions from child components
  const positionsRefreshRef = React.useRef<(() => void) | null>(null);
  const ordersRefreshRef = React.useRef<(() => void) | null>(null);
  const tradesRefreshRef = React.useRef<(() => void) | null>(null);
  const historyRefreshRef = React.useRef<(() => void) | null>(null);

  // Handle tab change and trigger refresh
  const handleTabChange = (tabId: TabType) => {
    setActiveTab(tabId);
    
    // Trigger refresh for the newly opened tab after a short delay
    // Skip history tab as it already fetches data on mount
    setTimeout(() => {
      switch (tabId) {
        case 'positions':
          if (positionsRefreshRef.current) {
            positionsRefreshRef.current();
          }
          break;
        case 'orders':
          if (ordersRefreshRef.current) {
            ordersRefreshRef.current();
          }
          break;
        case 'trades':
          if (tradesRefreshRef.current) {
            tradesRefreshRef.current();
          }
          break;
        // Remove automatic refresh for history tab to prevent duplicate requests
        // case 'history': SimulationHistory already fetches on mount
      }
    }, 100); // Small delay to ensure component is rendered
  };

  const tabs: { id: TabType; label: string }[] = [
    { id: 'positions', label: 'Positions' },
    { id: 'orders', label: 'Order History' },
    { id: 'trades', label: 'Trade History' },
    { id: 'history', label: 'Simulation History' }
  ];

  const renderTabContent = () => {
    return (
      <>
        <div style={{ display: activeTab === 'positions' ? 'block' : 'none' }}>
          <PositionsList 
            onRefreshReady={(refreshFn) => positionsRefreshRef.current = refreshFn}
          />
        </div>
        <div style={{ display: activeTab === 'orders' ? 'block' : 'none' }}>
          <OrderHistory
            connectionState={connectionState}
            simulationState={simulationState}
            onRefreshReady={(refreshFn) => ordersRefreshRef.current = refreshFn}
          />
        </div>
        <div style={{ display: activeTab === 'trades' ? 'block' : 'none' }}>
          <TradeHistory
            connectionState={connectionState}
            simulationState={simulationState}
            onRefreshReady={(refreshFn) => tradesRefreshRef.current = refreshFn}
          />
        </div>
        <div style={{ display: activeTab === 'history' ? 'block' : 'none' }}>
          <SimulationHistory 
            onLoadSimulation={onLoadFromHistory}
            onRefreshReady={(refreshFn) => historyRefreshRef.current = refreshFn}
          />
        </div>
      </>
    );
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
            onClick={() => handleTabChange(tab.id)}
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