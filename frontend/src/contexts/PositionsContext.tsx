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

interface PositionsContextType {
  positions: Position[];
  calculatedPositions: CalculatedPosition[];
  futuresPositions: FuturesPosition[];
  calculatedFuturesPositions: CalculatedFuturesPosition[];
  loading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  fetchPositions: () => Promise<void>;
  fetchFuturesPositions: () => Promise<void>;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    if (!currentSimulationStatus) {
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
  }, [currentSimulationStatus]);

  const fetchFuturesPositions = useCallback(async () => {
    // If no simulation status available yet, wait
    if (!currentSimulationStatus) {
      return;
    }

    // If simulation is running, use its ID
    let simulationId = currentSimulationStatus.simulationID;

    // If no running simulation but we have a simulation ID from history, use it
    if (!currentSimulationStatus.isRunning && !simulationId) {
      setFuturesPositions([]);
      return;
    }

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
  }, [currentSimulationStatus]);

  // Auto-refresh positions data - SINGLE SOURCE OF TRUTH
  useEffect(() => {
    if (currentSimulationStatus?.state === 'playing') {
      fetchPositions();
      fetchFuturesPositions();
    }

    const interval = currentSimulationStatus?.state === 'playing'
      ? setInterval(() => {
          fetchPositions();
          fetchFuturesPositions();
        }, 30000)
      : null;

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [currentSimulationStatus, fetchPositions, fetchFuturesPositions]);

  // Refresh positions when order is executed
  useEffect(() => {
    if (lastOrderNotification?.type === 'order_executed') {
      console.log('PositionsContext: Order executed, refreshing positions after delay');
      // Add small delay to ensure backend has processed the order execution
      setTimeout(() => {
        console.log('PositionsContext: Executing position refresh for order_executed');
        fetchPositions();
        fetchFuturesPositions();
      }, 800); // Slightly longer delay than pending orders to ensure proper sequencing
    }
  }, [lastOrderNotification, fetchPositions, fetchFuturesPositions]);

  const calculatedPositions = calculatePositions(positions, currentPrice, symbol);
  const calculatedFuturesPositions = calculateFuturesPositions(futuresPositions, currentPrice);

  const value: PositionsContextType = {
    positions,
    calculatedPositions,
    futuresPositions,
    calculatedFuturesPositions,
    loading,
    error,
    lastRefresh,
    fetchPositions,
    fetchFuturesPositions,
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