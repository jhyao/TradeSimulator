import React, { useState, useCallback, useEffect } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { ConnectionState } from '../hooks/useWebSocket';

interface OrderPanelProps {
  symbol: string;
  currentPrice: number;
  simulationState: 'stopped' | 'playing' | 'paused';
}

interface OrderState {
  side: 'buy' | 'sell';
  quantity: string;
  isPlacing: boolean;
  lastOrderStatus: 'success' | 'error' | null;
  lastOrderMessage: string;
}

const OrderPanel: React.FC<OrderPanelProps> = ({ 
  symbol, 
  currentPrice, 
  simulationState 
}) => {
  const { connectionState, placeOrder, lastOrderNotification } = useWebSocketContext();
  const [orderState, setOrderState] = useState<OrderState>({
    side: 'buy',
    quantity: '',
    isPlacing: false,
    lastOrderStatus: null,
    lastOrderMessage: ''
  });

  const isDisabled = simulationState !== 'playing' || 
                    connectionState !== ConnectionState.CONNECTED ||
                    orderState.isPlacing;

  // Listen for order notifications from WebSocket
  useEffect(() => {
    if (lastOrderNotification) {
      setOrderState(prev => ({
        ...prev,
        lastOrderStatus: lastOrderNotification.type === 'order_failed' ? 'error' : 'success',
        lastOrderMessage: lastOrderNotification.message,
        isPlacing: false
      }));
    }
  }, [lastOrderNotification]);

  const handleSideChange = useCallback((side: 'buy' | 'sell') => {
    setOrderState(prev => ({ ...prev, side }));
  }, []);

  const handleQuantityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only positive numbers with up to 8 decimal places
    if (value === '' || /^\d*\.?\d{0,8}$/.test(value)) {
      setOrderState(prev => ({ ...prev, quantity: value }));
    }
  }, []);

  const validateOrder = useCallback((): string | null => {
    const quantity = parseFloat(orderState.quantity);
    
    if (!orderState.quantity || isNaN(quantity) || quantity <= 0) {
      return 'Please enter a valid quantity';
    }
    
    if (quantity > 999999) {
      return 'Quantity too large';
    }

    // Only validate order value if we have a valid current price (simulation running)
    if (currentPrice > 0) {
      const totalValue = quantity * currentPrice;
      if (totalValue < 1) {
        return 'Order value must be at least $1';
      }
    }

    return null;
  }, [orderState.quantity, currentPrice]);

  const handlePlaceOrder = useCallback(async () => {
    const validationError = validateOrder();
    if (validationError) {
      setOrderState(prev => ({
        ...prev,
        lastOrderStatus: 'error',
        lastOrderMessage: validationError
      }));
      return;
    }

    setOrderState(prev => ({ 
      ...prev, 
      isPlacing: true, 
      lastOrderStatus: null, 
      lastOrderMessage: '' 
    }));

    try {
      const quantity = parseFloat(orderState.quantity);
      
      // Send order via WebSocket context
      await placeOrder(symbol, orderState.side, quantity);

      // Reset form on successful send
      setOrderState(prev => ({
        ...prev,
        quantity: '',
        lastOrderStatus: 'success',
        lastOrderMessage: `${orderState.side.toUpperCase()} order for ${quantity} ${symbol} sent`
      }));

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setOrderState(prev => ({
        ...prev,
        lastOrderStatus: 'error',
        lastOrderMessage: `Failed to place order: ${errorMessage}`
      }));
    } finally {
      setOrderState(prev => ({ ...prev, isPlacing: false }));
    }
  }, [symbol, orderState.side, orderState.quantity, placeOrder, validateOrder]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isDisabled) {
      handlePlaceOrder();
    }
  }, [handlePlaceOrder, isDisabled]);

  const estimatedTotal = orderState.quantity && !isNaN(parseFloat(orderState.quantity)) 
    ? parseFloat(orderState.quantity) * currentPrice 
    : 0;

  const fee = estimatedTotal * 0.001; // 0.1% fee
  const totalWithFee = orderState.side === 'buy' 
    ? estimatedTotal + fee 
    : estimatedTotal - fee;

  return (
    <div style={{
      backgroundColor: 'white',
      border: '1px solid #dee2e6',
      borderRadius: '8px',
      padding: '20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
      <h3 style={{
        margin: '0 0 20px 0',
        fontSize: '18px',
        color: '#333',
        textAlign: 'center'
      }}>
        Place Order
      </h3>

      {/* Order Side Toggle */}
      <div style={{
        display: 'flex',
        marginBottom: '15px',
        border: '1px solid #dee2e6',
        borderRadius: '6px',
        overflow: 'hidden'
      }}>
        <button
          onClick={() => handleSideChange('buy')}
          disabled={isDisabled}
          style={{
            flex: 1,
            padding: '10px',
            border: 'none',
            backgroundColor: orderState.side === 'buy' ? '#28a745' : '#f8f9fa',
            color: orderState.side === 'buy' ? 'white' : '#6c757d',
            fontWeight: orderState.side === 'buy' ? 'bold' : 'normal',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
        >
          BUY
        </button>
        <button
          onClick={() => handleSideChange('sell')}
          disabled={isDisabled}
          style={{
            flex: 1,
            padding: '10px',
            border: 'none',
            backgroundColor: orderState.side === 'sell' ? '#dc3545' : '#f8f9fa',
            color: orderState.side === 'sell' ? 'white' : '#6c757d',
            fontWeight: orderState.side === 'sell' ? 'bold' : 'normal',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.2s'
          }}
        >
          SELL
        </button>
      </div>

      {/* Quantity Input */}
      <div style={{ marginBottom: '15px' }}>
        <label style={{
          display: 'block',
          marginBottom: '5px',
          fontSize: '14px',
          fontWeight: '500',
          color: '#495057'
        }}>
          Quantity
        </label>
        <input
          type="text"
          value={orderState.quantity}
          onChange={handleQuantityChange}
          onKeyPress={handleKeyPress}
          disabled={isDisabled}
          placeholder="0.00000000"
          style={{
            width: '100%',
            padding: '10px',
            border: '1px solid #dee2e6',
            borderRadius: '6px',
            fontSize: '14px',
            boxSizing: 'border-box',
            backgroundColor: isDisabled ? '#f8f9fa' : 'white'
          }}
        />
      </div>

      {/* Price Display */}
      <div style={{ marginBottom: '15px' }}>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '8px 0',
          fontSize: '14px',
          color: '#6c757d'
        }}>
          <span>Price:</span>
          <span>${currentPrice.toFixed(2)}</span>
        </div>
      </div>

      {/* Order Summary */}
      {estimatedTotal > 0 && (
        <div style={{
          marginBottom: '15px',
          padding: '10px',
          backgroundColor: '#f8f9fa',
          borderRadius: '6px',
          fontSize: '13px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Subtotal:</span>
            <span>${estimatedTotal.toFixed(2)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Fee (0.1%):</span>
            <span>${fee.toFixed(2)}</span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontWeight: 'bold',
            borderTop: '1px solid #dee2e6',
            paddingTop: '4px'
          }}>
            <span>Total:</span>
            <span>${totalWithFee.toFixed(2)}</span>
          </div>
        </div>
      )}

      {/* Place Order Button */}
      <button
        onClick={handlePlaceOrder}
        disabled={isDisabled}
        style={{
          width: '100%',
          padding: '12px',
          border: 'none',
          borderRadius: '6px',
          backgroundColor: isDisabled ? '#6c757d' : (orderState.side === 'buy' ? '#28a745' : '#dc3545'),
          color: 'white',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.2s'
        }}
      >
        {orderState.isPlacing ? 'Placing Order...' : 
         isDisabled ? 'Start Simulation to Trade' : 
         `${orderState.side.toUpperCase()} ${symbol}`}
      </button>

      {/* Status Message */}
      {orderState.lastOrderMessage && (
        <div style={{
          marginTop: '15px',
          padding: '10px',
          borderRadius: '6px',
          fontSize: '14px',
          backgroundColor: orderState.lastOrderStatus === 'success' ? '#d4edda' : '#f8d7da',
          color: orderState.lastOrderStatus === 'success' ? '#155724' : '#721c24',
          border: `1px solid ${orderState.lastOrderStatus === 'success' ? '#c3e6cb' : '#f5c6cb'}`
        }}>
          {orderState.lastOrderMessage}
        </div>
      )}

      {/* Connection Status */}
      {connectionState !== ConnectionState.CONNECTED && (
        <div style={{
          marginTop: '10px',
          fontSize: '12px',
          color: '#6c757d',
          textAlign: 'center'
        }}>
          WebSocket: {connectionState}
        </div>
      )}
    </div>
  );
};

export default OrderPanel;