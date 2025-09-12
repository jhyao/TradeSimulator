import React, { useState, useEffect } from 'react';
import { MarketApiService } from '../services/marketApi';

interface StartTimeSelectorProps {
  onStartTimeSelected: (startTime: Date) => void;
  selectedStartTime: Date | null;
  symbol?: string;
  compact?: boolean;
  disabled?: boolean;
  currentSimulationTime?: number | null; // Current simulation time in milliseconds
}

const StartTimeSelector: React.FC<StartTimeSelectorProps> = ({ 
  onStartTimeSelected, 
  selectedStartTime,
  symbol = 'BTCUSDT',
  compact = false,
  disabled = false,
  currentSimulationTime = null
}) => {
  const [datetime, setDatetime] = useState('');
  const [earliestTime, setEarliestTime] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Fetch earliest available time when symbol changes
  useEffect(() => {
    const fetchEarliestTime = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await MarketApiService.getEarliestTime(symbol);
        setEarliestTime(new Date(response.earliestTime));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch earliest time');
      } finally {
        setLoading(false);
      }
    };

    fetchEarliestTime();
  }, [symbol]);

  // Update datetime input when selectedStartTime changes (for loading from history)
  useEffect(() => {
    if (selectedStartTime) {
      const formattedDateTime = formatDateTimeLocal(selectedStartTime);
      setDatetime(formattedDateTime);
      setValidationError(null);
    }
  }, [selectedStartTime]);

  // Validate datetime input
  const validateDateTime = (selectedDateTime: Date, clearError = true): boolean => {
    if (clearError) {
      setValidationError(null);
    }
    
    if (!earliestTime) {
      setValidationError('Earliest time data is not available yet');
      return false;
    }

    if (selectedDateTime <= earliestTime) {
      setValidationError(
        `Selected time must be after earliest available data (${earliestTime.toLocaleString()})`
      );
      return false;
    }

    const now = new Date();
    if (selectedDateTime > now) {
      setValidationError('Selected time cannot be in the future');
      return false;
    }

    return true;
  };

  // Convert Date to datetime-local input format
  const formatDateTimeLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

  // Check if the load button should be enabled
  const isLoadButtonEnabled = (): boolean => {
    // Basic checks first
    if (!datetime || loading || !!error || !earliestTime || disabled) {
      return false;
    }

    // Parse the selected datetime
    const selectedDateTime = new Date(datetime);
    if (isNaN(selectedDateTime.getTime())) {
      return false;
    }

    // Check against earliest time
    if (selectedDateTime <= earliestTime) {
      return false;
    }

    // Check against future
    const now = new Date();
    if (selectedDateTime > now) {
      return false;
    }

    return true;
  };

  const handleLoadHistoricalData = () => {
    // Double-check that button should be enabled (shouldn't happen if button logic is correct)
    if (!isLoadButtonEnabled()) {
      console.warn('Load button clicked but conditions not met');
      return;
    }

    const selectedDateTime = new Date(datetime);
    onStartTimeSelected(selectedDateTime);
  };

  // Compact mode for the 4-block layout
  if (compact) {
    return (
      <div style={{ width: '100%' }}>
        <label style={{ fontSize: '12px', color: '#555', fontWeight: 'bold', display: 'block', marginBottom: '6px' }}>
          Start Time:
        </label>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <input
            type="datetime-local"
            value={datetime}
            onChange={(e) => {
              const newDatetime = e.target.value;
              setDatetime(newDatetime);
              setValidationError(null);
            }}
            min={earliestTime ? formatDateTimeLocal(earliestTime) : undefined}
            max={formatDateTimeLocal(new Date())}
            disabled={loading || disabled}
            style={{
              flex: 1,
              padding: '4px 6px',
              border: `1px solid ${validationError ? '#dc3545' : '#ccc'}`,
              borderRadius: '4px',
              fontSize: '12px'
            }}
          />
          <button
            onClick={() => {
              if (datetime) {
                const selectedDateTime = new Date(datetime);
                if (validateDateTime(selectedDateTime)) {
                  onStartTimeSelected(selectedDateTime);
                }
              }
            }}
            disabled={!datetime || loading || !!validationError || disabled}
            style={{
              padding: '4px 8px',
              fontSize: '11px',
              border: 'none',
              borderRadius: '3px',
              backgroundColor: !datetime || loading || !!validationError || disabled ? '#ccc' : '#007bff',
              color: 'white',
              cursor: !datetime || loading || !!validationError || disabled ? 'not-allowed' : 'pointer',
              fontWeight: '500'
            }}
          >
            OK
          </button>
        </div>
        {validationError && (
          <div style={{ fontSize: '10px', color: '#dc3545', marginTop: '2px' }}>
            {validationError}
          </div>
        )}
        {currentSimulationTime && (
          <div style={{ fontSize: '10px', color: '#007bff', marginTop: '2px', fontWeight: 'bold' }}>
            Simulation Time: {new Date(currentSimulationTime).toLocaleString()}
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{
      padding: '15px',
      backgroundColor: '#f8f9fa',
      border: '1px solid #dee2e6',
      borderRadius: '8px',
      marginBottom: '20px'
    }}>
      <h3 style={{ margin: '0 0 15px 0', fontSize: '16px', color: '#333' }}>
        Simulation Start Time ({symbol})
      </h3>
      
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        flexWrap: 'wrap'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
          <label htmlFor="start-datetime" style={{ fontSize: '14px', color: '#555' }}>
            Start Time:
          </label>
          <input
            id="start-datetime"
            type="datetime-local"
            value={datetime}
            onChange={(e) => {
              const newDatetime = e.target.value;
              setDatetime(newDatetime);
              
              // Clear validation error when user changes input
              setValidationError(null);
              
              // Real-time validation feedback only if we have earliest time data
              if (newDatetime && earliestTime) {
                const selectedDateTime = new Date(newDatetime);
                if (!isNaN(selectedDateTime.getTime())) {
                  validateDateTime(selectedDateTime, false); // Don't clear error again
                }
              }
            }}
            min={earliestTime ? formatDateTimeLocal(earliestTime) : undefined}
            max={formatDateTimeLocal(new Date())} // Can't select future dates
            disabled={loading || disabled}
            style={{
              padding: '6px 10px',
              border: `1px solid ${validationError ? '#dc3545' : '#ccc'}`,
              borderRadius: '4px',
              fontSize: '14px',
              backgroundColor: loading ? '#f8f9fa' : 'white'
            }}
          />
        </div>
        
        <button
          onClick={handleLoadHistoricalData}
          disabled={!isLoadButtonEnabled()}
          style={{
            padding: '8px 16px',
            backgroundColor: !isLoadButtonEnabled() ? '#ccc' : '#007bff',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '14px',
            cursor: !isLoadButtonEnabled() ? 'not-allowed' : 'pointer',
            fontWeight: '500'
          }}
        >
          {loading ? 'Loading earliest time...' : 'Load Historical Data'}
        </button>
      </div>

      {/* Error Display */}
      {error && (
        <div style={{
          marginTop: '10px',
          padding: '8px 12px',
          backgroundColor: '#f8d7da',
          borderRadius: '4px',
          fontSize: '14px',
          color: '#721c24',
          border: '1px solid #f5c6cb'
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Validation Error Display */}
      {validationError && (
        <div style={{
          marginTop: '10px',
          padding: '8px 12px',
          backgroundColor: '#fff3cd',
          borderRadius: '4px',
          fontSize: '14px',
          color: '#856404',
          border: '1px solid #ffeaa7'
        }}>
          <strong>Validation Error:</strong> {validationError}
        </div>
      )}

      {/* Loading Status */}
      {loading && (
        <div style={{
          marginTop: '10px',
          padding: '8px 12px',
          backgroundColor: '#f8f9fa',
          borderRadius: '4px',
          fontSize: '14px',
          color: '#6c757d',
          border: '1px solid #dee2e6'
        }}>
          Loading earliest available time for {symbol}...
        </div>
      )}

      {/* Earliest Time Info */}
      {earliestTime && !loading && (
        <div style={{
          marginTop: '10px',
          padding: '8px 12px',
          backgroundColor: '#d1ecf1',
          borderRadius: '4px',
          fontSize: '14px',
          color: '#0c5460',
          border: '1px solid #bee5eb'
        }}>
          <strong>Earliest Available Data:</strong> {earliestTime.toLocaleString()}
        </div>
      )}
    </div>
  );
};

export default StartTimeSelector;