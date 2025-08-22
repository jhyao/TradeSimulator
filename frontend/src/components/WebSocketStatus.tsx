import React from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';
import { ConnectionState } from '../hooks/useWebSocket';

const WebSocketStatus: React.FC = () => {
  const { connectionState, connect, disconnect } = useWebSocketContext();

  const getStatusColor = (state: ConnectionState): string => {
    switch (state) {
      case ConnectionState.CONNECTED:
        return '#4caf50';
      case ConnectionState.CONNECTING:
        return '#ff9800';
      case ConnectionState.DISCONNECTED:
        return '#f44336';
      case ConnectionState.ERROR:
        return '#d32f2f';
      default:
        return '#9e9e9e';
    }
  };

  const getStatusText = (state: ConnectionState): string => {
    switch (state) {
      case ConnectionState.CONNECTED:
        return 'Connected';
      case ConnectionState.CONNECTING:
        return 'Connecting...';
      case ConnectionState.DISCONNECTED:
        return 'Disconnected';
      case ConnectionState.ERROR:
        return 'Error';
      default:
        return 'Unknown';
    }
  };

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      padding: '8px 12px',
      backgroundColor: '#f5f5f5',
      borderRadius: '4px',
      fontSize: '14px'
    }}>
      <div
        style={{
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          backgroundColor: getStatusColor(connectionState),
        }}
      />
      <span>WebSocket: {getStatusText(connectionState)}</span>
      {connectionState === ConnectionState.DISCONNECTED && (
        <button
          onClick={connect}
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            backgroundColor: '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          Reconnect
        </button>
      )}
      {connectionState === ConnectionState.CONNECTED && (
        <button
          onClick={disconnect}
          style={{
            padding: '4px 8px',
            fontSize: '12px',
            backgroundColor: '#f44336',
            color: 'white',
            border: 'none',
            borderRadius: '3px',
            cursor: 'pointer'
          }}
        >
          Disconnect
        </button>
      )}
    </div>
  );
};

export default WebSocketStatus;