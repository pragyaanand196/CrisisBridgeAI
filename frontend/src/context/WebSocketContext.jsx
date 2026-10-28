import React, { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
import { useNotification } from './NotificationContext';
import { getSessionToken } from '../services/api';

const WebSocketContext = createContext(null);

export function WebSocketProvider({ children }) {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const wsRef = useRef(null);
  const subscribersRef = useRef(new Map());
  const reconnectTimeoutRef = useRef(null);
  const { addToast } = useNotification();

  const connect = useCallback(() => {
    try {
      const baseUrl = import.meta.env.VITE_WS_URL || 'ws://127.0.0.1:8000/ws';
      const token = getSessionToken();
      const wsUrl = token ? `${baseUrl}?token=${encodeURIComponent(token)}` : baseUrl;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        console.log('[WebSocket] Connected to CrisisBridge AI live channel');
      };

      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          setLastMessage(payload);

          // Handle system alerts
          if (payload.type === 'WARNING_DISTRIBUTED') {
            addToast(`EMERGENCY ALERT: ${payload.data.title} (${payload.data.severity})`, 'danger', 7000);
          } else if (payload.type === 'ASSISTANCE_REQUEST_CREATED') {
            addToast(`URGENT AID REQUEST: ${payload.data.category} in ${payload.data.location_description}`, 'warning', 6000);
          } else if (payload.type === 'ASSISTANCE_ACKNOWLEDGED') {
            addToast(`AID REQUEST ACKNOWLEDGED: Request #${payload.data.id} acknowledged by disaster authorities.`, 'info', 6000);
          } else if (payload.type === 'ASSISTANCE_DISPATCHED') {
            addToast(`RESCUE UNIT DISPATCHED: ${payload.data.dispatched_unit_notes || 'Response Team'} deployed to ${payload.data.location_description}`, 'warning', 7000);
          } else if (payload.type === 'ASSISTANCE_VERIFIED') {
            addToast(`RESPONSE VERIFICATION: Citizen ${payload.data.citizen_name || ''} confirmed '${payload.data.citizen_verification_status}'`, 'success', 6000);
          } else if (payload.type === 'OFFICIAL_CLARIFICATION_PUBLISHED') {
            addToast(`OFFICIAL CLARIFICATION: ${payload.data.headline}`, 'info', 6000);
          }

          // Notify type-specific subscribers
          const handlers = subscribersRef.current.get(payload.type) || [];
          handlers.forEach((handler) => handler(payload.data));

          // Notify global subscribers ('*')
          const globalHandlers = subscribersRef.current.get('*') || [];
          globalHandlers.forEach((handler) => handler(payload));
        } catch (e) {
          console.error('[WebSocket] Error parsing message payload:', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        // Exponential reconnect retry
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, 3000);
      };

      ws.onerror = () => {
        setIsConnected(false);
        ws.close();
      };
    } catch (err) {
      console.error('[WebSocket] Setup exception:', err);
    }
  }, [addToast]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) wsRef.current.close();
    };
  }, [connect]);

  const subscribe = useCallback((eventType, callback) => {
    if (!subscribersRef.current.has(eventType)) {
      subscribersRef.current.set(eventType, []);
    }
    subscribersRef.current.get(eventType).push(callback);

    // Return unsubscribe function
    return () => {
      const handlers = subscribersRef.current.get(eventType) || [];
      subscribersRef.current.set(eventType, handlers.filter((h) => h !== callback));
    };
  }, []);

  return (
    <WebSocketContext.Provider value={{ isConnected, lastMessage, subscribe }}>
      {children}
    </WebSocketContext.Provider>
  );
}

export function useWebSocket() {
  const context = useContext(WebSocketContext);
  if (!context) {
    throw new Error('useWebSocket must be used within a WebSocketProvider');
  }
  return context;
}
