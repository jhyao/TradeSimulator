import React, { useState, useCallback, useEffect } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { usePositions } from '../contexts/PositionsContext';
import { ConnectionState } from '../hooks/useWebSocket';
import { formatCurrency } from '../utils/numberFormat';

interface OrderPanelProps {
  symbol: string;
  currentPrice: number;
  simulationState: 'stopped' | 'playing' | 'paused';
}

interface OrderState {
  side: 'buy' | 'sell';
  type: 'market' | 'limit';
  quantity: string;
  limitPrice: string;
  percentage: number;
  quantityStep: string;
  priceStep: string;
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
  const { calculatedPositions } = usePositions();
  const [orderState, setOrderState] = useState<OrderState>({
    side: 'buy',
    type: 'market',
    quantity: '',
    limitPrice: '',
    percentage: 0,
    quantityStep: '1',
    priceStep: '1',
    isPlacing: false,
    lastOrderStatus: null,
    lastOrderMessage: ''
  });

  const isDisabled = (simulationState !== 'playing' && simulationState !== 'paused') || 
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

  // Helper functions for percentage calculations
  const getCashBalance = useCallback((): number => {
    const usdtPosition = calculatedPositions.find(pos => pos.position.symbol === 'USDT');
    return usdtPosition ? usdtPosition.position.quantity : 0;
  }, [calculatedPositions]);

  const getSymbolPosition = useCallback((): number => {
    const symbolPosition = calculatedPositions.find(pos => pos.position.symbol === symbol);
    return symbolPosition ? symbolPosition.position.quantity : 0;
  }, [calculatedPositions, symbol]);

  const getEffectivePrice = useCallback((): number => {
    if (orderState.type === 'limit' && orderState.limitPrice) {
      const limitPrice = parseFloat(orderState.limitPrice);
      return !isNaN(limitPrice) && limitPrice > 0 ? limitPrice : currentPrice;
    }
    return currentPrice;
  }, [orderState.type, orderState.limitPrice, currentPrice]);

  const calculateMaxQuantity = useCallback((): number => {
    if (orderState.side === 'buy') {
      const cashBalance = getCashBalance();
      const effectivePrice = getEffectivePrice();
      if (effectivePrice <= 0) return 0;

      // For buy orders, we need to account for fees
      // Total cost = quantity * price + fee
      // Fee = quantity * price * 0.001
      // Total cost = quantity * price * (1 + 0.001)
      // Max quantity = cashBalance / (price * 1.001)
      const feeMultiplier = 1.001; // 0.1% fee
      return cashBalance / (effectivePrice * feeMultiplier);
    } else {
      return getSymbolPosition();
    }
  }, [orderState.side, getCashBalance, getSymbolPosition, getEffectivePrice]);

  const floorToDecimals = useCallback((value: number, decimals: number): number => {
    const multiplier = Math.pow(10, decimals);
    return Math.floor(value * multiplier) / multiplier;
  }, []);

  const calculateQuantityFromPercentage = useCallback((percentage: number): number => {
    const maxQuantity = calculateMaxQuantity();
    const quantity = (percentage / 100) * maxQuantity;
    return floorToDecimals(quantity, 3);
  }, [calculateMaxQuantity, floorToDecimals]);

  const calculatePercentageFromQuantity = useCallback((quantity: number): number => {
    const maxQuantity = calculateMaxQuantity();
    return maxQuantity > 0 ? Math.min(100, (quantity / maxQuantity) * 100) : 0;
  }, [calculateMaxQuantity]);

  const isQuantityExceedsMax = useCallback((): boolean => {
    if (!orderState.quantity || isNaN(parseFloat(orderState.quantity))) return false;
    const quantity = parseFloat(orderState.quantity);
    const maxQuantity = calculateMaxQuantity();
    return quantity > maxQuantity;
  }, [orderState.quantity, calculateMaxQuantity]);

  const handleSideChange = useCallback((side: 'buy' | 'sell') => {
    setOrderState(prev => ({ ...prev, side }));
  }, []);

  const handleTypeChange = useCallback((type: 'market' | 'limit') => {
    setOrderState(prev => ({ ...prev, type, limitPrice: type === 'market' ? '' : prev.limitPrice }));
  }, []);

