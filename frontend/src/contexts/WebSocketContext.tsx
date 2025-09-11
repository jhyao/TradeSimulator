import React, { createContext, useContext, useEffect, useState } from 'react';
import { useWebSocket, WebSocketMessage, SimulationUpdateData, ConnectionState } from '../hooks/useWebSocket';
import { MessageData } from '../components/FloatingMessage';

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
  progress: number;
  startTime: string;
  currentPriceTime: number;
  currentPrice: number;
  simulationID: number;
  isRunning: boolean;
  simulationTime: number;
}

interface WebSocketContextType {
  connectionState: ConnectionState;
  lastMessage: WebSocketMessage | null;
  lastSimulationUpdate: SimulationUpdateData | null;
  lastOrderNotification: OrderNotification | null;
  currentSimulationStatus: SimulationStatus | null;
  floatingMessages: MessageData[];
  addFloatingMessage: (message: string, type: 'status' | 'error') => void;
  removeFloatingMessage: (id: string) => void;
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
  resetSimulationStatus: () => void;
  // Order methods
  placeOrder: (symbol: string, side: 'buy' | 'sell', quantity: number) => Promise<void>;
}

const WebSocketContext = createContext<WebSocketContextType | null>(null);

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export const WebSocketProvider: React.FC<WebSocketProviderProps> = ({ children }) => {
  const [lastSimulationUpdate, setLastSimulationUpdate] = useState<SimulationUpdateData | null>(null);
  const [lastOrderNotification, setLastOrderNotification] = useState<OrderNotification | null>(null);
  const [currentSimulationStatus, setCurrentSimulationStatus] = useState<SimulationStatus | null>(null);
  const [floatingMessages, setFloatingMessages] = useState<MessageData[]>([]);
  
  // Removed unused request tracking variables for now
  
  // WebSocket URL - using relative path for proxy
  // const host = window.location.hostname;
  const host = "localhost:8080"
  const wsUrl = `ws://${host}/websocket/v1/simulation`;
  const { connectionState, lastMessage, sendMessage, connect, disconnect } = useWebSocket(wsUrl);
  
  // Ref to track current connection state for closures
  const connectionStateRef = React.useRef<ConnectionState>(connectionState);
  React.useEffect(() => {
    connectionStateRef.current = connectionState;
  }, [connectionState]);

  // Floating message management
  const addFloatingMessage = React.useCallback((message: string, type: 'status' | 'error') => {
    const newMessage: MessageData = {
      id: `${Date.now()}-${Math.random()}`,
      message,
      type,
      timestamp: Date.now()
    };
    
    setFloatingMessages(prev => [...prev, newMessage]);
  }, []);

  const removeFloatingMessage = React.useCallback((id: string) => {
    setFloatingMessages(prev => prev.filter(msg => msg.id !== id));
  }, []);

  // Handle incoming messages
  useEffect(() => {
    if (lastMessage) {
      switch (lastMessage.type) {
        case 'simulation_update':
          setLastSimulationUpdate(lastMessage.data as SimulationUpdateData);
          break;
        case 'status_update':
          console.log('Received status update:', lastMessage.data);
          setCurrentSimulationStatus(lastMessage.data);
          // Show floating message if there's a message field
          if (lastMessage.data.message && lastMessage.data.message.trim()) {
            addFloatingMessage(lastMessage.data.message, 'status');
          }
          // If simulation stopped (from backend completion or other reasons), disconnect websocket
          if (lastMessage.data.state === 'stopped') {
            console.log('Simulation stopped, disconnecting websocket...');
            setTimeout(() => disconnect(), 500); // Small delay to allow status update to propagate
          }
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
          // Show floating message for order placed
          const orderPlacedMsg = "Order placed";
          addFloatingMessage(orderPlacedMsg, 'status');
          break;
        case 'order_executed':
          setLastOrderNotification({
            type: 'order_executed',
            order: lastMessage.data.order,
            trade: lastMessage.data.trade,
            message: 'Order executed',
            timestamp: Date.now()
          });
          // Show floating message for order executed
          const orderExecutedMsg = "Order executed";
          addFloatingMessage(orderExecutedMsg, 'status');
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
          // Show floating error message
            const errorMessage = [lastMessage.data.message, lastMessage.data.error]
            .filter(Boolean)
            .join(' - ') || 'An error occurred';
          addFloatingMessage(errorMessage, 'error');
          break;
        default:
          console.log('Unknown message type:', lastMessage.type);
      }
    }
  }, [lastMessage, addFloatingMessage, disconnect]);

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
      if ((connectionStateRef.current as ConnectionState) !== ConnectionState.CONNECTED) {
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
  }, [sendMessage]);

  // Simulation control methods - memoized to prevent useEffect loops
  const startSimulation = React.useCallback(async (symbol: string, startTime: Date, interval: string, speed: number, initialFunding: number) => {
    // First establish websocket connection
    if ((connectionStateRef.current as ConnectionState) !== ConnectionState.CONNECTED) {
      console.log('Connecting to websocket before starting simulation...');
      connect();
      
      // Wait for connection to be established
      let attempts = 0;
      const maxAttempts = 50; // 5 seconds with 100ms intervals
      
      while (attempts < maxAttempts && (connectionStateRef.current as ConnectionState) !== ConnectionState.CONNECTED) {
        await new Promise(resolve => setTimeout(resolve, 100));
        attempts++;
      }
      
      if ((connectionStateRef.current as ConnectionState) !== ConnectionState.CONNECTED) {
        throw new Error('Failed to establish websocket connection within timeout');
      }
    }

    // Now send the start command
    return sendControlMessage('simulation_control_start', {
      symbol,
      startTime: startTime.getTime(),
      interval,
      speed,
      initialFunding
    });
  }, [sendControlMessage, connect]);

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
    // Only send if connection is established
    if ((connectionStateRef.current as ConnectionState) !== ConnectionState.CONNECTED) {
      console.warn('Cannot change speed: WebSocket not connected');
      return;
    }
    return sendControlMessage('simulation_control_set_speed', { speed });
  }, [sendControlMessage]);

  const setTimeframe = React.useCallback(async (timeframe: string) => {
    // Only send if connection is established
    if ((connectionStateRef.current as ConnectionState) !== ConnectionState.CONNECTED) {
      console.warn('Cannot change timeframe: WebSocket not connected');
      return;
    }
    return sendControlMessage('simulation_control_set_timeframe', { timeframe });
  }, [sendControlMessage]);

  const getStatus = React.useCallback(async () => {
    // For status, we need to handle it differently since we need the response data
    return new Promise((resolve, reject) => {
      if ((connectionStateRef.current as ConnectionState) !== ConnectionState.CONNECTED) {
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
          progress: 0,
          startTime: '0',
          currentPriceTime: 0,
          currentPrice: 0
        });
      };

      // For now, just return a timeout-based response
      setTimeout(cleanup, 500);
    });
  }, [sendMessage]);

  // Reset simulation status method
  const resetSimulationStatus = React.useCallback(() => {
    setCurrentSimulationStatus(null);
    setLastSimulationUpdate(null);
    setLastOrderNotification(null);
  }, []);

  // Order methods
  const placeOrder = React.useCallback(async (symbol: string, side: 'buy' | 'sell', quantity: number) => {
    return sendControlMessage('order_place', {
      symbol,
      side,
      quantity
    });
  }, [sendControlMessage]);

  const value: WebSocketContextType = {
    connectionState,
    lastMessage,
    lastSimulationUpdate,
    lastOrderNotification,
    currentSimulationStatus,
    floatingMessages,
    addFloatingMessage,
    removeFloatingMessage,
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
    resetSimulationStatus,
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