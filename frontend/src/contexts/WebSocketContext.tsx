import React, { createContext, useContext, useEffect, useState } from 'react';
import { useWebSocket, WebSocketMessage, PriceUpdateData, SimulationUpdateData, ConnectionState } from '../hooks/useWebSocket';

interface WebSocketContextType {
  connectionState: ConnectionState;
  lastMessage: WebSocketMessage | null;
  lastPriceUpdate: PriceUpdateData | null;
  lastSimulationUpdate: SimulationUpdateData | null;
  sendMessage: (message: any) => void;
  connect: () => void;
  disconnect: () => void;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [lastPriceUpdate, setLastPriceUpdate] = useState<PriceUpdateData | null>(null);
  const [lastSimulationUpdate, setLastSimulationUpdate] = useState<SimulationUpdateData | null>(null);
  
  // WebSocket URL - using localhost for development
  const wsUrl = 'ws://localhost:8080/ws';
  const { connectionState, lastMessage, sendMessage, connect, disconnect } = useWebSocket(wsUrl);

  // Handle incoming messages
  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'price_update':
          setLastPriceUpdate(lastMessage.data as PriceUpdateData);
          break;
        case 'simulation_update':
          setLastSimulationUpdate(lastMessage.data as SimulationUpdateData);
          break;
        case 'simulation_start':
        case 'simulation_pause':
        case 'simulation_resume':
        case 'simulation_stop':
        case 'simulation_speed_change':
          console.log(`Simulation ${lastMessage.type}:`, lastMessage.data);
          break;
        case 'connection_status':
          console.log('Connection status:', lastMessage.data);
          break;
        case 'error':
          console.error('WebSocket error:', lastMessage.data);
          break;
        default:
          console.log('Unknown message type:', lastMessage.type);
      }
    }
  }, [lastMessage]);

  const value: WebSocketContextType = {
    connectionState,
    lastMessage,
    lastPriceUpdate,
    lastSimulationUpdate,
    sendMessage,
    connect,
    disconnect
  };

  return (
    <WebSocketContext.Provider value={value}>
      {children}
    </WebSocketContext.Provider>
  );
};

export const useWebSocketContext = (): WebSocketContextType => {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocketContext must be used within a WebSocketProvider');
  }
  return context;
};