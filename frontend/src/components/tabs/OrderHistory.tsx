import React, { useEffect, useRef } from 'react';
import { formatCurrency, formatQuantity } from '../../utils/numberFormat';
import { usePositions } from '../../contexts/PositionsContext';

interface OrderHistoryProps {
  onRefreshReady?: (refreshFn: () => void) => void;
  isActive?: boolean;
}

const OrderHistory: React.FC<OrderHistoryProps> = ({
  onRefreshReady,
  isActive = true
}) => {
  const {
    orders,
    ordersLoading: loading,
    ordersError: error,
    fetchOrders
  } = usePositions();

  // Use ref to track isActive without making it a dependency
  const isActiveRef = useRef(isActive);
  isActiveRef.current = isActive;

  // Expose refresh function to parent
  useEffect(() => {
    if (onRefreshReady) {
      onRefreshReady(fetchOrders);
    }
  }, [onRefreshReady, fetchOrders]);


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
    switch (side.toLowerCase()) {
      case 'buy':
      case 'open_long':
      case 'close_short':
        return '#28a745'; // Green
      case 'sell':
      case 'open_short':
      case 'close_long':
        return '#dc3545'; // Red
      default:
        return '#6c757d'; // Gray
    }
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const getOrderPrice = (order: typeof orders[0]) => {
    if (order.type === 'market') {
      return '-';
    }
    if (order.order_params?.limit_price) {
      return formatCurrency(order.order_params.limit_price);
    }
    return '-';
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
        maxHeight: '450px',
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
                textAlign: 'center',
                fontWeight: 'bold',
                position: 'sticky',
                top: 0,
                backgroundColor: '#f8f9fa',
                zIndex: 1
              }}>Type</th>
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
                    {formatDateTime(order.placed_at)}
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
                <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                  <span style={{
                    padding: '4px 8px',
                    borderRadius: '12px',
                    fontSize: '11px',
                    fontWeight: 'bold',
                    backgroundColor: '#f8f9fa',
                    color: '#333',
                    textTransform: 'uppercase'
                  }}>
                    {order.type}
                  </span>
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                  <div style={{ color: '#333' }}>
                    {formatQuantity(order.quantity)}
                  </div>
                </td>
                <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                  <div style={{ color: '#333' }}>
                    {getOrderPrice(order)}
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