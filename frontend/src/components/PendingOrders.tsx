import React, { useState, useEffect, useCallback } from 'react';
import { ConnectionState } from '../hooks/useWebSocket';
import { formatCurrency, formatQuantity } from '../utils/numberFormat';
import { useWebSocketContext } from '../contexts/WebSocketContext';

interface PendingOrdersProps {
  connectionState: ConnectionState;
  simulationState: 'stopped' | 'playing' | 'paused';
  onRefreshReady?: (refreshFn: () => void) => void;
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

const PendingOrders: React.FC<PendingOrdersProps> = ({ 
  connectionState, 
  simulationState,
  onRefreshReady 
}) => {
  const [pendingOrders, setPendingOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const { currentSimulationStatus } = useWebSocketContext();

  const fetchPendingOrders = useCallback(async () => {
    if (!currentSimulationStatus) {
      return;
    }
    
    let simulationId = currentSimulationStatus.simulationID;
    
    if (!currentSimulationStatus.isRunning && !simulationId) {
      setPendingOrders([]);
      setError('No simulation running. Start a simulation to see pending orders.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const url = simulationId 
        ? `http://localhost:8080/api/orders?simulationId=${simulationId}&status=pending&limit=100`
        : 'http://localhost:8080/api/orders?status=pending&limit=100';

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch pending orders: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      if (data.success) {
        setPendingOrders(data.orders || []);
        setLastRefresh(new Date());
      } else {
        throw new Error(data.error || 'Failed to fetch pending orders');
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMsg);
      console.error('Error fetching pending orders:', err);
    } finally {
      setLoading(false);
    }
  }, [currentSimulationStatus]);

  useEffect(() => {
    if (connectionState === ConnectionState.CONNECTED) {
      fetchPendingOrders();
    }
  }, [connectionState, fetchPendingOrders]);

  useEffect(() => {
    if (onRefreshReady) {
      onRefreshReady(fetchPendingOrders);
    }
  }, [onRefreshReady, fetchPendingOrders]);

  if (loading) {
    return (
      <div style={{ padding: '20px', textAlign: 'center', color: '#666' }}>
        <div>Loading pending orders...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ 
        padding: '20px', 
        textAlign: 'center', 
        color: '#dc3545',
        backgroundColor: '#f8d7da',
        border: '1px solid #f5c6cb',
        borderRadius: '6px',
        margin: '10px'
      }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ 
      height: 'calc(100vh - 200px)',
      overflowY: 'auto',
      padding: '0 10px'
    }}>
      {pendingOrders.length === 0 ? (
        <div style={{ 
          padding: '40px 20px', 
          textAlign: 'center', 
          color: '#666',
          fontStyle: 'italic'
        }}>
          No pending limit orders
        </div>
      ) : (
        <div>
          {/* Header */}
          <div style={{
            display: 'flex',
            padding: '10px',
            borderBottom: '2px solid #dee2e6',
            fontWeight: 'bold',
            fontSize: '12px',
            color: '#495057',
            backgroundColor: '#f8f9fa'
          }}>
            <div style={{ flex: '0 0 80px' }}>Symbol</div>
            <div style={{ flex: '0 0 50px' }}>Side</div>
            <div style={{ flex: '0 0 80px' }}>Quantity</div>
            <div style={{ flex: '0 0 100px' }}>Limit Price</div>
            <div style={{ flex: '0 0 80px' }}>Status</div>
            <div style={{ flex: '1' }}>Placed</div>
          </div>

          {/* Pending Orders List */}
          {pendingOrders.map((order) => (
            <div 
              key={order.id} 
              style={{
                display: 'flex',
                padding: '8px 10px',
                borderBottom: '1px solid #e9ecef',
                fontSize: '12px',
                alignItems: 'center',
                backgroundColor: 'white'
              }}
            >
              <div style={{ 
                flex: '0 0 80px',
                fontWeight: '500',
                color: '#333'
              }}>
                {order.symbol}
              </div>
              <div style={{ 
                flex: '0 0 50px',
                color: order.side === 'buy' ? '#28a745' : '#dc3545',
                fontWeight: 'bold',
                textTransform: 'uppercase'
              }}>
                {order.side}
              </div>
              <div style={{ flex: '0 0 80px', textAlign: 'right' }}>
                {formatQuantity(order.quantity)}
              </div>
              <div style={{ flex: '0 0 100px', textAlign: 'right', fontWeight: '500' }}>
                {order.order_params?.limit_price ? formatCurrency(order.order_params.limit_price) : '-'}
              </div>
              <div style={{ 
                flex: '0 0 80px',
                color: order.status === 'pending' ? '#ffc107' : '#6c757d',
                textTransform: 'capitalize'
              }}>
                {order.status}
              </div>
              <div style={{ flex: '1', color: '#6c757d', fontSize: '11px' }}>
                {new Date(order.placed_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      )}
      
      {lastRefresh && (
        <div style={{ 
          padding: '10px', 
          textAlign: 'center', 
          fontSize: '11px', 
          color: '#6c757d' 
        }}>
          Last updated: {lastRefresh.toLocaleTimeString()}
        </div>
      )}
    </div>
  );
};

export default PendingOrders;