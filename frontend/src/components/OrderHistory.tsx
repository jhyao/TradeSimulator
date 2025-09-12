import React, { useState, useEffect, useCallback } from 'react';
import { ConnectionState } from '../hooks/useWebSocket';
import { formatCurrency, formatQuantity } from '../utils/numberFormat';
import { useWebSocketContext } from '../contexts/WebSocketContext';

interface OrderHistoryProps {
  connectionState: ConnectionState;
  simulationState: 'stopped' | 'playing' | 'paused';
  onRefreshReady?: (refreshFn: () => void) => void;
}

interface Order {
  id: number;
  user_id: number;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  status: string;
  created_at: string;
  updated_at: string;
}

const OrderHistory: React.FC<OrderHistoryProps> = ({ 
  connectionState, 
  simulationState,
  onRefreshReady 
}) => {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const { currentSimulationStatus } = useWebSocketContext();

  const fetchOrders = useCallback(async () => {
    // If no simulation status available yet, wait
    if (!currentSimulationStatus) {
      return;
    }
    
    // If simulation is running, use its ID
    let simulationId = currentSimulationStatus.simulationID;
    
    // If no running simulation but we have a simulation ID from history, use it
    if (!currentSimulationStatus.isRunning && !simulationId) {
      setOrders([]);
      setError('No simulation running. Start a simulation to see orders.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/orders?limit=50&simulation_id=${simulationId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setOrders(data.orders || []);
      setLastRefresh(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load orders: ${errorMessage}`);
      console.error('Error fetching orders:', err);
    } finally {
      setLoading(false);
    }
  }, [currentSimulationStatus]);

  // Expose refresh function to parent
  useEffect(() => {
    if (onRefreshReady) {
      onRefreshReady(fetchOrders);
    }
  }, [onRefreshReady, fetchOrders]);

  // Auto-refresh orders data
  useEffect(() => {
    if (connectionState === ConnectionState.CONNECTED) {
      fetchOrders();
      
      // Set up auto-refresh every 5 seconds during simulation
      const interval = simulationState === 'playing' 
        ? setInterval(fetchOrders, 5000)
        : null;

      return () => {
        if (interval) clearInterval(interval);
      };
    }
  }, [connectionState, simulationState, fetchOrders]);

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'filled':
        return '#28a745';
      case 'pending':
        return '#ffc107';
      case 'cancelled':
        return '#dc3545';
      default:
        return '#6c757d';
    }
  };

  const getSideColor = (side: string) => {
    return side.toLowerCase() === 'buy' ? '#28a745' : '#dc3545';
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  if (loading && orders.length === 0) {
    return (
      <div style={{
        padding: '20px',
        textAlign: 'center',
        color: '#6c757d'
      }}>
        <div>Loading orders...</div>
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
          onClick={fetchOrders}
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

  if (orders.length === 0) {
    return (
      <div style={{ 
        padding: '40px', 
        textAlign: 'center',
        color: '#6c757d'
      }}>
        <div style={{ fontSize: '16px', marginBottom: '10px' }}>No orders found</div>
        <div style={{ fontSize: '14px' }}>Place an order to see your order history here</div>
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
              }}>Time</th>
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
                textAlign: 'center', 
                fontWeight: 'bold',
                position: 'sticky',
                top: 0,
                backgroundColor: '#f8f9fa',
                zIndex: 1
              }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((order, index) => (
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
                  <div style={{ color: '#666' }}>
                    {formatDateTime(order.created_at)}
                  </div>
                </td>
                <td style={{ padding: '10px 8px' }}>
                  <div style={{ fontWeight: 'bold', color: '#333' }}>{order.symbol}</div>
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    backgroundColor: `${getSideColor(order.side)}20`,
                    color: getSideColor(order.side),
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
                  <div style={{ color: '#333' }}>
                    {formatCurrency(order.price)}
                  </div>
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    backgroundColor: `${getStatusColor(order.status)}20`,
                    color: getStatusColor(order.status),
                    textTransform: 'capitalize'
                  }}>
                    {order.status}
                  </span>
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
        <span>Total orders: {orders.length}</span>
        <button
          onClick={fetchOrders}
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

export default OrderHistory;