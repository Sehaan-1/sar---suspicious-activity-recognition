import { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Event } from '../types';

export function useWebSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);
  const [alerts, setAlerts] = useState<Event[]>([]);

  useEffect(() => {
    // Only works if the app has a specific domain, but empty connects to current host
    const socketInstance = io('/', { path: '/socket.io' });
    
    socketInstance.on('connect', () => {
      console.log('Connected to WebSocket');
    });

    socketInstance.on('NEW_ALERT', (event: Event) => {
      setAlerts((prev) => [event, ...prev].slice(0, 50)); // Keep last 50
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  return { socket, alerts, setAlerts };
}
