import React, { useState, useEffect } from 'react';

export interface MessageData {
  id: string;
  message: string;
  type: 'status' | 'error';
  timestamp: number;
}

interface FloatingMessageProps {
  messages: MessageData[];
  onMessageExpire: (id: string) => void;
}

const FloatingMessage: React.FC<FloatingMessageProps> = ({ messages, onMessageExpire }) => {
  const [visibleMessages, setVisibleMessages] = useState<MessageData[]>([]);
  const [messageTimers, setMessageTimers] = useState<Map<string, NodeJS.Timeout>>(new Map());

  useEffect(() => {
    setVisibleMessages(messages);

    // Set up timers only for new messages
    const newTimers = new Map(messageTimers);
    
    messages.forEach(message => {
      if (!newTimers.has(message.id)) {
        // Only set timer for status messages, not error messages
        if (message.type === 'status') {
          const timer = setTimeout(() => {
            onMessageExpire(message.id);
            setMessageTimers(prev => {
              const updated = new Map(prev);
              updated.delete(message.id);
              return updated;
            });
          }, 1000);
          newTimers.set(message.id, timer);
        }
        // Error messages don't get timers - they stay until manually closed
      }
    });

    // Clean up timers for removed messages
    messageTimers.forEach((timer, messageId) => {
      if (!messages.some(msg => msg.id === messageId)) {
        clearTimeout(timer);
        newTimers.delete(messageId);
      }
    });

    setMessageTimers(newTimers);

    return () => {
      // Only clear timers that are being replaced
      messages.forEach(message => {
        if (messageTimers.has(message.id)) {
          clearTimeout(messageTimers.get(message.id)!);
        }
      });
    };
  }, [messages, onMessageExpire]);

  if (visibleMessages.length === 0) {
    return null;
  }

  return (
    <div style={{
      position: 'fixed',
      bottom: '16px',
      right: '16px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '8px'
    }}>
      {visibleMessages.map((message) => (
        <div
          key={message.id}
          className="animate-slide-in-right"
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
            color: 'white',
            fontWeight: '500',
            maxWidth: '400px',
            wordWrap: 'break-word',
            backgroundColor: message.type === 'status' ? '#10b981' : '#ef4444',
            transition: 'all 0.3s ease-in-out',
            transform: 'translateZ(0)' // Force hardware acceleration
          }}
          onMouseEnter={(e) => {
            if (message.type === 'status') {
              e.currentTarget.style.backgroundColor = '#059669';
            } else {
              e.currentTarget.style.backgroundColor = '#dc2626';
            }
          }}
          onMouseLeave={(e) => {
            if (message.type === 'status') {
              e.currentTarget.style.backgroundColor = '#10b981';
            } else {
              e.currentTarget.style.backgroundColor = '#ef4444';
            }
          }}
        >
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {message.type === 'status' ? (
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              ) : (
                <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
                </svg>
              )}
              <span style={{ fontSize: '14px' }}>{message.message}</span>
            </div>
            <button
              onClick={() => onMessageExpire(message.id)}
              style={{
                marginLeft: '12px',
                color: 'white',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: '0',
                display: 'flex',
                alignItems: 'center'
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = '#d1d5db';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = 'white';
              }}
              aria-label="Close message"
            >
              <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      ))}
    </div>
  );
};

export default FloatingMessage;