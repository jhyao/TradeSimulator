import React, { useState, useEffect } from 'react';
import { useWebSocketContext } from '../contexts/WebSocketContext';

const WebSocketTester: React.FC = () => {
  const { lastMessage, lastPriceUpdate, sendMessage } = useWebSocketContext();
  const [messageHistory, setMessageHistory] = useState<any[]>([]);

  useEffect(() => {
    if (lastMessage) {
      setMessageHistory(prev => [...prev.slice(-9), { 
        timestamp: new Date().toISOString(),
        message: lastMessage 
      }]);
    }
  }, [lastMessage]);

  const sendTestMessage = () => {
    sendMessage({
      type: 'test',
      data: {
        message: 'Hello from frontend!',
        timestamp: Date.now()
      }
    });
  };

  const triggerServerBroadcast = async () => {
    try {
      const response = await fetch('http://localhost:8080/test/broadcast', {
        method: 'POST'
      });
      const data = await response.json();
      console.log('Server broadcast triggered:', data);
    } catch (error) {
      console.error('Failed to trigger server broadcast:', error);
    }
  };

  return (
    <div style={{
      backgroundColor: '#f9f9f9',
      border: '1px solid #ddd',
      borderRadius: '8px',
      padding: '16px',
      margin: '20px 0',
      fontFamily: 'monospace',
      fontSize: '12px'
    }}>
      <h3 style={{ margin: '0 0 16px 0', fontFamily: 'sans-serif' }}>WebSocket Tester</h3>
      
      <div style={{ marginBottom: '16px' }}>
        <button
          onClick={sendTestMessage}
          style={{
            padding: '8px 16px',
            marginRight: '8px',
            backgroundColor: '#4caf50',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Send Test Message
        </button>
        
        <button
          onClick={triggerServerBroadcast}
          style={{
            padding: '8px 16px',
            backgroundColor: '#2196f3',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Trigger Server Broadcast
        </button>
      </div>

      {lastPriceUpdate && (
        <div style={{
          backgroundColor: '#e8f5e8',
          border: '1px solid #4caf50',
          borderRadius: '4px',
          padding: '8px',
          marginBottom: '12px'
        }}>
          <strong>Latest Price Update:</strong><br/>
          Symbol: {lastPriceUpdate.symbol}<br/>
          Price: ${lastPriceUpdate.price.toLocaleString()}<br/>
          Time: {new Date(lastPriceUpdate.timestamp).toLocaleTimeString()}
        </div>
      )}

      <div>
        <strong>Message History (last 10):</strong>
        <div style={{
          maxHeight: '200px',
          overflowY: 'auto',
          backgroundColor: 'white',
          border: '1px solid #ccc',
          borderRadius: '4px',
          padding: '8px',
          marginTop: '8px'
        }}>
          {messageHistory.length === 0 ? (
            <div style={{ color: '#666' }}>No messages received yet...</div>
          ) : (
            messageHistory.map((item, index) => (
              <div key={index} style={{ 
                borderBottom: index < messageHistory.length - 1 ? '1px solid #eee' : 'none',
                paddingBottom: '4px',
                marginBottom: '4px'
              }}>
                <div style={{ color: '#666', fontSize: '10px' }}>
                  {new Date(item.timestamp).toLocaleTimeString()}
                </div>
                <div>
                  <strong>Type:</strong> {item.message.type}<br/>
                  <strong>Data:</strong> {JSON.stringify(item.message.data, null, 2)}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default WebSocketTester;