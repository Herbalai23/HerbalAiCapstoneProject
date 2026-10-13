'use client';

import { useEffect } from 'react';
import type { RefObject } from 'react';
import io, { type Socket } from 'socket.io-client';
import api from '@/lib/axios';
import type { User } from '@/lib/context/AuthContext';
import { startMessengerConnection, type createHistoryRequests } from './messenger-sync';
import type { ChatMessage } from './types';

interface MessengerConnectionOptions {
  isAuthenticated: boolean;
  user: User | null;
  socketRef: RefObject<Socket | null>;
  applyMessage: (message: ChatMessage, allowInsert?: boolean) => void;
  checkSession: (force?: boolean) => Promise<User | null>;
  historyRequests: ReturnType<typeof createHistoryRequests<ChatMessage>>;
  synchronizeRef: RefObject<() => Promise<void>>;
  conversationQueryRef: RefObject<number>;
  conversationEventsRef: RefObject<Map<number, ChatMessage> | null>;
}

export function useMessengerConnection({
  isAuthenticated,
  user,
  socketRef,
  applyMessage,
  checkSession,
  historyRequests,
  synchronizeRef,
  conversationQueryRef,
  conversationEventsRef,
}: MessengerConnectionOptions) {
  useEffect(() => {
    if (!isAuthenticated || !user) return;

    const backendUrl = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api').replace('/api', '');

    socketRef.current = io(backendUrl, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
    });
    const socket = socketRef.current;
    const updateMessage = (message: ChatMessage) => applyMessage(message, false);
    socket.on('private_message', applyMessage);
    socket.on('message_edited', updateMessage);
    socket.on('message_deleted', updateMessage);
    const connection = startMessengerConnection(socket, {
      getToken: async () => (await api.get('/auth/socket-token', { timeout: 10000 })).data?.data?.token,
      onConnected: () => { void synchronizeRef.current(); },
      onAuthorizationFailure: () => { void checkSession(); },
      onError: error => console.error('Messenger connection unavailable:', error),
    });
    let lastResume = 0;
    const resume = () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastResume < 1000) return;
      lastResume = Date.now();
      if (socket.connected) void synchronizeRef.current();
      else connection.recover();
    };
    window.addEventListener('focus', resume);
    window.addEventListener('online', resume);
    document.addEventListener('visibilitychange', resume);

    return () => {
      window.removeEventListener('focus', resume);
      window.removeEventListener('online', resume);
      document.removeEventListener('visibilitychange', resume);
      socket.off('private_message', applyMessage);
      socket.off('message_edited', updateMessage);
      socket.off('message_deleted', updateMessage);
      connection.stop();
      historyRequests.cancel();
      conversationQueryRef.current += 1;
      conversationEventsRef.current = null;
    };
  }, [isAuthenticated, user, applyMessage, checkSession, historyRequests, socketRef, synchronizeRef, conversationQueryRef, conversationEventsRef]);
}
