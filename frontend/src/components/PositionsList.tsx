import React from 'react';
import { usePositions } from '../contexts/PositionsContext';
import { formatCurrency, formatPercentage, formatQuantity } from '../utils/numberFormat';

interface PositionsListProps {}


const PositionsList: React.FC<PositionsListProps> = () => {
  const { calculatedPositions, loading, error, lastRefresh, fetchPositions } = usePositions();



  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${formatPercentage(value).replace('%', '')}%`;
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
          Positions
        </h3>
        <div>
          <button
            onClick={fetchPositions}
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

      {calculatedPositions && (
        <>
          <div>
            {(() => {
              // Filter out USDT positions since they're shown as cash balance in portfolio summary
              const tradingPositions = calculatedPositions?.filter(pos => pos.position.symbol !== 'USDT') || [];
              
              return !tradingPositions || tradingPositions.length === 0 ? (
                <div style={{
                  textAlign: 'center',
                  padding: '20px',
                  color: '#6c757d',
                  fontSize: '14px',
                  fontStyle: 'italic'
                }}>
                  No positions
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {tradingPositions.map((pos, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto auto auto',
                      gap: '10px',
                      alignItems: 'center',
                      padding: '10px',
                      border: '1px solid #dee2e6',
                      borderRadius: '6px',
                      fontSize: '13px'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{pos.position.symbol}</div>
                      <div style={{ color: '#6c757d' }}>
                        Qty: {formatQuantity(pos.position.quantity)}
                      </div>
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color: '#6c757d' }}>Entry Price</div>
                      <div>{formatCurrency(pos.position.average_price)}</div>
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color: '#6c757d' }}>Market Value</div>
                      <div>{formatCurrency(pos.marketValue)}</div>
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color: '#6c757d' }}>P&L</div>
                      <div style={{ color: pos.unrealizedPnL >= 0 ? '#28a745' : '#dc3545' }}>
                        {pos.unrealizedPnL >= 0 ? '+' : ''}{formatCurrency(pos.unrealizedPnL)}
                      </div>
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color: '#6c757d' }}>Return</div>
                      <div style={{ 
                        color: pos.totalReturn >= 0 ? '#28a745' : '#dc3545',
                        fontWeight: 'bold'
                      }}>
                        {formatPercent(pos.totalReturn)}
                      </div>
                    </div>

                  </div>
                ))}
              </div>
              );
            })()}
          </div>

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
        </>
      )}
    </div>
  );
};

export default PositionsList;