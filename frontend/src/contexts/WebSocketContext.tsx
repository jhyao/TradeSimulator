import React, { createContext, useContext, useEffect, useState } from 'react';
import { useWebSocket, WebSocketMessage, PriceUpdateData, SimulationUpdateData, ConnectionState } from '../hooks/useWebSocket';

interface OrderNotification {
  type: 'order_placed' | 'order_executed' | 'order_failed';
  order: any;
  trade?: any;
  message: string;
  timestamp: number;
}

interface SimulationStatus {
  state: string;
  symbol: string;
  interval: string;
  speed: number;
  currentIndex: number;
  totalCandles: number;
  progress: number;
  startTime: string;
  currentTime: string;
  currentPrice: number;
  simulationID: number;
  isRunning: boolean;
  simulationTime: number;
}

interface WebSocketContextType {
  connectionState: ConnectionState;
  lastMessage: WebSocketMessage | null;
  lastPriceUpdate: PriceUpdateData | null;
  lastSimulationUpdate: SimulationUpdateData | null;
  lastOrderNotification: OrderNotification | null;
  currentSimulationStatus: SimulationStatus | null;
  sendMessage: (message: any) => void;
  connect: () => void;
  disconnect: () => void;
  // Simulation control methods
  startSimulation: (symbol: string, startTime: Date, interval: string, speed: number, initialFunding: number) => Promise<void>;
  stopSimulation: () => Promise<void>;
  pauseSimulation: () => Promise<void>;
  resumeSimulation: () => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  setTimeframe: (timeframe: string) => Promise<void>;
  getStatus: () => Promise<any>;
  // Order methods
  placeOrder: (symbol: string, side: 'buy' | 'sell', quantity: number) => Promise<void>;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [lastPriceUpdate, setLastPriceUpdate] = useState<PriceUpdateData | null>(null);
  const [lastSimulationUpdate, setLastSimulationUpdate] = useState<SimulationUpdateData | null>(null);
  const [lastOrderNotification, setLastOrderNotification] = useState<OrderNotification | null>(null);
  const [currentSimulationStatus, setCurrentSimulationStatus] = useState<SimulationStatus | null>(null);
  
  // Removed unused request tracking variables for now
  
  // WebSocket URL - using relative path for proxy
  // const host = window.location.hostname;
  const host = "localhost:8080"
  const wsUrl = `ws://${host}/websocket/v1/simulation`;
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
        case 'status_update':
          console.log('Received status update:', lastMessage.data);
          setCurrentSimulationStatus(lastMessage.data);
          break;
        case 'simulation_start':
        case 'simulation_pause':
        case 'simulation_resume':
        case 'simulation_stop':
        case 'simulation_speed_change':
          console.log(`Simulation ${lastMessage.type}:`, lastMessage.data);
          break;
        case 'simulation_control_response':
        case 'simulation_control_error':
          handleControlResponse(lastMessage);
          break;
        case 'order_placed':
          setLastOrderNotification({
            type: 'order_placed',
            order: lastMessage.data.order,
            trade: lastMessage.data.trade,
            message: 'Order placed successfully',
            timestamp: Date.now()
          });
          break;
        case 'order_executed':
          setLastOrderNotification({
            type: 'order_executed',
            order: lastMessage.data.order,
            trade: lastMessage.data.trade,
            message: 'Order executed',
            timestamp: Date.now()
          });
          break;
        case 'order_control_response':
          handleOrderControlResponse(lastMessage);
          break;
        case 'order_control_error':
          setLastOrderNotification({
            type: 'order_failed',
            order: null,
            message: lastMessage.data.error || 'Order failed',
            timestamp: Date.now()
          });
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

  // Handle control responses
  const handleControlResponse = (message: WebSocketMessage) => {
    const response = message.data;
    
    if (response.success) {
      console.log('Control operation successful:', response.message);
      // For status requests, resolve with the data
      if (response.data) {
        console.log('Status data:', response.data);
        // Update simulation status if this is a status response (check for status-specific fields)
        if (response.data.state !== undefined || response.data.isRunning !== undefined) {
          console.log('Setting simulation status:', response.data);
          setCurrentSimulationStatus(response.data);
        }
      }
    } else {
      console.error('Control operation failed:', response.error || response.message);
      // For now, we'll handle responses without request tracking
      // since the backend doesn't currently include requestId in responses
    }
  };

