import React, { useMemo } from 'react';
import { usePositions, CalculatedPosition } from '../contexts/PositionsContext';
import { formatCurrency, formatPercentage } from '../utils/numberFormat';

interface PortfolioProps {
  initialFunding: number;
}


interface PortfolioSummary {
  positions: CalculatedPosition[];
  totalValue: number;
  totalPnL: number;
  cashBalance: number;
}

const Portfolio: React.FC<PortfolioProps> = ({ 
  initialFunding
}) => {
  const { calculatedPositions, loading, error, lastRefresh, fetchPositions, resetPortfolio } = usePositions();

  const portfolioData = useMemo((): PortfolioSummary => {
    let totalValue = 0;
    let cashBalance = 0;

    calculatedPositions.forEach(calcPos => {
      if (calcPos.position.symbol === 'USDT') {
        cashBalance = calcPos.position.quantity;
      }
      totalValue += calcPos.marketValue;
    });

    const totalPnL = totalValue - initialFunding;

    return {
      positions: calculatedPositions,
      totalValue,
      totalPnL,
      cashBalance
    };
  }, [calculatedPositions, initialFunding]);


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
            onClick={fetchPositions}
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