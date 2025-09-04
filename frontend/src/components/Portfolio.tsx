import React, { useState, useEffect, useCallback } from 'react';
import { ConnectionState } from '../hooks/useWebSocket';
import { formatCurrency, formatPercentage } from '../utils/numberFormat';

interface PortfolioProps {
  connectionState: ConnectionState;
  currentPrice: number;
  symbol: string;
  simulationState: 'stopped' | 'playing' | 'paused';
  initialFunding: number;
}

interface Position {
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

interface CalculatedPosition {
  position: Position;
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  totalReturn: number;
}

interface PortfolioSummary {
  positions: CalculatedPosition[];
  totalValue: number;
  totalPnL: number;
  cashBalance: number;
}

const Portfolio: React.FC<PortfolioProps> = ({ 
  connectionState, 
  currentPrice, 
  symbol,
  simulationState,
  initialFunding
}) => {
  const [portfolioData, setPortfolioData] = useState<PortfolioSummary | null>(null);
  const [rawPositions, setRawPositions] = useState<Position[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const calculatePortfolio = useCallback((positions: Position[], marketPrice: number, currentSymbol: string): PortfolioSummary => {
    const calculatedPositions: CalculatedPosition[] = [];
    let totalValue = 0;
    let cashBalance = 0;

    positions.forEach(position => {
      let positionPrice: number;
      
      if (position.symbol === 'USDT') {
        positionPrice = 1.0;
        cashBalance = position.quantity;
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
      totalValue += marketValue;
    });

    // Calculate total P&L based on initial funding
    const totalPnL = totalValue - initialFunding;

    return {
      positions: calculatedPositions,
      totalValue,
      totalPnL,
      cashBalance
    };
  }, [initialFunding]);


  const fetchPortfolio = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/positions/', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setRawPositions(data.positions);
      setPortfolioData(calculatePortfolio(data.positions, currentPrice, symbol));
      setLastRefresh(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load positions: ${errorMessage}`);
      console.error('Error fetching positions:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPrice, symbol, calculatePortfolio]);

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

      // Refresh portfolio data after reset
      await fetchPortfolio();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to reset portfolio: ${errorMessage}`);
      console.error('Error resetting portfolio:', err);
    } finally {
      setLoading(false);
    }
  }, [fetchPortfolio]);


  // Auto-refresh portfolio data
  useEffect(() => {
    if (connectionState === ConnectionState.CONNECTED) {
      fetchPortfolio();
      
      // Set up auto-refresh every 5 seconds during simulation
      const interval = simulationState === 'playing' 
        ? setInterval(fetchPortfolio, 5000)
        : null;

      return () => {
        if (interval) clearInterval(interval);
      };
    }
  }, [connectionState, simulationState, fetchPortfolio]);

  // Recalculate portfolio when current price changes
  useEffect(() => {
    if (rawPositions && currentPrice > 0) {
      setPortfolioData(calculatePortfolio(rawPositions, currentPrice, symbol));
    }
  }, [rawPositions, currentPrice, symbol, calculatePortfolio]);

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${formatPercentage(value).replace('%', '')}%`;
  };

  if (loading && !portfolioData) {
    return (
      <div style={{
        backgroundColor: 'white',
        border: '1px solid #dee2e6',
        borderRadius: '8px',
        padding: '20px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
        textAlign: 'center'
      }}>
        <div>Loading portfolio...</div>
      </div>
    );
  }

  return (
    <div style={{
      backgroundColor: 'white',
      border: '1px solid #dee2e6',
      borderRadius: '8px',
      padding: '20px',
      boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
    }}>
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
          Portfolio Summary
        </h3>
        <div>
          <button
            onClick={fetchPortfolio}
            disabled={loading}
            style={{
              padding: '6px 12px',
              border: '1px solid #dee2e6',
              borderRadius: '4px',
              backgroundColor: 'white',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '12px',
              marginRight: '8px'
            }}
          >
            {loading ? '⟳' : '↻'} Refresh
          </button>
          <button
            onClick={resetPortfolio}
            disabled={loading}
            style={{
              padding: '6px 12px',
              border: '1px solid #dc3545',
              borderRadius: '4px',
              backgroundColor: 'white',
              color: '#dc3545',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '12px'
            }}
          >
            Reset
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          marginBottom: '15px',
          padding: '10px',
          backgroundColor: '#f8d7da',
          color: '#721c24',
          border: '1px solid #f5c6cb',
          borderRadius: '6px',
          fontSize: '14px'
        }}>
          {error}
        </div>
      )}

      {portfolioData && (
        <>
          {/* Portfolio Summary */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '15px',
            marginBottom: '20px',
            padding: '15px',
            backgroundColor: '#f8f9fa',
            borderRadius: '6px'
          }}>
            <div>
              <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '4px' }}>
                Cash Balance
              </div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatCurrency(portfolioData.cashBalance)}
              </div>
            </div>
            
            <div>
              <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '4px' }}>
                Total Value
              </div>
              <div style={{ fontSize: '16px', fontWeight: 'bold' }}>
                {formatCurrency(portfolioData.totalValue)}
              </div>
            </div>
            
            <div>
              <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '4px' }}>
                Total P&L
              </div>
              <div style={{
                fontSize: '16px',
                fontWeight: 'bold',
                color: portfolioData.totalPnL >= 0 ? '#28a745' : '#dc3545'
              }}>
                {portfolioData.totalPnL >= 0 ? '+' : ''}{formatCurrency(portfolioData.totalPnL)}
              </div>
            </div>
            
            <div>
              <div style={{ fontSize: '12px', color: '#6c757d', marginBottom: '4px' }}>
                Total Return
              </div>
              <div style={{
                fontSize: '16px',
                fontWeight: 'bold',
                color: portfolioData.totalPnL >= 0 ? '#28a745' : '#dc3545'
              }}>
                {formatPercent((portfolioData.totalPnL / initialFunding) * 100)}
              </div>
            </div>
          </div>


          {lastRefresh && (
            <div style={{
              marginTop: '15px',
              fontSize: '11px',
              color: '#6c757d',
              textAlign: 'center'
            }}>
              Last updated: {lastRefresh.toLocaleTimeString()}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default Portfolio;