  // Handle order control responses
  const handleOrderControlResponse = (message: WebSocketMessage) => {
    const response = message.data;
    
    if (response.success) {
      console.log('Order operation successful:', response.message);
      setLastOrderNotification({
        type: 'order_placed',
        order: response.data?.order,
        trade: response.data?.trade,
        message: response.message || 'Order placed successfully',
        timestamp: Date.now()
      });
    } else {
      console.error('Order operation failed:', response.error || response.message);
      setLastOrderNotification({
        type: 'order_failed',
        order: null,
        message: response.error || response.message || 'Order failed',
        timestamp: Date.now()
      });
    }
  };

  // Removed unused generateRequestId function

  // Send control message with simple promise-based response - memoized
  const sendControlMessage = React.useCallback((type: string, data?: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      if (connectionState !== ConnectionState.CONNECTED) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      const message = {
        type,
        data: data || {}
      };

      try {
        sendMessage(message);
        
        // For now, just resolve immediately since we don't have proper request tracking
        // The actual response handling will be done through the message listeners
        setTimeout(() => {
          resolve({ success: true, message: 'Command sent' });
        }, 100);
        
      } catch (error) {
        reject(error);
      }
    });
  }, [connectionState, sendMessage]);

  // Simulation control methods - memoized to prevent useEffect loops
  const startSimulation = React.useCallback(async (symbol: string, startTime: Date, interval: string, speed: number, initialFunding: number) => {
    return sendControlMessage('simulation_control_start', {
      symbol,
      startTime: startTime.getTime(),
      interval,
      speed,
      initialFunding
    });
  }, [sendControlMessage]);

  const stopSimulation = React.useCallback(async () => {
    return sendControlMessage('simulation_control_stop');
  }, [sendControlMessage]);

  const pauseSimulation = React.useCallback(async () => {
    return sendControlMessage('simulation_control_pause');
  }, [sendControlMessage]);

  const resumeSimulation = React.useCallback(async () => {
    return sendControlMessage('simulation_control_resume');
  }, [sendControlMessage]);

  const setSpeed = React.useCallback(async (speed: number) => {
    return sendControlMessage('simulation_control_set_speed', { speed });
  }, [sendControlMessage]);

  const setTimeframe = React.useCallback(async (timeframe: string) => {
    return sendControlMessage('simulation_control_set_timeframe', { timeframe });
  }, [sendControlMessage]);

  const getStatus = React.useCallback(async () => {
    // For status, we need to handle it differently since we need the response data
    return new Promise((resolve, reject) => {
      if (connectionState !== ConnectionState.CONNECTED) {
        reject(new Error('WebSocket not connected'));
        return;
      }

      // Send the status request
      sendMessage({
        type: 'simulation_control_get_status',
        data: {}
      });

      // Set up a temporary listener for status response
      const cleanup = () => {
        // We'll resolve with a default status for now
        resolve({
          state: 'stopped',
          symbol: '',
          interval: '',
          speed: 60,
          currentIndex: 0,
          totalCandles: 0,
          progress: 0,
          startTime: '0',
          currentTime: '0',
          currentPrice: 0
        });
      };

      // For now, just return a timeout-based response
      setTimeout(cleanup, 500);
    });
  }, [connectionState, sendMessage]);

  // Order methods
  const placeOrder = React.useCallback(async (symbol: string, side: 'buy' | 'sell', quantity: number) => {
    return sendControlMessage('order_place', {
      symbol,
      side,
      quantity
    });
  }, [sendControlMessage]);

  // Request status when WebSocket connects
  useEffect(() => {
    if (connectionState === ConnectionState.CONNECTED) {
      console.log('WebSocket connected, requesting simulation status...');
      // Request current simulation status after a short delay to ensure connection is stable
      const timeoutId = setTimeout(() => {
        getStatus().catch((error) => {
          console.error('Failed to get simulation status:', error);
        });
      }, 1000); // Increased delay to 1 second
      
      return () => clearTimeout(timeoutId);
    }
  }, [connectionState, getStatus]);

  const value: WebSocketContextType = {
    connectionState,
    lastMessage,
    lastPriceUpdate,
    lastSimulationUpdate,
    lastOrderNotification,
    currentSimulationStatus,
    sendMessage,
    connect,
    disconnect,
    startSimulation,
    stopSimulation,
    pauseSimulation,
    resumeSimulation,
    setSpeed,
    setTimeframe,
    getStatus,
    placeOrder
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