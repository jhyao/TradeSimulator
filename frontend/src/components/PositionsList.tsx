import React, { useState, useEffect, useCallback } from 'react';
import { ConnectionState } from '../hooks/useWebSocket';
import { formatCurrency, formatPercentage, formatQuantity } from '../utils/numberFormat';

interface PositionsListProps {
  connectionState: ConnectionState;
  currentPrice: number;
  symbol: string;
  simulationState: 'stopped' | 'playing' | 'paused';
}

interface Position {
  id: number;
  user_id: number;
  symbol: string;
  base_currency: string;
  quantity: number;
  average_price: number;
  total_cost: number;
  updated_at: string;
  created_at: string;
}

interface CalculatedPosition {
  position: Position;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  totalReturn: number;
}

const PositionsList: React.FC<PositionsListProps> = ({ 
  connectionState, 
  currentPrice, 
  symbol,
  simulationState 
}) => {
  const [positions, setPositions] = useState<CalculatedPosition[] | null>(null);
  const [rawPositions, setRawPositions] = useState<Position[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const calculatePositions = useCallback((positions: Position[], marketPrice: number, currentSymbol: string): CalculatedPosition[] => {
    const calculatedPositions: CalculatedPosition[] = [];

    positions.forEach(position => {
      let positionPrice: number;
      
      if (position.symbol === 'USDT') {
        positionPrice = 1.0;
      } else if (position.symbol === currentSymbol) {
        positionPrice = marketPrice;
      } else {
        positionPrice = position.average_price;
      }

      const marketValue = position.quantity * positionPrice;
      const unrealizedPnL = marketValue - position.total_cost;
      const totalReturn = position.total_cost !== 0 ? (unrealizedPnL / position.total_cost) * 100 : 0;

      const calculatedPosition: CalculatedPosition = {
        position,
        currentPrice: positionPrice,
        marketValue,
        unrealizedPnL,
        totalReturn
      };

      calculatedPositions.push(calculatedPosition);
    });

    return calculatedPositions;
  }, []);

  const fetchPositions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/positions/', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setRawPositions(data.positions);
      setPositions(calculatePositions(data.positions, currentPrice, symbol));
      setLastRefresh(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load positions: ${errorMessage}`);
      console.error('Error fetching positions:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPrice, symbol, calculatePositions]);

  const handleClosePosition = useCallback(async (position: Position) => {
    if (!window.confirm(`Are you sure you want to close your ${position.symbol} position? This will sell all ${formatQuantity(position.quantity)} at market price.`)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/orders/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          symbol: position.symbol,
          side: 'sell',
          quantity: position.quantity
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.success) {
        // Refresh positions data after successful close
        await fetchPositions();
      } else {
        throw new Error(data.message || 'Failed to close position');
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to close position: ${errorMessage}`);
      console.error('Error closing position:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchPositions]);

  // Auto-refresh positions data
  useEffect(() => {
    if (connectionState === ConnectionState.CONNECTED) {
      fetchPositions();
      
      // Set up auto-refresh every 5 seconds during simulation
      const interval = simulationState === 'playing' 
        ? setInterval(fetchPositions, 5000)
        : null;

      return () => {
        if (interval) clearInterval(interval);
      };
    }
  }, [connectionState, simulationState, fetchPositions]);

  // Recalculate positions when current price changes
  useEffect(() => {
    if (rawPositions && currentPrice > 0) {
      setPositions(calculatePositions(rawPositions, currentPrice, symbol));
    }
  }, [rawPositions, currentPrice, symbol, calculatePositions]);

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${formatPercentage(value).replace('%', '')}%`;
  };

  if (loading && !positions) {
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

      {positions && (
        <>
          <div>
            {(() => {
              // Filter out USDT positions since they're shown as cash balance in portfolio summary
              const tradingPositions = positions?.filter(pos => pos.position.symbol !== 'USDT') || [];
              
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
                      gridTemplateColumns: '1fr auto auto auto auto auto',
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

                    <div style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => handleClosePosition(pos.position)}
                        disabled={loading}
                        style={{
                          padding: '4px 8px',
                          border: '1px solid #dc3545',
                          borderRadius: '4px',
                          backgroundColor: 'white',
                          color: '#dc3545',
                          cursor: loading ? 'not-allowed' : 'pointer',
                          fontSize: '11px',
                          fontWeight: 'bold'
                        }}
                      >
                        Close
                      </button>
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