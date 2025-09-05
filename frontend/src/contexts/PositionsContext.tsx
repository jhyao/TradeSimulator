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

interface PositionsContextType {
  positions: Position[];
  calculatedPositions: CalculatedPosition[];
  loading: boolean;
  error: string | null;
  lastRefresh: Date | null;
  fetchPositions: () => Promise<void>;
  resetPortfolio: () => Promise<void>;
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const { currentSimulationStatus } = useWebSocketContext();

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
      const response = await fetch(`/api/v1/positions/?simulation_id=${simulationId}`, {
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

  const resetPortfolio = useCallback(async () => {
    if (!window.confirm('Are you sure you want to reset your portfolio? This will clear all positions and reset your balance to $10,000.')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/positions/reset', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      await fetchPositions();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to reset portfolio: ${errorMessage}`);
      console.error('Error resetting portfolio:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchPositions]);

  // Auto-refresh positions data - SINGLE SOURCE OF TRUTH
  useEffect(() => {
    if (connectionState === ConnectionState.CONNECTED) {
      fetchPositions();
      
      const interval = simulationState === 'playing' 
        ? setInterval(fetchPositions, 5000)
        : null;

      return () => {
        if (interval) clearInterval(interval);
      };
    }
  }, [connectionState, simulationState, currentSimulationStatus, fetchPositions]);

  const calculatedPositions = calculatePositions(positions, currentPrice, symbol);

  const value: PositionsContextType = {
    positions,
    calculatedPositions,
    loading,
    error,
    lastRefresh,
    fetchPositions,
    resetPortfolio
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