  const handleQuantityChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only positive numbers with up to 3 decimal places
    if (value === '' || /^\d*\.?\d{0,3}$/.test(value)) {
      const quantity = parseFloat(value) || 0;
      const calculatedPercentage = calculatePercentageFromQuantity(quantity);
      setOrderState(prev => ({
        ...prev,
        quantity: value,
        percentage: calculatedPercentage
      }));
    }
  }, [calculatePercentageFromQuantity]);

  const handleLimitPriceChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only positive numbers with up to 8 decimal places
    if (value === '' || /^\d*\.?\d{0,8}$/.test(value)) {
      setOrderState(prev => ({ ...prev, limitPrice: value }));
    }
  }, []);

  // Update percentage when price changes (for limit orders) or balance changes
  useEffect(() => {
    if (orderState.quantity && !isNaN(parseFloat(orderState.quantity))) {
      const quantity = parseFloat(orderState.quantity);
      const calculatedPercentage = calculatePercentageFromQuantity(quantity);
      if (Math.abs(calculatedPercentage - orderState.percentage) > 0.1) {
        setOrderState(prev => ({
          ...prev,
          percentage: calculatedPercentage
        }));
      }
    }
  }, [currentPrice, orderState.limitPrice, calculatedPositions, orderState.quantity, calculatePercentageFromQuantity, orderState.percentage]);

  const handlePercentageChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const percentage = parseFloat(e.target.value);
    const calculatedQuantity = calculateQuantityFromPercentage(percentage);
    setOrderState(prev => ({
      ...prev,
      percentage: percentage, // Keep the slider percentage as-is
      quantity: calculatedQuantity.toFixed(3).replace(/\.?0+$/, '')
    }));
  }, [calculateQuantityFromPercentage]);

  const handlePresetClick = useCallback((percentage: number) => {
    const calculatedQuantity = calculateQuantityFromPercentage(percentage);
    setOrderState(prev => ({
      ...prev,
      percentage: percentage, // Keep the preset percentage (100% shows as 100%)
      quantity: calculatedQuantity.toFixed(3).replace(/\.?0+$/, '')
    }));
  }, [calculateQuantityFromPercentage]);

  const handleMarketPriceClick = useCallback(() => {
    if (orderState.type === 'limit' && currentPrice > 0) {
      setOrderState(prev => ({
        ...prev,
        limitPrice: currentPrice.toString()
      }));
    }
  }, [orderState.type, currentPrice]);

  const handleQuantityIncrement = useCallback((amount: number) => {
    const currentQuantity = parseFloat(orderState.quantity) || 0;
    const newQuantity = Math.max(0, currentQuantity + amount);
    const flooredQuantity = floorToDecimals(newQuantity, 3);
    const newQuantityStr = flooredQuantity.toFixed(3).replace(/\.?0+$/, '');
    const calculatedPercentage = calculatePercentageFromQuantity(flooredQuantity);

    setOrderState(prev => ({
      ...prev,
      quantity: newQuantityStr,
      percentage: calculatedPercentage
    }));
  }, [orderState.quantity, calculatePercentageFromQuantity, floorToDecimals]);

  const handlePriceIncrement = useCallback((amount: number) => {
    const currentPrice = parseFloat(orderState.limitPrice) || 0;
    const newPrice = Math.max(0, currentPrice + amount);
    const newPriceStr = newPrice.toFixed(8).replace(/\.?0+$/, '');

    setOrderState(prev => ({
      ...prev,
      limitPrice: newPriceStr
    }));
  }, [orderState.limitPrice]);

  const handleQuantityStepChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only positive numbers with up to 8 decimal places
    if (value === '' || /^\d*\.?\d{0,8}$/.test(value)) {
      setOrderState(prev => ({ ...prev, quantityStep: value }));
    }
  }, []);

  const handlePriceStepChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    // Allow only positive numbers with up to 8 decimal places
    if (value === '' || /^\d*\.?\d{0,8}$/.test(value)) {
      setOrderState(prev => ({ ...prev, priceStep: value }));
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

    // Validate limit price for limit orders
    if (orderState.type === 'limit') {
      const limitPrice = parseFloat(orderState.limitPrice);
      if (!orderState.limitPrice || isNaN(limitPrice) || limitPrice <= 0) {
        return 'Please enter a valid limit price';
      }
      
      if (limitPrice > 999999) {
        return 'Limit price too large';
      }
      
      // Check minimum order value using limit price
      const totalValue = quantity * limitPrice;
      if (totalValue < 1) {
        return 'Order value must be at least $1';
      }
    } else {
      // Only validate order value if we have a valid current price (simulation running)
      if (currentPrice > 0) {
        const totalValue = quantity * currentPrice;
        if (totalValue < 1) {
          return 'Order value must be at least $1';
        }
      }
    }

    return null;
  }, [orderState.quantity, orderState.limitPrice, orderState.type, currentPrice]);

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
      const limitPrice = orderState.type === 'limit' ? parseFloat(orderState.limitPrice) : undefined;
      
      // Send order via WebSocket context
      await placeOrder(symbol, orderState.side, quantity, orderState.type, limitPrice);

      // Reset form on successful send
      // setOrderState(prev => ({
      //   ...prev,
      //   quantity: '',
      //   limitPrice: orderState.type === 'market' ? '' : prev.limitPrice,
      //   lastOrderStatus: 'success',
      //   lastOrderMessage: `${orderState.type.toUpperCase()} ${orderState.side.toUpperCase()} order for ${quantity} ${symbol} sent`
      // }));

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
  }, [symbol, orderState.side, orderState.quantity, orderState.type, orderState.limitPrice, placeOrder, validateOrder]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isDisabled) {
      handlePlaceOrder();
    }
  }, [handlePlaceOrder, isDisabled]);

  const effectivePrice = orderState.type === 'limit' && orderState.limitPrice 
    ? parseFloat(orderState.limitPrice) 
    : currentPrice;

  const estimatedTotal = orderState.quantity && !isNaN(parseFloat(orderState.quantity)) 
    ? parseFloat(orderState.quantity) * effectivePrice 
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

      {/* Order Type Toggle */}
      <div style={{
        display: 'flex',
        marginBottom: '15px',
        border: '1px solid #dee2e6',
        borderRadius: '6px',
        overflow: 'hidden'
      }}>
        <button
          onClick={() => handleTypeChange('market')}
          disabled={isDisabled}
          style={{
            flex: 1,
            padding: '8px',
            border: 'none',
            backgroundColor: orderState.type === 'market' ? '#007bff' : '#f8f9fa',
            color: orderState.type === 'market' ? 'white' : '#6c757d',
            fontWeight: orderState.type === 'market' ? 'bold' : 'normal',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s'
          }}
        >
          MARKET
        </button>
        <button
          onClick={() => handleTypeChange('limit')}
          disabled={isDisabled}
          style={{
            flex: 1,
            padding: '8px',
            border: 'none',
            backgroundColor: orderState.type === 'limit' ? '#007bff' : '#f8f9fa',
            color: orderState.type === 'limit' ? 'white' : '#6c757d',
            fontWeight: orderState.type === 'limit' ? 'bold' : 'normal',
            cursor: isDisabled ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            transition: 'all 0.2s'
          }}
        >
          LIMIT
        </button>
      </div>

      {/* Limit Price Input - Only show for limit orders */}
      {orderState.type === 'limit' && (
        <div style={{ marginBottom: '15px' }}>
          <label style={{
            display: 'block',
            marginBottom: '5px',
            fontSize: '14px',
            fontWeight: '500',
            color: '#495057'
          }}>
            Limit Price
          </label>
          <div style={{
            display: 'flex',
            alignItems: 'stretch',
            gap: '8px'
          }}>
            <input
              type="text"
              value={orderState.limitPrice}
              onChange={handleLimitPriceChange}
              onKeyPress={handleKeyPress}
              disabled={isDisabled}
              placeholder="0.00000000"
              style={{
                flex: 1,
                padding: '10px',
                border: '1px solid #dee2e6',
                borderRadius: '6px',
                fontSize: '14px',
                boxSizing: 'border-box',
                backgroundColor: isDisabled ? '#f8f9fa' : 'white'
              }}
            />

            {/* Step Controls */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '4px 8px',
              border: '1px solid #dee2e6',
              borderRadius: '6px',
              backgroundColor: isDisabled ? '#f8f9fa' : 'white'
            }}>
              <button
                onClick={() => handlePriceIncrement(-(parseFloat(orderState.priceStep) || 1))}
                disabled={isDisabled}
                style={{
                  width: '24px',
                  height: '24px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: isDisabled ? '#e9ecef' : '#f8f9fa',
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6c757d',
                  transition: 'background-color 0.2s'
                }}
                title={`Decrease by ${orderState.priceStep}`}
                onMouseEnter={(e) => {
                  if (!isDisabled) (e.target as HTMLButtonElement).style.backgroundColor = '#e9ecef';
                }}
                onMouseLeave={(e) => {
                  if (!isDisabled) (e.target as HTMLButtonElement).style.backgroundColor = '#f8f9fa';
                }}
              >
                -
              </button>

              <input
                type="text"
                value={orderState.priceStep}
                onChange={handlePriceStepChange}
                disabled={isDisabled}
                placeholder="1"
                style={{
                  width: '40px',
                  height: '24px',
                  padding: '2px 4px',
                  border: '1px solid #dee2e6',
                  borderRadius: '4px',
                  fontSize: '12px',
                  textAlign: 'center',
                  backgroundColor: isDisabled ? '#f8f9fa' : 'white'
                }}
                title="Step amount"
              />

              <button
                onClick={() => handlePriceIncrement(parseFloat(orderState.priceStep) || 1)}
                disabled={isDisabled}
                style={{
                  width: '24px',
                  height: '24px',
                  border: 'none',
                  borderRadius: '4px',
                  backgroundColor: isDisabled ? '#e9ecef' : '#f8f9fa',
                  cursor: isDisabled ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6c757d',
                  transition: 'background-color 0.2s'
                }}
                title={`Increase by ${orderState.priceStep}`}
                onMouseEnter={(e) => {
                  if (!isDisabled) (e.target as HTMLButtonElement).style.backgroundColor = '#e9ecef';
                }}
                onMouseLeave={(e) => {
                  if (!isDisabled) (e.target as HTMLButtonElement).style.backgroundColor = '#f8f9fa';
                }}
              >
                +
              </button>
            </div>
          </div>
        </div>
      )}

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
        <div style={{
          display: 'flex',
          alignItems: 'stretch',
          gap: '8px'
        }}>
          <input
            type="text"
            value={orderState.quantity}
            onChange={handleQuantityChange}
            onKeyPress={handleKeyPress}
            disabled={isDisabled}
            placeholder="0.000"
            style={{
              flex: 1,
              padding: '10px',
              border: '1px solid #dee2e6',
              borderRadius: '6px',
              fontSize: '14px',
              boxSizing: 'border-box',
              backgroundColor: isDisabled ? '#f8f9fa' : 'white'
            }}
          />

          {/* Step Controls */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 8px',
            border: '1px solid #dee2e6',
            borderRadius: '6px',
            backgroundColor: isDisabled ? '#f8f9fa' : 'white'
          }}>
            <button
              onClick={() => handleQuantityIncrement(-(parseFloat(orderState.quantityStep) || 1))}
              disabled={isDisabled}
              style={{
                width: '24px',
                height: '24px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: isDisabled ? '#e9ecef' : '#f8f9fa',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6c757d',
                transition: 'background-color 0.2s'
              }}
              title={`Decrease by ${orderState.quantityStep}`}
              onMouseEnter={(e) => {
                if (!isDisabled) (e.target as HTMLButtonElement).style.backgroundColor = '#e9ecef';
              }}
              onMouseLeave={(e) => {
                if (!isDisabled) (e.target as HTMLButtonElement).style.backgroundColor = '#f8f9fa';
              }}
            >
              -
            </button>

            <input
              type="text"
              value={orderState.quantityStep}
              onChange={handleQuantityStepChange}
              disabled={isDisabled}
              placeholder="1"
              style={{
                width: '40px',
                height: '24px',
                padding: '2px 4px',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                fontSize: '12px',
                textAlign: 'center',
                backgroundColor: isDisabled ? '#f8f9fa' : 'white'
              }}
              title="Step amount"
            />

            <button
              onClick={() => handleQuantityIncrement(parseFloat(orderState.quantityStep) || 1)}
              disabled={isDisabled}
              style={{
                width: '24px',
                height: '24px',
                border: 'none',
                borderRadius: '4px',
                backgroundColor: isDisabled ? '#e9ecef' : '#f8f9fa',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6c757d',
                transition: 'background-color 0.2s'
              }}
              title={`Increase by ${orderState.quantityStep}`}
              onMouseEnter={(e) => {
                if (!isDisabled) (e.target as HTMLButtonElement).style.backgroundColor = '#e9ecef';
              }}
              onMouseLeave={(e) => {
                if (!isDisabled) (e.target as HTMLButtonElement).style.backgroundColor = '#f8f9fa';
              }}
            >
              +
            </button>
          </div>
        </div>

        {/* Quantity Warning */}
        {isQuantityExceedsMax() && (
          <div style={{
            marginTop: '5px',
            padding: '8px',
            backgroundColor: '#fff3cd',
            color: '#856404',
            border: '1px solid #ffeaa7',
            borderRadius: '4px',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}>
            <span>⚠️</span>
            <span>
              Quantity exceeds maximum available: {calculateMaxQuantity().toFixed(3)} {orderState.side === 'buy' ? symbol : symbol}
            </span>
          </div>
        )}
      </div>

      {/* Percentage Slider */}
      <div style={{ marginBottom: '15px' }}>
        <label style={{
          display: 'block',
          marginBottom: '8px',
          fontSize: '14px',
          fontWeight: '500',
          color: '#495057'
        }}>
          Percentage ({orderState.percentage.toFixed(1)}%)
        </label>

        {/* Quick Preset Buttons */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '10px'
        }}>
          {[25, 50, 75, 100].map(percentage => (
            <button
              key={percentage}
              onClick={() => handlePresetClick(percentage)}
              disabled={isDisabled}
              style={{
                flex: 1,
                padding: '6px',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                backgroundColor: Math.abs(orderState.percentage - percentage) < 0.1 ? '#007bff' : '#f8f9fa',
                color: Math.abs(orderState.percentage - percentage) < 0.1 ? 'white' : '#6c757d',
                fontSize: '12px',
                fontWeight: Math.abs(orderState.percentage - percentage) < 0.1 ? 'bold' : 'normal',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                transition: 'all 0.2s'
              }}
            >
              {percentage}%
            </button>
          ))}
        </div>

        {/* Slider */}
        <input
          type="range"
          min="0"
          max="100"
          step="0.1"
          value={orderState.percentage}
          onChange={handlePercentageChange}
          disabled={isDisabled}
          style={{
            width: '100%',
            height: '6px',
            borderRadius: '3px',
            background: `linear-gradient(to right, #007bff 0%, #007bff ${orderState.percentage}%, #dee2e6 ${orderState.percentage}%, #dee2e6 100%)`,
            outline: 'none',
            cursor: isDisabled ? 'not-allowed' : 'pointer'
          }}
        />

        {/* Max Available Display */}
        <div style={{
          marginTop: '5px',
          fontSize: '12px',
          color: '#6c757d',
          display: 'flex',
          justifyContent: 'space-between'
        }}>
          <span>0%</span>
          <span>
            Max: {orderState.side === 'buy'
              ? `${formatCurrency(getCashBalance())} / ${formatCurrency(getEffectivePrice())} = ${calculateMaxQuantity().toFixed(3)} ${symbol}`
              : `${calculateMaxQuantity().toFixed(3)} ${symbol}`
            }
          </span>
          <span>100%</span>
        </div>
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
          <span>{orderState.type === 'limit' ? 'Market Price:' : 'Price:'}</span>
          <span
            onClick={orderState.type === 'limit' ? handleMarketPriceClick : undefined}
            style={{
              cursor: orderState.type === 'limit' ? 'pointer' : 'default',
              color: orderState.type === 'limit' ? '#007bff' : '#6c757d',
              textDecoration: orderState.type === 'limit' ? 'underline' : 'none',
              transition: 'color 0.2s'
            }}
            title={orderState.type === 'limit' ? 'Click to copy to limit price' : ''}
          >
            {formatCurrency(currentPrice)}
          </span>
        </div>
        {orderState.type === 'limit' && orderState.limitPrice && !isNaN(parseFloat(orderState.limitPrice)) && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '8px 0',
            fontSize: '14px',
            color: '#495057',
            fontWeight: '500'
          }}>
            <span>Limit Price:</span>
            <span>{formatCurrency(parseFloat(orderState.limitPrice))}</span>
          </div>
        )}
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
            <span>{formatCurrency(estimatedTotal)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
            <span>Fee (0.1%):</span>
            <span>{formatCurrency(fee)}</span>
          </div>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontWeight: 'bold',
            borderTop: '1px solid #dee2e6',
            paddingTop: '4px'
          }}>
            <span>Total:</span>
            <span>{formatCurrency(totalWithFee)}</span>
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