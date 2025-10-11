import React, { useState, useEffect } from 'react';
import { MarketApiService } from '../../services/marketApi';

interface StartTimePanelProps {
  onStartTimeSelected: (startTime: Date) => void;
  selectedStartTime: Date | null;
  symbol: string;
  disabled?: boolean;
  currentSimulationTime?: number | null;
}

const StartTimePanel: React.FC<StartTimePanelProps> = ({
  onStartTimeSelected,
  selectedStartTime,
  symbol,
  disabled = false,
  currentSimulationTime = null
}) => {
  const [datetime, setDatetime] = useState('');
  const [earliestTime, setEarliestTime] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Fetch earliest available time when symbol changes
  useEffect(() => {
    const fetchEarliestTime = async () => {
      setLoading(true);
      try {
        const response = await MarketApiService.getEarliestTime(symbol);
        setEarliestTime(new Date(response.earliestTime));
      } catch (err) {
        console.error('Failed to fetch earliest time:', err instanceof Error ? err.message : 'Unknown error');
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

  // Convert Date to datetime-local input format
  const formatDateTimeLocal = (date: Date): string => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}-${month}-${day}T${hours}:${minutes}`;
  };

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Title */}
      <div style={{
        fontSize: '12px',
        color: '#333',
        fontWeight: 'bold',
        marginBottom: '8px',
        height: '16px',
        display: 'flex',
        alignItems: 'center'
      }}>
        Start Time
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <div style={{ width: '100%' }}>
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
      </div>
    </div>
  );
};

export default StartTimePanel;