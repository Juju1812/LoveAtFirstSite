import { useEffect, useRef } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getToken } from './api';
import type { Message } from './api';

const SIGNAL_URL =
  (import.meta.env.VITE_SIGNAL_URL as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);

/**
 * Subscribe to real-time 'message' events for a given conversation.
 * Uses an isolated socket so it doesn't interfere with the matching socket.
 */
export function useMessageStream(conversationId: number, onMessage: (m: Message) => void) {
  const onMessageRef = useRef(onMessage);
  useEffect(() => { onMessageRef.current = onMessage; }, [onMessage]);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const socket: Socket = io(SIGNAL_URL, {
      transports: ['websocket'],
      auth: { token }
    });
    socket.on('message', ({ conversationId: cid, message }: { conversationId: number; message: Message }) => {
      if (cid === conversationId) onMessageRef.current(message);
    });
    return () => { socket.disconnect(); };
  }, [conversationId]);
}
