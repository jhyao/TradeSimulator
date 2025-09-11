import React, { useState, useEffect, useCallback } from 'react';
import { ConnectionState } from '../hooks/useWebSocket';
import { formatCurrency, formatQuantity } from '../utils/numberFormat';
import { useWebSocketContext } from '../contexts/WebSocketContext';

interface TradeHistoryProps {
  connectionState: ConnectionState;
  simulationState: 'stopped' | 'playing' | 'paused';
}

interface Trade {
  id: number;
  order_id: number;
  user_id: number;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  created_at: string;
}

const TradeHistory: React.FC<TradeHistoryProps> = ({ 
  connectionState, 
  simulationState 
}) => {
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const { currentSimulationStatus } = useWebSocketContext();

  const fetchTrades = useCallback(async () => {
    // If no simulation status available yet, wait
    if (!currentSimulationStatus) {
      return;
    }
    
    // If simulation is running, use its ID
    let simulationId = currentSimulationStatus.simulationID;
    
    // If no running simulation but we have a simulation ID from history, use it
    if (!currentSimulationStatus.isRunning && !simulationId) {
      setTrades([]);
      setError('No simulation running. Start a simulation to see trades.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/trades?limit=50&simulation_id=${simulationId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setTrades(data.trades || []);
      setLastRefresh(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load trades: ${errorMessage}`);
      console.error('Error fetching trades:', err);
    } finally {
      setLoading(false);
    }
  }, [currentSimulationStatus]);

  // Auto-refresh trades data
  useEffect(() => {
    if (connectionState === ConnectionState.CONNECTED) {
      fetchTrades();
      
      // Set up auto-refresh every 5 seconds during simulation
      const interval = simulationState === 'playing' 
        ? setInterval(fetchTrades, 5000)
        : null;

      return () => {
        if (interval) clearInterval(interval);
      };
    }
  }, [connectionState, simulationState, fetchTrades]);

  const getSideColor = (side: string) => {
    return side.toLowerCase() === 'buy' ? '#28a745' : '#dc3545';
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const calculateValue = (quantity: number, price: number) => {
    return quantity * price;
  };

  if (loading && trades.length === 0) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        color: '#6c757d'
      }}>
        <div>Loading trades...</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px' }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px'
      }}>
        <h3 style={{
          margin: 0,
          fontSize: '18px',
          color: '#333'
        }}>
          Trade History
        </h3>
        <div>
          <button
            onClick={fetchTrades}
            disabled={loading}
            style={{
              padding: '6px 12px',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              backgroundColor: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '12px'
            }}
          >
            {loading ? '⟳' : '↻'} Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: '15px',
          padding: '10px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: '6px',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      {trades.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '40px',
          color: '#6c757d',
          fontSize: '14px',
          fontStyle: 'italic'
        }}>
          No trades found
        </div>
      ) : (
        <div style={{
          overflowX: 'auto'
        }}>
          <table style={{
            width: '100%',
            borderCollapse: 'collapse',
            fontSize: '13px'
          }}>
            <thead>
              <tr style={{
                backgroundColor: '#f8f9fa',
                borderBottom: '1px solid #dee2e6'
              }}>
                <th style={{ padding: '12px 8px', textAlign: 'left', color: '#495057' }}>Time</th>
                <th style={{ padding: '12px 8px', textAlign: 'left', color: '#495057' }}>Symbol</th>
                <th style={{ padding: '12px 8px', textAlign: 'center', color: '#495057' }}>Side</th>
                <th style={{ padding: '12px 8px', textAlign: 'right', color: '#495057' }}>Quantity</th>
                <th style={{ padding: '12px 8px', textAlign: 'right', color: '#495057' }}>Price</th>
                <th style={{ padding: '12px 8px', textAlign: 'right', color: '#495057' }}>Value</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade, index) => (
                <tr
                  key={trade.id}
                  style={{
                    borderBottom: index < trades.length - 1 ? '1px solid #dee2e6' : 'none'
                  }}
                >
                  <td style={{ padding: '10px 8px' }}>
                    {formatDateTime(trade.created_at)}
                  </td>
                  <td style={{ padding: '10px 8px', fontWeight: 'bold' }}>
                    {trade.symbol}
                  </td>
                  <td style={{ 
                    padding: '10px 8px', 
                    textAlign: 'center',
                    color: getSideColor(trade.side),
                    fontWeight: 'bold',
                    textTransform: 'uppercase'
                  }}>
                    {trade.side}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                    {formatQuantity(trade.quantity)}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                    {formatCurrency(trade.price)}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                    {formatCurrency(calculateValue(trade.quantity, trade.price))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {lastRefresh && (
        <div style={{
          marginTop: '15px',
          fontSize: '11px',
          color: '#6c757d',
          textAlign: 'center'
        }}>
          Last updated: {lastRefresh.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default TradeHistory;