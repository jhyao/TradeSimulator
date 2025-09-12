import React, { useEffect, useState, useCallback } from 'react';
import { usePositions } from '../contexts/PositionsContext';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { formatCurrency, formatPercentage, formatQuantity } from '../utils/numberFormat';

interface TradingViewProps {
  onRefreshReady?: (refreshFn: () => void) => void;
  isActive?: boolean;
}

interface PendingOrder {
  id: number;
  user_id: number;
  symbol: string;
  side: string;
  type: string;
  quantity: number;
  status: string;
  placed_at: string;
  created_at: string;
  order_params?: {
    limit_price?: number;
    stop_price?: number;
    stop_limit_price?: number;
    take_profit_price?: number;
    stop_loss_price?: number;
  };
}

const TradingView: React.FC<TradingViewProps> = ({ onRefreshReady, isActive = true }) => {
  const { calculatedPositions, loading: positionsLoading, error: positionsError, fetchPositions } = usePositions();
  const { placeOrder, cancelOrder, currentSimulationStatus, addFloatingMessage, lastOrderNotification } = useWebSocketContext();
  const [closingPositions, setClosingPositions] = useState<Set<string>>(new Set());
  
  // Pending orders state
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [pendingLoading, setPendingLoading] = useState(false);
  const [pendingError, setPendingError] = useState<string | null>(null);
  const [cancellingOrders, setCancellingOrders] = useState<Set<number>>(new Set());

  const fetchPendingOrders = useCallback(async () => {
    if (!currentSimulationStatus) {
      return;
    }
    
    let simulationId = currentSimulationStatus.simulationID;
    
    if (!currentSimulationStatus.isRunning && !simulationId) {
      setPendingOrders([]);
      return;
    }

    setPendingLoading(true);
    setPendingError(null);

    try {
      const url = simulationId 
        ? `/api/v1/orders?simulation_id=${simulationId}&status=pending&limit=100`
        : '/api/v1/orders?status=pending&limit=100';

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch pending orders: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success) {
        setPendingOrders(data.orders || []);
      } else {
        throw new Error(data.error || 'Failed to fetch pending orders');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      setPendingError(errorMsg);
      console.error('Error fetching pending orders:', err);
    } finally {
      setPendingLoading(false);
    }
  }, [currentSimulationStatus]);

  // Combined refresh function
  const refreshAll = useCallback(() => {
    fetchPositions();
    fetchPendingOrders();
  }, [fetchPositions, fetchPendingOrders]);

  // Expose refresh function to parent
  useEffect(() => {
    if (onRefreshReady) {
      onRefreshReady(refreshAll);
    }
  }, [onRefreshReady, refreshAll]);

  // Initial data fetch
  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  // Auto-refresh pending orders when order events occur (only when tab is active)
  useEffect(() => {
    if (isActive && lastOrderNotification) {
      const { type } = lastOrderNotification;
      
      // Refresh pending orders for order placement, cancellation, and execution events
      if (type === 'order_placed' || type === 'order_cancelled' || type === 'order_executed') {
        // Small delay to ensure backend has processed the change
        setTimeout(() => {
          fetchPendingOrders();
          // Also refresh positions in case of executed orders
          if (type === 'order_executed') {
            fetchPositions();
          }
        }, 500);
      }
    }
  }, [isActive, lastOrderNotification, fetchPendingOrders, fetchPositions]);

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${formatPercentage(value).replace('%', '')}%`;
  };

  const handleClosePosition = async (symbol: string, quantity: number) => {
    try {
      setClosingPositions(prev => new Set(prev).add(symbol));
      
      // Place a sell order for the full quantity to close the position
      await placeOrder(symbol, 'sell', Math.abs(quantity));
      
      // The auto-refresh effect will handle refreshing data when order is placed/executed
      // Just reset the closing state after a short delay
      setTimeout(() => {
        setClosingPositions(prev => {
          const newSet = new Set(prev);
          newSet.delete(symbol);
          return newSet;
        });
      }, 1000);
      
    } catch (error) {
      console.error('Failed to close position:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to close position';
      addFloatingMessage(errorMessage, 'error');
      setClosingPositions(prev => {
        const newSet = new Set(prev);
        newSet.delete(symbol);
        return newSet;
      });
    }
  };

  const handleCancelOrder = async (orderId: number) => {
    try {
      setCancellingOrders(prev => new Set(prev).add(orderId));
      
      // Send cancel order message through WebSocket
      await cancelOrder(orderId);
      
      // The auto-refresh effect will handle refreshing pending orders
      // Just reset the cancelling state after a short delay
      setTimeout(() => {
        setCancellingOrders(prev => {
          const newSet = new Set(prev);
          newSet.delete(orderId);
          return newSet;
        });
      }, 1000);
      
    } catch (error) {
      console.error('Failed to cancel order:', error);
      const errorMessage = error instanceof Error ? error.message : 'Failed to cancel order';
      addFloatingMessage(errorMessage, 'error');
      setCancellingOrders(prev => {
        const newSet = new Set(prev);
        newSet.delete(orderId);
        return newSet;
      });
    }
  };

  const getOrderPrice = (order: PendingOrder) => {
    if (order.type === 'market') {
      return '-';
    }
    if (order.order_params?.limit_price) {
      return formatCurrency(order.order_params.limit_price);
    }
    return '-';
  };

  const loading = positionsLoading && !calculatedPositions.length;

  if (loading) {
    return (
      <div style={{
        backgroundColor: 'white',
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <div>Loading trading view...</div>
      </div>
    );
  }

  if (positionsError) {
    return (
      <div style={{ padding: '20px' }}>
        <div style={{ 
          color: '#dc3545', 
          backgroundColor: '#f8d7da', 
          border: '1px solid #f5c6cb',
          padding: '12px',
          borderRadius: '4px'
        }}>
          {positionsError}
        </div>
        <button
          onClick={refreshAll}
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

  return (
    <div style={{ padding: '0' }}>
      {/* Positions Section */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ 
          padding: '12px 16px',
          backgroundColor: '#f8f9fa',
          borderBottom: '1px solid #dee2e6',
          fontWeight: 'bold',
          fontSize: '14px',
          color: '#495057'
        }}>
          Positions
        </div>
        
        {tradingPositions.length === 0 ? (
          <div style={{ 
            padding: '40px', 
            textAlign: 'center',
            color: '#6c757d'
          }}>
            <div style={{ fontSize: '16px', marginBottom: '10px' }}>No positions</div>
            <div style={{ fontSize: '14px' }}>Open a position to see your holdings here</div>
          </div>
        ) : (
          <div style={{ 
            overflowX: 'auto',
            maxHeight: '300px',
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
        )}
      </div>

      {/* Pending Orders Section */}
      <div>
        <div style={{ 
          padding: '12px 16px',
          backgroundColor: '#f8f9fa',
          borderBottom: '1px solid #dee2e6',
          fontWeight: 'bold',
          fontSize: '14px',
          color: '#495057'
        }}>
          Pending Orders
        </div>
        
        {pendingError && (
          <div style={{ 
            padding: '20px', 
            textAlign: 'center', 
            color: '#dc3545',
            backgroundColor: '#f8d7da',
            border: '1px solid #f5c6cb',
            borderRadius: '6px',
            margin: '10px'
          }}>
            {pendingError}
          </div>
        )}
        
        {pendingLoading ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
            <div>Loading pending orders...</div>
          </div>
        ) : pendingOrders.length === 0 ? (
          <div style={{ 
            padding: '40px 20px', 
            textAlign: 'center', 
            color: '#666',
            fontStyle: 'italic'
          }}>
            No pending orders
          </div>
        ) : (
          <div style={{ 
            overflowX: 'auto',
            maxHeight: '300px',
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
                    textAlign: 'center', 
                    fontWeight: 'bold',
                    position: 'sticky',
                    top: 0,
                    backgroundColor: '#f8f9fa',
                    zIndex: 1
                  }}>Side</th>
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
                  }}>Price</th>
                  <th style={{ 
                    padding: '10px 8px', 
                    textAlign: 'left', 
                    fontWeight: 'bold',
                    position: 'sticky',
                    top: 0,
                    backgroundColor: '#f8f9fa',
                    zIndex: 1
                  }}>Placed</th>
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
                {pendingOrders.map((order, index) => (
                  <tr 
                    key={order.id}
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
                      <div style={{ fontWeight: 'bold', color: '#333' }}>{order.symbol}</div>
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: 'bold',
                        backgroundColor: order.side === 'buy' ? '#28a74520' : '#dc354520',
                        color: order.side === 'buy' ? '#28a745' : '#dc3545',
                        textTransform: 'uppercase'
                      }}>
                        {order.side}
                      </span>
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                      <div style={{ color: '#333' }}>
                        {formatQuantity(order.quantity)}
                      </div>
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                      <div style={{ color: '#333', fontWeight: '500' }}>
                        {getOrderPrice(order)}
                      </div>
                    </td>
                    <td style={{ padding: '10px 8px' }}>
                      <div style={{ color: '#6c757d', fontSize: '11px' }}>
                        {new Date(order.placed_at).toLocaleString()}
                      </div>
                    </td>
                    <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                      <button
                        onClick={() => handleCancelOrder(order.id)}
                        disabled={cancellingOrders.has(order.id)}
                        style={{
                          padding: '4px 8px',
                          fontSize: '11px',
                          backgroundColor: cancellingOrders.has(order.id) ? '#6c757d' : '#ffc107',
                          color: cancellingOrders.has(order.id) ? 'white' : '#212529',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: cancellingOrders.has(order.id) ? 'not-allowed' : 'pointer',
                          fontWeight: '500'
                        }}
                        onMouseEnter={(e) => {
                          if (!cancellingOrders.has(order.id)) {
                            e.currentTarget.style.backgroundColor = '#e0a800';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!cancellingOrders.has(order.id)) {
                            e.currentTarget.style.backgroundColor = '#ffc107';
                          }
                        }}
                      >
                        {cancellingOrders.has(order.id) ? 'Cancelling...' : 'Cancel'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
        <span>Positions: {tradingPositions.length} | Pending Orders: {pendingOrders.length}</span>
        <button
          onClick={refreshAll}
          disabled={positionsLoading || pendingLoading}
          style={{
            padding: '4px 8px',
            fontSize: '11px',
            backgroundColor: 'transparent',
            color: (positionsLoading || pendingLoading) ? '#999' : '#6c757d',
            border: '1px solid #dee2e6',
            borderRadius: '3px',
            cursor: (positionsLoading || pendingLoading) ? 'not-allowed' : 'pointer'
          }}
        >
          {(positionsLoading || pendingLoading) ? 'Refreshing...' : 'Refresh'}
        </button>
      </div>
    </div>
  );
};

export default TradingView;