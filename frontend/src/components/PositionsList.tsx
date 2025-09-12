import React, { useEffect, useState } from 'react';
import { usePositions } from '../contexts/PositionsContext';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { formatCurrency, formatPercentage, formatQuantity } from '../utils/numberFormat';

interface PositionsListProps {
  onRefreshReady?: (refreshFn: () => void) => void;
}

const PositionsList: React.FC<PositionsListProps> = ({ onRefreshReady }) => {
  const { calculatedPositions, loading, error, lastRefresh, fetchPositions } = usePositions();
  const { placeOrder } = useWebSocketContext();
  const [closingPositions, setClosingPositions] = useState<Set<string>>(new Set());

  // Expose refresh function to parent
  useEffect(() => {
    if (onRefreshReady) {
      onRefreshReady(fetchPositions);
    }
  }, [onRefreshReady, fetchPositions]);



  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${formatPercentage(value).replace('%', '')}%`;
  };

  const handleClosePosition = async (symbol: string, quantity: number) => {
    try {
      setClosingPositions(prev => new Set(prev).add(symbol));
      
      // Place a sell order for the full quantity to close the position
      await placeOrder(symbol, 'sell', Math.abs(quantity));
      
      // Refresh positions after a short delay to show updated positions
      setTimeout(() => {
        fetchPositions();
        setClosingPositions(prev => {
          const newSet = new Set(prev);
          newSet.delete(symbol);
          return newSet;
        });
      }, 1000);
      
    } catch (error) {
      console.error('Failed to close position:', error);
      setClosingPositions(prev => {
        const newSet = new Set(prev);
        newSet.delete(symbol);
        return newSet;
      });
    }
  };

  if (loading && !calculatedPositions.length) {
    return (
      <div style={{
        backgroundColor: 'white',
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <div>Loading positions...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: '20px' }}>
        <div style={{ 
          color: '#dc3545', 
          backgroundColor: '#f8d7da', 
          border: '1px solid #f5c6cb',
          padding: '12px',
          borderRadius: '4px'
        }}>
          {error}
        </div>
        <button
          onClick={fetchPositions}
          style={{
            marginTop: '10px',
            padding: '8px 16px',
            backgroundColor: '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Retry
        </button>
      </div>
    );
  }

  // Filter out USDT positions since they're shown as cash balance in portfolio summary
  const tradingPositions = calculatedPositions?.filter(pos => pos.position.symbol !== 'USDT') || [];
  
  if (tradingPositions.length === 0) {
    return (
      <div style={{ 
        padding: '40px', 
        textAlign: 'center',
        color: '#6c757d'
      }}>
        <div style={{ fontSize: '16px', marginBottom: '10px' }}>No positions</div>
        <div style={{ fontSize: '14px' }}>Open a position to see your holdings here</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0' }}>
      <div style={{ 
        overflowX: 'auto',
        maxHeight: '400px',
        overflowY: 'auto'
      }}>
        <table style={{ 
          width: '100%', 
          borderCollapse: 'collapse',
          fontSize: '13px'
        }}>
          <thead>
            <tr style={{ 
              backgroundColor: '#f8f9fa',
              borderBottom: '2px solid #dee2e6'
            }}>
              <th style={{ 
                padding: '10px 8px', 
                textAlign: 'left', 
                fontWeight: 'bold',
                position: 'sticky',
                top: 0,
                backgroundColor: '#f8f9fa',
                zIndex: 1
              }}>Symbol</th>
              <th style={{ 
                padding: '10px 8px', 
                textAlign: 'right', 
                fontWeight: 'bold',
                position: 'sticky',
                top: 0,
                backgroundColor: '#f8f9fa',
                zIndex: 1
              }}>Quantity</th>
              <th style={{ 
                padding: '10px 8px', 
                textAlign: 'right', 
                fontWeight: 'bold',
                position: 'sticky',
                top: 0,
                backgroundColor: '#f8f9fa',
                zIndex: 1
              }}>Entry Price</th>
              <th style={{ 
                padding: '10px 8px', 
                textAlign: 'right', 
                fontWeight: 'bold',
                position: 'sticky',
                top: 0,
                backgroundColor: '#f8f9fa',
                zIndex: 1
              }}>Market Value</th>
              <th style={{ 
                padding: '10px 8px', 
                textAlign: 'right', 
                fontWeight: 'bold',
                position: 'sticky',
                top: 0,
                backgroundColor: '#f8f9fa',
                zIndex: 1
              }}>P&L</th>
              <th style={{ 
                padding: '10px 8px', 
                textAlign: 'right', 
                fontWeight: 'bold',
                position: 'sticky',
                top: 0,
                backgroundColor: '#f8f9fa',
                zIndex: 1
              }}>Return</th>
              <th style={{ 
                padding: '10px 8px', 
                textAlign: 'center', 
                fontWeight: 'bold',
                position: 'sticky',
                top: 0,
                backgroundColor: '#f8f9fa',
                zIndex: 1
              }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {tradingPositions.map((pos, index) => (
              <tr 
                key={index}
                style={{ 
                  borderBottom: '1px solid #dee2e6',
                  backgroundColor: index % 2 === 0 ? '#ffffff' : '#f8f9fa'
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = '#e3f2fd';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = index % 2 === 0 ? '#ffffff' : '#f8f9fa';
                }}
              >
                <td style={{ padding: '10px 8px' }}>
                  <div style={{ fontWeight: 'bold', color: '#333' }}>{pos.position.symbol}</div>
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                  <div style={{ color: '#333' }}>
                    {formatQuantity(pos.position.quantity)}
                  </div>
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                  <div style={{ color: '#333' }}>
                    {formatCurrency(pos.position.average_price)}
                  </div>
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                  <div style={{ color: '#333' }}>
                    {formatCurrency(pos.marketValue)}
                  </div>
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                  <div style={{ 
                    color: pos.unrealizedPnL >= 0 ? '#28a745' : '#dc3545',
                    fontWeight: 'bold'
                  }}>
                    {pos.unrealizedPnL >= 0 ? '+' : ''}{formatCurrency(pos.unrealizedPnL)}
                  </div>
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                  <div style={{ 
                    color: pos.totalReturn >= 0 ? '#28a745' : '#dc3545',
                    fontWeight: 'bold'
                  }}>
                    {formatPercent(pos.totalReturn)}
                  </div>
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                  <button
                    onClick={() => handleClosePosition(pos.position.symbol, pos.position.quantity)}
                    disabled={closingPositions.has(pos.position.symbol)}
                    style={{
                      padding: '4px 8px',
                      fontSize: '11px',
                      backgroundColor: closingPositions.has(pos.position.symbol) ? '#6c757d' : '#dc3545',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: closingPositions.has(pos.position.symbol) ? 'not-allowed' : 'pointer',
                      fontWeight: '500'
                    }}
                    onMouseEnter={(e) => {
                      if (!closingPositions.has(pos.position.symbol)) {
                        e.currentTarget.style.backgroundColor = '#c82333';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!closingPositions.has(pos.position.symbol)) {
                        e.currentTarget.style.backgroundColor = '#dc3545';
                      }
                    }}
                  >
                    {closingPositions.has(pos.position.symbol) ? 'Closing...' : 'Close'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* Summary footer */}
      <div style={{
        padding: '12px 16px',
        backgroundColor: '#f8f9fa',
        borderTop: '1px solid #dee2e6',
        fontSize: '12px',
        color: '#6c757d',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <span>Total positions: {tradingPositions.length}</span>
        <button
          onClick={fetchPositions}
          disabled={loading}
          style={{
            padding: '4px 8px',
            fontSize: '11px',
            backgroundColor: 'transparent',
            color: loading ? '#999' : '#6c757d',
            border: '1px solid #dee2e6',
            borderRadius: '3px',
            cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          {loading ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </div>
  );
};

export default PositionsList;