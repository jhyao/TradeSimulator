import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { ConnectionState } from '../hooks/useWebSocket';
import { useWebSocketContext } from './WebSocketContext';

export interface Position {
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

export interface CalculatedPosition {
  position: Position;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  totalReturn: number;
}

export interface FuturesPosition {
  id: number;
  user_id: number;
  symbol: string;
  base_currency: string;
  position_side: string; // 'long' or 'short'
  size: number;
  entry_price: number;
  margin_amount: number;
  created_at: string;
  updated_at: string;
}

export interface CalculatedFuturesPosition {
  position: FuturesPosition;
  currentPrice: number;
  unrealizedPnL: number;
  marginRatio: number;
  liquidationPrice: number;
  roe: number; // Return on Equity
}

export interface Order {
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

export interface Trade {
  id: number;
  order_id: number;
  user_id: number;
  symbol: string;
  side: string;
  quantity: number;
  price: number;
  fee: number;
  created_at: string;
  executed_at?: string;
}

interface PositionsContextType {
  positions: Position[];
  calculatedPositions: CalculatedPosition[];
  futuresPositions: FuturesPosition[];
  calculatedFuturesPositions: CalculatedFuturesPosition[];
  orders: Order[];
  pendingOrders: Order[];
  trades: Trade[];
  loading: boolean;
  ordersLoading: boolean;
  tradesLoading: boolean;
  error: string | null;
  ordersError: string | null;
  tradesError: string | null;
  lastRefresh: Date | null;
  fetchPositions: () => Promise<void>;
  fetchFuturesPositions: () => Promise<void>;
  fetchOrders: () => Promise<void>;
  fetchTrades: () => Promise<void>;
}

const PositionsContext = createContext<PositionsContextType | undefined>(undefined);

interface PositionsProviderProps {
  children: ReactNode;
  connectionState: ConnectionState;
  currentPrice: number;
  symbol: string;
  simulationState: 'stopped' | 'playing' | 'paused';
}

export const PositionsProvider: React.FC<PositionsProviderProps> = ({
  children,
  connectionState,
  currentPrice,
  symbol,
  simulationState
}) => {
  const [positions, setPositions] = useState<Position[]>([]);
  const [futuresPositions, setFuturesPositions] = useState<FuturesPosition[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [loading, setLoading] = useState(false);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [tradesLoading, setTradesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [tradesError, setTradesError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const { currentSimulationStatus, lastOrderNotification } = useWebSocketContext();

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

  const calculateFuturesPositions = useCallback((futuresPositions: FuturesPosition[], marketPrice: number): CalculatedFuturesPosition[] => {
    const calculatedFuturesPositions: CalculatedFuturesPosition[] = [];

    futuresPositions.forEach(position => {
      // Calculate PnL
      let unrealizedPnL: number;
      if (position.position_side === 'long') {
        unrealizedPnL = (marketPrice - position.entry_price) * position.size;
      } else {
        unrealizedPnL = (position.entry_price - marketPrice) * position.size;
      }

      // Calculate margin ratio
      const equity = position.margin_amount + unrealizedPnL;
      const notionalValue = position.size * marketPrice;
      const marginRatio = notionalValue !== 0 ? equity / notionalValue : 0;

      // Calculate liquidation price (simplified calculation)
      // For cross margin with 5% maintenance margin ratio
      const maintenanceMarginRatio = 0.05;
      const maintenanceMargin = position.margin_amount * maintenanceMarginRatio;
      const maxLoss = position.margin_amount - maintenanceMargin;

      let liquidationPrice: number;
      if (position.position_side === 'long') {
        liquidationPrice = position.entry_price - (maxLoss / position.size);
      } else {
        liquidationPrice = position.entry_price + (maxLoss / position.size);
      }

      // Calculate ROE (Return on Equity)
      const roe = position.margin_amount !== 0 ? (unrealizedPnL / position.margin_amount) * 100 : 0;

      const calculatedFuturesPosition: CalculatedFuturesPosition = {
        position,
        currentPrice: marketPrice,
        unrealizedPnL,
        marginRatio,
        liquidationPrice: Math.max(0, liquidationPrice), // Ensure non-negative
        roe
      };

      calculatedFuturesPositions.push(calculatedFuturesPosition);
    });

    return calculatedFuturesPositions;
  }, []);

  const fetchPositions = useCallback(async () => {
    // If no simulation status available yet, wait
    if (!currentSimulationStatus?.simulationID) {
      return;
    }
    
    // If simulation is running, use its ID
    let simulationId = currentSimulationStatus.simulationID;
    
    // If no running simulation but we have a simulation ID from history, use it
    if (!currentSimulationStatus.isRunning && !simulationId) {
      setPositions([]);
      setError('No simulation running. Start a simulation to see positions.');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/v1/positions?simulation_id=${simulationId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setPositions(data.positions);
      setLastRefresh(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load positions: ${errorMessage}`);
      console.error('Error fetching positions:', err);
    } finally {
      setLoading(false);
    }
  }, [currentSimulationStatus?.simulationID]);

  const fetchFuturesPositions = useCallback(async () => {
    // If no simulation status available yet, wait
    if (!currentSimulationStatus?.simulationID) {
      setFuturesPositions([]);
      return;
    }

    // If simulation is running, use its ID
    let simulationId = currentSimulationStatus.simulationID;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`http://localhost:8080/api/v1/futures/positions?simulation_id=${simulationId}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      setFuturesPositions(data.futures_positions || []);
      setLastRefresh(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to fetch futures positions: ${errorMessage}`);
      console.error('Error fetching futures positions:', err);
    } finally {
      setLoading(false);
    }
  }, [currentSimulationStatus?.simulationID]);

  const fetchOrders = useCallback(async () => {
    if (!currentSimulationStatus?.simulationID) {
      setOrders([]);
      setOrdersError('No simulation running. Start a simulation to see orders.');
      return;
    }

    let simulationId = currentSimulationStatus.simulationID;

    setOrdersLoading(true);
    setOrdersError(null);

    try {
      const response = await fetch(`/api/v1/orders?limit=100&simulation_id=${simulationId}`, {
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
      setOrdersError(`Failed to load orders: ${errorMessage}`);
      console.error('Error fetching orders:', err);
    } finally {
      setOrdersLoading(false);
    }
  }, [currentSimulationStatus?.simulationID]);

  const fetchTrades = useCallback(async () => {
    if (!currentSimulationStatus?.simulationID) {
      setTrades([]);
      setTradesError('No simulation running. Start a simulation to see trades.');
      return;
    }

    let simulationId = currentSimulationStatus.simulationID;

    setTradesLoading(true);
    setTradesError(null);

    try {
      const response = await fetch(`/api/v1/trades?limit=100&simulation_id=${simulationId}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setTrades(data.trades || []);
      setLastRefresh(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setTradesError(`Failed to load trades: ${errorMessage}`);
      console.error('Error fetching trades:', err);
    } finally {
      setTradesLoading(false);
    }
  }, [currentSimulationStatus?.simulationID]);

  // Initial fetch when simulation ID changes
  useEffect(() => {
      fetchPositions();
      fetchFuturesPositions();
      fetchOrders();
      fetchTrades();
  }, [currentSimulationStatus?.simulationID, fetchPositions, fetchFuturesPositions, fetchOrders, fetchTrades]);

  // Auto-refresh all data - SINGLE SOURCE OF TRUTH
  useEffect(() => {
    const interval = currentSimulationStatus?.state === 'playing'
      ? setInterval(() => {
          fetchPositions();
          fetchFuturesPositions();
          fetchOrders();
          fetchTrades();
        }, 10000)
      : null;

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentSimulationStatus, fetchPositions, fetchFuturesPositions, fetchOrders, fetchTrades]);

  // Refresh data when order events occur
  useEffect(() => {
    if (lastOrderNotification) {
      const { type } = lastOrderNotification;

      if (type === 'order_executed') {
        console.log('PositionsContext: Order executed, refreshing all data after delay');
        setTimeout(() => {
          console.log('PositionsContext: Executing refresh for order_executed');
          fetchPositions();
          fetchFuturesPositions();
          fetchOrders();
          fetchTrades();
        }, 500);
      } else if (type === 'order_placed' || type === 'order_cancelled') {
        console.log(`PositionsContext: ${type}, refreshing orders after delay`);
        setTimeout(() => {
          console.log(`PositionsContext: Executing orders refresh for ${type}`);
          fetchOrders();
        }, 500);
      }
    }
  }, [lastOrderNotification, fetchPositions, fetchFuturesPositions, fetchOrders, fetchTrades]);

  const calculatedPositions = calculatePositions(positions, currentPrice, symbol);
  const calculatedFuturesPositions = calculateFuturesPositions(futuresPositions, currentPrice);

  // Filter pending orders from all orders
  const pendingOrders = orders.filter(order => order.status === 'pending');

  const value: PositionsContextType = {
    positions,
    calculatedPositions,
    futuresPositions,
    calculatedFuturesPositions,
    orders,
    pendingOrders,
    trades,
    loading,
    ordersLoading,
    tradesLoading,
    error,
    ordersError,
    tradesError,
    lastRefresh,
    fetchPositions,
    fetchFuturesPositions,
    fetchOrders,
    fetchTrades,
  };

  return (
    <PositionsContext.Provider value={value}>
      {children}
    </PositionsContext.Provider>
  );
};

export const usePositions = (): PositionsContextType => {
  const context = useContext(PositionsContext);
  if (context === undefined) {
    throw new Error('usePositions must be used within a PositionsProvider');
  }
  return context;
};