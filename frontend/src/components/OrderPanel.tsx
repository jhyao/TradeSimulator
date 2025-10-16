import React, { useState, useCallback, useEffect } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { usePositions } from '../contexts/PositionsContext';
import { ConnectionState } from '../hooks/useWebSocket';
import { formatCurrency } from '../utils/numberFormat';
import QuickTradeSettings, { QuickTradeButton } from './QuickTradeSettings';

interface OrderPanelProps {
  symbol: string;
  currentPrice: number;
  simulationState: 'stopped' | 'playing' | 'paused';
}

interface OrderState {
  side: 'buy' | 'sell' | 'open_long' | 'open_short' | 'close_long' | 'close_short';
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

const STORAGE_KEY = 'quickTradeButtons';

const OrderPanel: React.FC<OrderPanelProps> = ({
  symbol,
  currentPrice,
  simulationState
}) => {
  const { connectionState, placeOrder, lastOrderNotification, tradingMode, leverage } = useWebSocketContext();
  const { calculatedPositions, calculatedFuturesPositions } = usePositions();
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

  // Quick Trade Mode state
  const [quickTradeMode, setQuickTradeMode] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [quickTradeButtons, setQuickTradeButtons] = useState<QuickTradeButton[]>([]);

  // Load quick trade buttons from localStorage on mount and filter by trading mode
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const allButtons: QuickTradeButton[] = JSON.parse(stored);
        // Filter buttons by current trading mode
        const modeButtons = allButtons.filter(btn => btn.tradingMode === tradingMode);
        setQuickTradeButtons(modeButtons);
      }
    } catch (error) {
      console.error('Failed to load quick trade buttons:', error);
    }
  }, [tradingMode]);

  // Save quick trade buttons to localStorage
  const saveQuickTradeButtons = useCallback((buttons: QuickTradeButton[]) => {
    try {
      // Load all existing buttons from localStorage
      const stored = localStorage.getItem(STORAGE_KEY);
      const allButtons: QuickTradeButton[] = stored ? JSON.parse(stored) : [];

      // Remove buttons for the current trading mode and add the new ones
      const otherModeButtons = allButtons.filter(btn => btn.tradingMode !== tradingMode);
      const updatedButtons = [...otherModeButtons, ...buttons];

      // Save all buttons back to localStorage
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updatedButtons));

      // Update state with buttons for current mode only
      setQuickTradeButtons(buttons);
    } catch (error) {
      console.error('Failed to save quick trade buttons:', error);
    }
  }, [tradingMode]);

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
    } else if (orderState.side === 'sell') {
      return getSymbolPosition();
    } else if (orderState.side === 'open_long' || orderState.side === 'open_short') {
      // For futures opening positions, calculate max quantity based on available margin
      const cashBalance = getCashBalance();
      const effectivePrice = getEffectivePrice();
      if (effectivePrice <= 0 || leverage <= 0) return 0;

      // For futures orders:
      // Required margin = (quantity * price) / leverage
      // Fee = quantity * price * 0.0004 (0.04% for futures)
      // Total margin needed = required margin + fee
      // Max quantity = cashBalance / ((price / leverage) + price * 0.0004)
      const marginRequirement = effectivePrice / leverage;
      const feeMultiplier = effectivePrice * 0.0004; // 0.04% fee for futures
      return cashBalance / (marginRequirement + feeMultiplier);
    } else if (orderState.side === 'close_long' || orderState.side === 'close_short') {
      // For closing futures positions, get the existing position size
      const positionSide = orderState.side === 'close_long' ? 'long' : 'short';
      const futuresPosition = calculatedFuturesPositions.find(pos =>
        pos.position.symbol === symbol &&
        pos.position.position_side === positionSide
      );
      return futuresPosition ? Math.abs(futuresPosition.position.size) : 0;
    } else {
      return 0;
    }
  }, [orderState.side, getCashBalance, getSymbolPosition, getEffectivePrice, leverage, calculatedPositions, calculatedFuturesPositions, symbol]);

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

  const handleSideChange = useCallback((side: 'buy' | 'sell' | 'open_long' | 'open_short' | 'close_long' | 'close_short') => {
    setOrderState(prev => ({ ...prev, side }));
  }, []);

  // Helper function to check if order side is futures
  const isFuturesOrder = useCallback((side: string): boolean => {
    return side === 'open_long' || side === 'open_short' || side === 'close_long' || side === 'close_short';
  }, []);

  // Helper function to get display name for order side
  const getSideDisplayName = useCallback((side: string): string => {
    switch (side) {
      case 'buy': return 'BUY';
      case 'sell': return 'SELL';
      case 'open_long': return 'OPEN LONG';
      case 'open_short': return 'OPEN SHORT';
      case 'close_long': return 'CLOSE LONG';
      case 'close_short': return 'CLOSE SHORT';
      default: return side.toUpperCase();
    }
  }, []);

  // Helper function to get button color for order side
  const getSideButtonColor = useCallback((side: string, isSelected: boolean): string => {
    if (!isSelected) return '#f8f9fa';

    switch (side) {
      case 'buy':
      case 'open_long':
      case 'close_short':
        return '#28a745'; // Green for long/buy
      case 'sell':
      case 'open_short':
      case 'close_long':
        return '#dc3545'; // Red for short/sell
      default:
        return '#007bff';
    }
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

      // Send order via WebSocket context - pass leverage for futures orders
      await placeOrder(symbol, orderState.side, quantity, orderState.type, limitPrice,
        isFuturesOrder(orderState.side) ? leverage : undefined);

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
  }, [symbol, orderState.side, orderState.quantity, orderState.type, orderState.limitPrice, placeOrder, validateOrder, isFuturesOrder, leverage]);

  const handleKeyPress = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isDisabled) {
      handlePlaceOrder();
    }
  }, [handlePlaceOrder, isDisabled]);

  // Quick trade button click handler
  const handleQuickTradeClick = useCallback(async (button: QuickTradeButton) => {
    if (isDisabled) return;

    try {
      // Temporarily set the side to calculate max quantity correctly
      const prevSide = orderState.side;
      setOrderState(prev => ({ ...prev, side: button.side }));

      // Calculate quantity based on position size type
      let quantity = 0;

      if (button.positionSizeType === 'quantity') {
        // Direct quantity specified
        quantity = button.positionQuantity || 0;
      } else {
        // Calculate quantity based on percentage
        let maxQty = 0;
        if (button.side === 'buy') {
          const cashBalance = getCashBalance();
          const price = currentPrice;
          if (price > 0) {
            maxQty = cashBalance / 1.01 / price;
          }
        } else if (button.side === 'sell') {
          maxQty = getSymbolPosition();
        } else if (button.side === 'open_long' || button.side === 'open_short') {
          const cashBalance = getCashBalance();
          const price = currentPrice;
          if (price > 0 && leverage > 0) {
            maxQty = cashBalance / 1.01 / price * leverage; // Adjusted for leverage and fees
          }
        } else if (button.side === 'close_long' || button.side === 'close_short') {
          const positionSide = button.side === 'close_long' ? 'long' : 'short';
          const futuresPosition = calculatedFuturesPositions.find(pos =>
            pos.position.symbol === symbol &&
            pos.position.position_side === positionSide
          );
          maxQty = futuresPosition ? Math.abs(futuresPosition.position.size) : 0;
        }

        quantity = floorToDecimals(((button.positionPercent || 0) / 100) * maxQty, 3);
      }

      // Restore original side
      setOrderState(prev => ({ ...prev, side: prevSide }));

      if (quantity <= 0) {
        setOrderState(prev => ({
          ...prev,
          lastOrderStatus: 'error',
          lastOrderMessage: 'Insufficient balance for this trade'
        }));
        return;
      }

      // Calculate price for limit orders
      let limitPrice: number | undefined = undefined;
      if (button.priceType === 'limit') {
        if (button.priceOffsetType === 'percent' && button.priceOffset !== undefined) {
          // Percentage offset
          limitPrice = currentPrice * (1 + button.priceOffset / 100);
        } else if (button.priceOffsetType === 'absolute' && button.priceOffset !== undefined) {
          // Absolute offset
          limitPrice = currentPrice + button.priceOffset;
        } else {
          // No offset, use market price
          limitPrice = currentPrice;
        }
      }

      // Validate minimum order value
      const orderValue = quantity * (limitPrice || currentPrice);
      if (orderValue < 1) {
        setOrderState(prev => ({
          ...prev,
          lastOrderStatus: 'error',
          lastOrderMessage: 'Order value must be at least $1'
        }));
        return;
      }

      setOrderState(prev => ({
        ...prev,
        isPlacing: true,
        lastOrderStatus: null,
        lastOrderMessage: ''
      }));

      // Place the order
      const isFutures = button.side === 'open_long' || button.side === 'open_short' ||
                       button.side === 'close_long' || button.side === 'close_short';
      await placeOrder(
        symbol,
        button.side,
        quantity,
        button.priceType,
        limitPrice,
        isFutures ? leverage : undefined
      );

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setOrderState(prev => ({
        ...prev,
        lastOrderStatus: 'error',
        lastOrderMessage: `Failed to place order: ${errorMessage}`,
        isPlacing: false
      }));
    }
  }, [isDisabled, orderState, floorToDecimals, currentPrice, symbol, placeOrder, leverage, getCashBalance, getSymbolPosition, calculatedFuturesPositions]);

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
      {/* Header with Quick Trade Toggle */}
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
          {quickTradeMode ? 'Quick Trade' : 'Place Order'}
        </h3>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            onClick={() => setQuickTradeMode(!quickTradeMode)}
            style={{
              padding: '6px 12px',
              border: `1px solid ${quickTradeMode ? '#007bff' : '#dee2e6'}`,
              borderRadius: '4px',
              backgroundColor: quickTradeMode ? '#007bff' : 'white',
              color: quickTradeMode ? 'white' : '#6c757d',
              cursor: 'pointer',
              fontSize: '12px',
              fontWeight: quickTradeMode ? 'bold' : 'normal',
              transition: 'all 0.2s'
            }}
          >
            Quick Mode
          </button>
          {quickTradeMode && (
            <button
              onClick={() => setShowSettings(true)}
              style={{
                width: '32px',
                height: '32px',
                border: '1px solid #dee2e6',
                borderRadius: '4px',
                backgroundColor: 'white',
                cursor: 'pointer',
                fontSize: '16px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#6c757d'
              }}
              title="Configure Quick Trade Buttons"
            >
              ⚙️
            </button>
          )}
        </div>
      </div>

      {/* Quick Trade Mode - Show custom buttons */}
      {quickTradeMode ? (
        <div>
          {quickTradeButtons.length > 0 ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
              gap: '10px',
              marginBottom: '15px'
            }}>
              {quickTradeButtons.map((button) => (
                <button
                  key={button.id}
                  onClick={() => handleQuickTradeClick(button)}
                  disabled={isDisabled}
                  style={{
                    padding: '12px 8px',
                    border: 'none',
                    borderRadius: '6px',
                    backgroundColor: isDisabled ? '#6c757d' : button.color,
                    color: 'white',
                    fontSize: '13px',
                    fontWeight: 'bold',
                    cursor: isDisabled ? 'not-allowed' : 'pointer',
                    transition: 'opacity 0.2s',
                    opacity: isDisabled ? 0.6 : 1,
                    textAlign: 'center',
                    lineHeight: '1.3'
                  }}
                  onMouseEnter={(e) => {
                    if (!isDisabled) (e.target as HTMLButtonElement).style.opacity = '0.85';
                  }}
                  onMouseLeave={(e) => {
                    if (!isDisabled) (e.target as HTMLButtonElement).style.opacity = '1';
                  }}
                >
                  {button.label}
                </button>
              ))}
            </div>
          ) : (
            <div style={{
              padding: '40px 20px',
              textAlign: 'center',
              border: '2px dashed #dee2e6',
              borderRadius: '6px',
              marginBottom: '15px'
            }}>
              <div style={{ fontSize: '14px', color: '#6c757d', marginBottom: '10px' }}>
                No quick trade buttons configured
              </div>
              <button
                onClick={() => setShowSettings(true)}
                style={{
                  padding: '8px 16px',
                  border: '1px solid #007bff',
                  borderRadius: '4px',
                  backgroundColor: '#007bff',
                  color: 'white',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: 'bold'
                }}
              >
                Configure Buttons
              </button>
            </div>
          )}

          {/* Status Message */}
          {orderState.lastOrderMessage && (
            <div style={{
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
      ) : (
        /* Normal Order Form */
        <>
      {/* Order Side Toggle - Different layout for spot vs futures */}
      {tradingMode === 'spot' ? (
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
              backgroundColor: getSideButtonColor('buy', orderState.side === 'buy'),
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
              backgroundColor: getSideButtonColor('sell', orderState.side === 'sell'),
              color: orderState.side === 'sell' ? 'white' : '#6c757d',
              fontWeight: orderState.side === 'sell' ? 'bold' : 'normal',
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s'
            }}
          >
            SELL
          </button>
        </div>
      ) : (
        <div style={{ marginBottom: '15px' }}>
          {/* Futures Open Positions */}
          <div style={{
            display: 'flex',
            marginBottom: '8px',
            border: '1px solid #dee2e6',
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            <button
              onClick={() => handleSideChange('open_long')}
              disabled={isDisabled}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                backgroundColor: getSideButtonColor('open_long', orderState.side === 'open_long'),
                color: orderState.side === 'open_long' ? 'white' : '#6c757d',
                fontWeight: orderState.side === 'open_long' ? 'bold' : 'normal',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                transition: 'all 0.2s'
              }}
            >
              OPEN LONG
            </button>
            <button
              onClick={() => handleSideChange('open_short')}
              disabled={isDisabled}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                backgroundColor: getSideButtonColor('open_short', orderState.side === 'open_short'),
                color: orderState.side === 'open_short' ? 'white' : '#6c757d',
                fontWeight: orderState.side === 'open_short' ? 'bold' : 'normal',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                transition: 'all 0.2s'
              }}
            >
              OPEN SHORT
            </button>
          </div>

          {/* Futures Close Positions */}
          <div style={{
            display: 'flex',
            border: '1px solid #dee2e6',
            borderRadius: '6px',
            overflow: 'hidden'
          }}>
            <button
              onClick={() => handleSideChange('close_long')}
              disabled={isDisabled}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                backgroundColor: getSideButtonColor('close_long', orderState.side === 'close_long'),
                color: orderState.side === 'close_long' ? 'white' : '#6c757d',
                fontWeight: orderState.side === 'close_long' ? 'bold' : 'normal',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                transition: 'all 0.2s'
              }}
            >
              CLOSE LONG
            </button>
            <button
              onClick={() => handleSideChange('close_short')}
              disabled={isDisabled}
              style={{
                flex: 1,
                padding: '8px',
                border: 'none',
                backgroundColor: getSideButtonColor('close_short', orderState.side === 'close_short'),
                color: orderState.side === 'close_short' ? 'white' : '#6c757d',
                fontWeight: orderState.side === 'close_short' ? 'bold' : 'normal',
                cursor: isDisabled ? 'not-allowed' : 'pointer',
                fontSize: '13px',
                transition: 'all 0.2s'
              }}
            >
              CLOSE SHORT
            </button>
          </div>
        </div>
      )}

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
          {isFuturesOrder(orderState.side) ? (
            // Futures order summary
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Notional Value:</span>
                <span>{formatCurrency(estimatedTotal)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Leverage:</span>
                <span>{leverage}x</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Required Margin:</span>
                <span>{formatCurrency(estimatedTotal / leverage)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span>Fee (0.04%):</span>
                <span>{formatCurrency(estimatedTotal * 0.0004)}</span>
              </div>
              <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontWeight: 'bold',
                borderTop: '1px solid #dee2e6',
                paddingTop: '4px'
              }}>
                <span>Total Margin Used:</span>
                <span>{formatCurrency((estimatedTotal / leverage) + (estimatedTotal * 0.0004))}</span>
              </div>
            </>
          ) : (
            // Spot order summary
            <>
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
            </>
          )}
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
          backgroundColor: isDisabled ? '#6c757d' : getSideButtonColor(orderState.side, true),
          color: 'white',
          fontSize: '16px',
          fontWeight: 'bold',
          cursor: isDisabled ? 'not-allowed' : 'pointer',
          transition: 'background-color 0.2s'
        }}
      >
        {orderState.isPlacing ? 'Placing Order...' :
         isDisabled ? 'Start Simulation to Trade' :
         `${getSideDisplayName(orderState.side)} ${symbol}`}
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
      </>
      )}

      {/* Quick Trade Settings Modal */}
      <QuickTradeSettings
        isOpen={showSettings}
        onClose={() => setShowSettings(false)}
        onSave={saveQuickTradeButtons}
        initialButtons={quickTradeButtons}
        tradingMode={tradingMode}
      />
    </div>
  );
};

export default OrderPanel;