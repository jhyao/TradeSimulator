import React, { useState, useEffect, useCallback } from 'react';
import { ConnectionState } from '../hooks/useWebSocket';

interface PortfolioProps {
  connectionState: ConnectionState;
  currentPrice: number;
  symbol: string;
  simulationState: 'stopped' | 'playing' | 'paused';
}

interface Position {
  position: {
    id: number;
    user_id: number;
    symbol: string;
    quantity: number;
    average_price: number;
    total_cost: number;
    updated_at: string;
    created_at: string;
  };
  currentPrice: number;
  marketValue: number;
  unrealizedPnL: number;
  totalReturn: number;
}

interface PortfolioData {
  id: number;
  user_id: number;
  cash_balance: number;
  total_value: number;
  updated_at: string;
  created_at: string;
}

interface PortfolioSummary {
  portfolio: PortfolioData;
  positions: Position[];
  totalValue: number;
  totalPnL: number;
}

const Portfolio: React.FC<PortfolioProps> = ({ 
  connectionState, 
  currentPrice, 
  symbol,
  simulationState 
}) => {
  const [portfolioData, setPortfolioData] = useState<PortfolioSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchPortfolio = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:8080/api/v1/portfolio/', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setPortfolioData(data.portfolio);
      setLastRefresh(new Date());
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load portfolio: ${errorMessage}`);
      console.error('Error fetching portfolio:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const resetPortfolio = useCallback(async () => {
    if (!window.confirm('Are you sure you want to reset your portfolio? This will clear all positions and reset your balance to $10,000.')) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('http://localhost:8080/api/v1/portfolio/reset', {
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

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  };

  const formatPercent = (value: number) => {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
  };

  const formatQuantity = (value: number) => {
    return value.toFixed(8).replace(/\.?0+$/, '');
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
          Portfolio
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
                {formatCurrency(portfolioData.portfolio.cash_balance)}
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
                {formatPercent((portfolioData.totalPnL / 10000) * 100)}
              </div>
            </div>
          </div>

          {/* Positions */}
          <div>
            <h4 style={{ fontSize: '14px', margin: '0 0 10px 0', color: '#495057' }}>
              Positions
            </h4>
            
            {!portfolioData.positions || portfolioData.positions.length === 0 ? (
              <div style={{
                textAlign: 'center',
                padding: '20px',
                color: '#6c757d',
                fontSize: '14px',
                fontStyle: 'italic'
              }}>
                No positions
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {portfolioData.positions.map((pos, index) => (
                  <div
                    key={index}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto auto',
                      gap: '10px',
                      alignItems: 'center',
                      padding: '10px',
                      border: '1px solid #dee2e6',
                      borderRadius: '6px',
                      fontSize: '13px'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 'bold' }}>{pos.position.symbol}</div>
                      <div style={{ color: '#6c757d' }}>
                        {formatQuantity(pos.position.quantity)} @ {formatCurrency(pos.position.average_price)}
                      </div>
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color: '#6c757d' }}>Market Value</div>
                      <div>{formatCurrency(pos.marketValue)}</div>
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color: '#6c757d' }}>P&L</div>
                      <div style={{ color: pos.unrealizedPnL >= 0 ? '#28a745' : '#dc3545' }}>
                        {pos.unrealizedPnL >= 0 ? '+' : ''}{formatCurrency(pos.unrealizedPnL)}
                      </div>
                    </div>
                    
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: '12px', color: '#6c757d' }}>Return</div>
                      <div style={{ 
                        color: pos.totalReturn >= 0 ? '#28a745' : '#dc3545',
                        fontWeight: 'bold'
                      }}>
                        {formatPercent(pos.totalReturn)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
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