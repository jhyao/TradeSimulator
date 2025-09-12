import React, { useState, useEffect, useCallback } from 'react';
import { formatCurrency } from '../utils/numberFormat';

interface Simulation {
  id: number;
  symbol: string;
  start_sim_time: number;
  end_sim_time: number;
  initial_funding: number;
  total_value: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

interface SimulationHistoryProps {
  onLoadSimulation?: (simulation: Simulation) => void;
  onRefreshReady?: (refreshFn: () => void) => void;
}

const SimulationHistory: React.FC<SimulationHistoryProps> = ({ onLoadSimulation, onRefreshReady }) => {
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastFetchTime = React.useRef<number>(0);

  const fetchSimulations = useCallback(async () => {
    // Prevent duplicate calls within 1 second
    const now = Date.now();
    if (now - lastFetchTime.current < 1000) {
      return;
    }
    lastFetchTime.current = now;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/v1/simulations?limit=50&order_by=end_time&order_desc=true', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      setSimulations(data.simulations || []);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(`Failed to load simulation history: ${errorMessage}`);
      console.error('Error fetching simulations:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSimulations();
  }, [fetchSimulations]);

  // Expose refresh function to parent
  useEffect(() => {
    if (onRefreshReady) {
      onRefreshReady(fetchSimulations);
    }
  }, [onRefreshReady, fetchSimulations]);

  const handleLoadSimulation = (simulation: Simulation) => {
    if (onLoadSimulation) {
      onLoadSimulation(simulation);
    }
  };

  const formatDateTime = (timestamp: number) => {
    return new Date(timestamp).toLocaleString();
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return '#28a745';
      case 'stopped':
        return '#6c757d';
      case 'running':
        return '#007bff';
      case 'paused':
        return '#ffc107';
      default:
        return '#6c757d';
    }
  };

  const getPnLColor = (pnl: number | null) => {
    if (pnl === null) return '#6c757d';
    return pnl >= 0 ? '#28a745' : '#dc3545';
  };

  if (loading && simulations.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <div style={{ color: '#6c757d' }}>Loading simulation history...</div>
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
          onClick={fetchSimulations}
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

  if (simulations.length === 0) {
    return (
      <div style={{ 
        padding: '40px', 
        textAlign: 'center',
        color: '#6c757d'
      }}>
        <div style={{ fontSize: '16px', marginBottom: '10px' }}>No simulation history found</div>
        <div style={{ fontSize: '14px' }}>Start a simulation to see your trading history here</div>
      </div>
    );
  }

  return (
    <div style={{ padding: '0' }}>
      <div style={{ 
        overflowX: 'auto',
        maxHeight: '400px',
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
              }}>Symbol</th>
              <th style={{ 
                padding: '10px 8px', 
                textAlign: 'left', 
                fontWeight: 'bold',
                position: 'sticky',
                top: 0,
                backgroundColor: '#f8f9fa',
                zIndex: 1
              }}>Start Time</th>
              <th style={{ 
                padding: '10px 8px', 
                textAlign: 'left', 
                fontWeight: 'bold',
                position: 'sticky',
                top: 0,
                backgroundColor: '#f8f9fa',
                zIndex: 1
              }}>End Time</th>
              <th style={{ 
                padding: '10px 8px', 
                textAlign: 'right', 
                fontWeight: 'bold',
                position: 'sticky',
                top: 0,
                backgroundColor: '#f8f9fa',
                zIndex: 1
              }}>Initial</th>
              <th style={{ 
                padding: '10px 8px', 
                textAlign: 'right', 
                fontWeight: 'bold',
                position: 'sticky',
                top: 0,
                backgroundColor: '#f8f9fa',
                zIndex: 1
              }}>Final</th>
              <th style={{ 
                padding: '10px 8px', 
                textAlign: 'right', 
                fontWeight: 'bold',
                position: 'sticky',
                top: 0,
                backgroundColor: '#f8f9fa',
                zIndex: 1
              }}>P&L</th>
              <th style={{ 
                padding: '10px 8px', 
                textAlign: 'center', 
                fontWeight: 'bold',
                position: 'sticky',
                top: 0,
                backgroundColor: '#f8f9fa',
                zIndex: 1
              }}>Status</th>
              <th style={{ 
                padding: '10px 8px', 
                textAlign: 'center', 
                fontWeight: 'bold',
                position: 'sticky',
                top: 0,
                backgroundColor: '#f8f9fa',
                zIndex: 1
              }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {simulations.map((simulation, index) => {
              const pnl = simulation.total_value ? simulation.total_value - simulation.initial_funding : null;
              const pnlPercentage = pnl && simulation.initial_funding > 0 ? (pnl / simulation.initial_funding) * 100 : null;

              return (
                <tr 
                  key={simulation.id}
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
                    <div style={{ fontWeight: 'bold', color: '#333' }}>{simulation.symbol}</div>
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ color: '#666' }}>
                      {formatDateTime(simulation.start_sim_time)}
                    </div>
                  </td>
                  <td style={{ padding: '10px 8px' }}>
                    <div style={{ color: '#666' }}>
                      {simulation.end_sim_time ? formatDateTime(simulation.end_sim_time) : '-'}
                    </div>
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                    <div style={{ color: '#333' }}>
                      {formatCurrency(simulation.initial_funding)}
                    </div>
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                    <div style={{ color: '#333' }}>
                      {simulation.total_value ? formatCurrency(simulation.total_value) : '-'}
                    </div>
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                    {pnl !== null ? (
                      <div>
                        <div style={{ 
                          color: getPnLColor(pnl),
                          fontWeight: 'bold'
                        }}>
                          {pnl >= 0 ? '+' : ''}{formatCurrency(pnl)}
                        </div>
                        {pnlPercentage !== null && (
                          <div style={{ 
                            color: getPnLColor(pnl),
                            fontSize: '11px'
                          }}>
                            ({pnlPercentage >= 0 ? '+' : ''}{pnlPercentage.toFixed(2)}%)
                          </div>
                        )}
                      </div>
                    ) : (
                      <div style={{ color: '#6c757d' }}>-</div>
                    )}
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                    <span style={{
                      padding: '4px 8px',
                      borderRadius: '12px',
                      fontSize: '11px',
                      fontWeight: 'bold',
                      backgroundColor: `${getStatusColor(simulation.status)}20`,
                      color: getStatusColor(simulation.status),
                      textTransform: 'capitalize'
                    }}>
                      {simulation.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                    <button
                      onClick={() => handleLoadSimulation(simulation)}
                      style={{
                        padding: '6px 12px',
                        fontSize: '12px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontWeight: '500'
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.backgroundColor = '#0056b3';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.backgroundColor = '#007bff';
                      }}
                    >
                      Open
                    </button>
                  </td>
                </tr>
              );
            })}
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
        <span>Total simulations: {simulations.length}</span>
        <button
          onClick={fetchSimulations}
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

export default SimulationHistory;