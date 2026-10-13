'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/context/AuthContext';
import api from '@/lib/axios';
import type { Socket } from 'socket.io-client';
import { createHistoryRequests, isConversationMessage, mergeConversationMessages, reconcileConversationPreviews, updateConversationPreview } from './messenger-sync';
import type { UserProfile, ChatMessage, Conversation } from './types';
import { useMessengerConnection } from './useMessengerConnection';

export function useMessengerState() {
  const { user, isAuthenticated, loading, sessionUnavailable, checkSession } = useAuth();

  const router = useRouter();

  const searchParams = useSearchParams();

  const targetUserId = searchParams.get('userId');

  const [conversations, setConversations] = useState<Conversation[]>([]);

  const [conversationOffset, setConversationOffset] = useState(0);

  const [hasMoreConversations, setHasMoreConversations] = useState(false);

  const [loadingMoreConversations, setLoadingMoreConversations] = useState(false);

  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);

  const [activeContact, setActiveContact] = useState<UserProfile | null>(null);

  const [messages, setMessages] = useState<ChatMessage[]>([]);

  const [input, setInput] = useState('');

  const [isSending, setIsSending] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');

  const [debouncedConversationSearch, setDebouncedConversationSearch] = useState('');

  const [showUserPicker, setShowUserPicker] = useState(false);

  const [userPickerSearch, setUserPickerSearch] = useState('');

  const [hasMoreUsers, setHasMoreUsers] = useState(false);

  const [loadingUsers, setLoadingUsers] = useState(false);

  const [userOffset, setUserOffset] = useState(0);

  const [userLoadError, setUserLoadError] = useState('');

  const [loadingMessages, setLoadingMessages] = useState(false);

  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);

  const [hasOlderMessages, setHasOlderMessages] = useState(false);

  const [nextBefore, setNextBefore] = useState<string | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [filePreviewUrl, setFilePreviewUrl] = useState<string | null>(null);

  const [editingMessageId, setEditingMessageId] = useState<number | null>(null);

  const [editInput, setEditInput] = useState('');

  const [activeMenuMessageId, setActiveMenuMessageId] = useState<number | null>(null);

  const socketRef = useRef<Socket | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const menuRef = useRef<HTMLDivElement>(null);

  const prependingMessagesRef = useRef(false);

  const isInitialLoadRef = useRef(true);

  const conversationQueryRef = useRef(0);

  const conversationEventsRef = useRef<Map<number, ChatMessage> | null>(null);

  const userQueryRef = useRef(0);

  const loadingUsersRef = useRef(false);

  const activeContactRef = useRef<UserProfile | null>(null);

  const [historyRequests] = useState(() => createHistoryRequests<ChatMessage>());

  const synchronizeRef = useRef<() => Promise<void>>(async () => {});

  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const normalizedConversationSearch = searchTerm.trim().slice(0, 100);

  const normalizedUserPickerSearch = userPickerSearch.trim().slice(0, 100);

  const applyMessage = useCallback((message: ChatMessage, allowInsert = true) => {
    if (!user || !message || !Number.isInteger(message.id) || typeof message.senderId !== 'string' ||
        typeof message.receiverId !== 'string' || typeof message.time !== 'string' ||
        !Number.isFinite(Date.parse(message.time)) || typeof message.content !== 'string' ||
        (message.senderId !== user?.id && message.receiverId !== user?.id)) return;
    const userId = user.id;
    historyRequests.record(message);
    conversationEventsRef.current?.set(message.id, message);
    const contactId = activeContactRef.current?.id;
    if (contactId && isConversationMessage(message, userId, contactId)) {
      setMessages(current => mergeConversationMessages(current, [message], userId, contactId, allowInsert));
    }
    setConversations(current => updateConversationPreview(current, message, userId));
    if (allowInsert && message.senderId !== userId) {
      const senderName = message.sender?.name || 'Someone';
      setLiveAnnouncement(`New message from ${senderName}: ${message.content || 'Photo attached'}`);
    }
  }, [user, historyRequests]);

  useEffect(() => {
    if (!loading && !isAuthenticated && !sessionUnavailable) {
      const callback = targetUserId ? `/messenger?userId=${targetUserId}` : '/messenger';
      router.push(`/signin?callbackUrl=${encodeURIComponent(callback)}`);
    }
  }, [loading, isAuthenticated, sessionUnavailable, router, targetUserId]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setActiveMenuMessageId(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useMessengerConnection({ isAuthenticated, user, socketRef, applyMessage, checkSession, historyRequests, synchronizeRef, conversationQueryRef, conversationEventsRef });

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedConversationSearch(normalizedConversationSearch), 250);
    return () => window.clearTimeout(timer);
  }, [normalizedConversationSearch]);

  const refreshConversations = useCallback(async () => {
    if (!isAuthenticated || !user) return;
    const version = ++conversationQueryRef.current;
    const updates = new Map<number, ChatMessage>();
    conversationEventsRef.current = updates;
    try {
      const response = await api.get('/messages/conversations', { params: { limit: 25, offset: 0, search: debouncedConversationSearch }, timeout: 10000 });
      if (version !== conversationQueryRef.current || response.data?.status !== 'success') return;
      const page: Conversation[] = response.data.data.conversations;
      if (!Array.isArray(page)) throw new Error('Conversations are unavailable.');
      setConversations(reconcileConversationPreviews(page, updates.values(), user.id));
      setConversationOffset(page.length);
      setHasMoreConversations(Boolean(response.data.data.hasMore));
    } catch (error) { if (version === conversationQueryRef.current) console.error('Failed to fetch conversations', error); }
    finally { if (conversationEventsRef.current === updates) conversationEventsRef.current = null; }
  }, [isAuthenticated, user, debouncedConversationSearch]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => { if (!cancelled) void refreshConversations(); });
    return () => { cancelled = true; conversationQueryRef.current += 1; };
  }, [refreshConversations]);

  const loadMoreConversations = async () => {
    if (!hasMoreConversations || loadingMoreConversations) return;
    const requestVersion = conversationQueryRef.current;
    setLoadingMoreConversations(true);
    try {
      const response = await api.get('/messages/conversations', { params: { limit: 25, offset: conversationOffset, search: debouncedConversationSearch } });
      if (requestVersion !== conversationQueryRef.current || response.data?.status !== 'success') return;
      const page: Conversation[] = response.data.data.conversations || [];
      setConversations((current) => [...current, ...page.filter((item) => !current.some((existing) => existing.contact.id === item.contact.id))]);
      setConversationOffset((offset) => offset + page.length);
      setHasMoreConversations(Boolean(response.data.data.hasMore));
    } catch (error) {
      console.error('Failed to load conversations', error);
    } finally {
      setLoadingMoreConversations(false);
    }
  };

  const loadUsers = useCallback(async (offset = 0, version = userQueryRef.current) => {
    if (version !== userQueryRef.current || loadingUsersRef.current) return;
    loadingUsersRef.current = true;
    setLoadingUsers(true);
    setUserLoadError('');
    try {
      const response = await api.get('/messages/users', { params: { search: normalizedUserPickerSearch, limit: 20, offset }, timeout: 10000 });
      if (version !== userQueryRef.current) return;
      const nextUsers: UserProfile[] = response.data?.data?.users;
      if (response.data?.status !== 'success' || !Array.isArray(nextUsers) ||
          nextUsers.some(contact => !contact || typeof contact.id !== 'string' || typeof contact.name !== 'string')) {
        throw new Error('Users are unavailable.');
      }
      setAllUsers(current => [...new Map((offset === 0 ? nextUsers : [...current, ...nextUsers]).map(contact => [contact.id, contact])).values()]);
      setUserOffset(offset + nextUsers.length);
      setHasMoreUsers(nextUsers.length > 0 && Boolean(response.data.data.hasMore));
    } catch (error) {
      if (version === userQueryRef.current) {
        console.error('Failed to fetch users', error);
        setUserLoadError('Unable to load users. Please try again.');
      }
    } finally {
      if (version === userQueryRef.current) {
        loadingUsersRef.current = false;
        setLoadingUsers(false);
      }
    }
  }, [normalizedUserPickerSearch]);

  useEffect(() => {
    if (!showUserPicker || !isAuthenticated) return;
    const version = ++userQueryRef.current;
    const timer = window.setTimeout(() => { void loadUsers(0, version); }, 250);
    return () => { userQueryRef.current += 1; loadingUsersRef.current = false; window.clearTimeout(timer); };
  }, [showUserPicker, isAuthenticated, user?.id, userPickerSearch, loadUsers]);

  useEffect(() => {
    if (prependingMessagesRef.current) {
      prependingMessagesRef.current = false;
      return;
    }
    if (messages.length === 0) return;

    if (isInitialLoadRef.current) {
      isInitialLoadRef.current = false;
      // Instant jump to bottom when first opening a conversation, eliminating long sliding animation
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    } else {
      // Smooth scroll for dynamically sent or received messages
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const refreshHistory = useCallback(async (contact: UserProfile) => {
    if (!user?.id) return;
    const request = historyRequests.begin(user.id, contact.id);
    setLoadingOlderMessages(false);
    try {
      const response = await api.get(`/messages/history/${encodeURIComponent(contact.id)}?limit=50`, { timeout: 10000 });
      if (response.data?.status !== 'success' || !Array.isArray(response.data?.data?.messages)) throw new Error('Message history is unavailable.');
      const page = historyRequests.finish(request, response.data.data.messages);
      if (!page) return;
      setMessages(page);
      setHasOlderMessages(Boolean(response.data.data.hasMore));
      setNextBefore(response.data.data.nextBefore || null);
    } catch (error) {
      if (historyRequests.isCurrent(request)) console.error('Failed to load message history', error);
    } finally {
      if (historyRequests.isCurrent(request)) setLoadingMessages(false);
    }
  }, [user, historyRequests]);

  useEffect(() => {
    synchronizeRef.current = async () => {
      const contact = activeContactRef.current;
      await Promise.all([refreshConversations(), ...(contact ? [refreshHistory(contact)] : [])]);
    };
  }, [refreshConversations, refreshHistory]);

  const openConversation = useCallback(async (contact: UserProfile) => {
    isInitialLoadRef.current = true;
    activeContactRef.current = contact;
    setActiveContact(contact);
    setLoadingMessages(true);
    setMessages([]);
    setHasOlderMessages(false);
    setNextBefore(null);
    setSelectedFile(null);
    setFilePreviewUrl(null);
    setEditingMessageId(null);
    setInput('');

    // Only auto-focus on desktop devices (width >= 768px) to prevent mobile virtual keyboard
    // from unexpectedly popping up and pushing the whole screen upward.
    if (typeof window !== 'undefined' && window.innerWidth >= 768) {
      inputRef.current?.focus();
    }

    await refreshHistory(contact);
    if (activeContactRef.current?.id !== contact.id) return;

    // Ensure conversation appears in sidebar
    setConversations((prev) => {
      const exists = prev.some((c) => c.contact.id === contact.id);
      if (exists) return prev;
      return [{ contact, lastMessage: '', lastTime: '' }, ...prev];
    });
  }, [refreshHistory]);

  const loadOlderMessages = async () => {
    if (!activeContact || !user || !nextBefore || loadingOlderMessages) return;
    const contactId = activeContact.id;
    const request = historyRequests.begin(user.id, contactId);
    setLoadingOlderMessages(true);
    try {
      const res = await api.get(
        `/messages/history/${encodeURIComponent(contactId)}?limit=50&before=${encodeURIComponent(nextBefore)}`, { timeout: 10000 }
      );
      if (res.data?.status === 'success') {
        const page = historyRequests.finish(request, Array.isArray(res.data?.data?.messages) ? res.data.data.messages : []);
        if (!page) return;
        prependingMessagesRef.current = true;
        setMessages(current => mergeConversationMessages(current, page, user.id, contactId));
        setHasOlderMessages(Boolean(res.data.data.hasMore));
        setNextBefore(res.data.data.nextBefore || null);
      }
    } catch (err) {
      console.error('Failed to load older messages', err);
    } finally {
      if (historyRequests.isCurrent(request)) setLoadingOlderMessages(false);
    }
  };

  useEffect(() => {
    if (!targetUserId || !isAuthenticated) return;

    // Check if user is already the active contact
    if (activeContact?.id === targetUserId) return;

    let cancelled = false;
    api.get('/messages/users', { params: { id: targetUserId } }).then((response) => {
      if (cancelled) return;
      const contact = response.data.data.users?.[0] as UserProfile | undefined;
      if (!contact) return;
      void openConversation(contact);
      const url = new URL(window.location.href);
      url.searchParams.delete('userId');
      window.history.replaceState({}, '', url.pathname + url.search);
    }).catch((error) => console.error('Failed to open linked conversation', error));
    return () => { cancelled = true; };
  }, [targetUserId, isAuthenticated, activeContact, openConversation]);

  const handleAttachmentClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('File size exceeds the 5MB limit.');
        return;
      }
      setSelectedFile(file);
      setFilePreviewUrl(URL.createObjectURL(file));
    }
  };

  const removeSelectedFile = () => {
    setSelectedFile(null);
    setFilePreviewUrl(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !selectedFile) || !activeContact || isSending) return;

    setIsSending(true);
    const contentText = input.trim();

    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append('receiverId', activeContact.id);
    if (contentText) {
      formData.append('content', contentText);
    }
    if (selectedFile) {
      formData.append('image', selectedFile);
    }

    try {
      const response = await api.post('/messages', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      applyMessage(response.data?.data?.message);
      setInput('');
      removeSelectedFile();
    } catch (err) {
      console.error('Failed to send message', err);
      alert('Failed to send message. Please try again.');
    } finally {
      setIsSending(false);
      if (typeof window !== 'undefined' && window.innerWidth >= 768) {
        inputRef.current?.focus();
      }
    }
  };

  const handleEditSubmit = async (msgId: number) => {
    if (!editInput.trim()) return;

    try {
      const res = await api.put(`/messages/${msgId}`, { content: editInput.trim() });
      if (res.data?.status === 'success') {
        applyMessage(res.data?.data?.message, false);
        setEditingMessageId(null);
        setEditInput('');
      }
    } catch (err) {
      console.error('Failed to edit message', err);
      alert('Failed to edit message.');
    }
  };

  const handleDeleteMessage = async (msgId: number) => {
    if (!window.confirm('Are you sure you want to delete this message?')) return;

    try {
      const response = await api.delete(`/messages/${msgId}`);
      applyMessage(response.data?.data?.message, false);
      setActiveMenuMessageId(null);
    } catch (err) {
      console.error('Failed to delete message', err);
      alert('Failed to delete message.');
    }
  };

  const handleStartChat = (contact: UserProfile) => {
    setShowUserPicker(false);
    setUserPickerSearch('');
    openConversation(contact);
  };

  const handleOpenUserPicker = () => {
    setAllUsers([]);
    setUserOffset(0);
    setHasMoreUsers(false);
    setUserLoadError('');
    setLoadingUsers(true);
    setShowUserPicker(true);
  };

  const filteredConversations = conversations.filter((c) =>
    c.contact.name.toLowerCase().includes(normalizedConversationSearch.toLowerCase())
  );

  const filteredAllUsers = allUsers;

  return {
    loading,
    sessionUnavailable,
    user,
    checkSession,
    liveAnnouncement,
    activeContact,
    handleOpenUserPicker,
    searchTerm,
    setSearchTerm,
    filteredConversations,
    normalizedConversationSearch,
    openConversation,
    hasMoreConversations,
    loadingMoreConversations,
    loadMoreConversations,
    activeContactRef,
    historyRequests,
    setLoadingMessages,
    setLoadingOlderMessages,
    setActiveContact,
    router,
    loadingMessages,
    messages,
    hasOlderMessages,
    loadOlderMessages,
    loadingOlderMessages,
    editingMessageId,
    setActiveMenuMessageId,
    activeMenuMessageId,
    editInput,
    setEditInput,
    handleEditSubmit,
    setEditingMessageId,
    menuRef,
    handleDeleteMessage,
    messagesEndRef,
    filePreviewUrl,
    removeSelectedFile,
    selectedFile,
    handleSend,
    handleAttachmentClick,
    isSending,
    fileInputRef,
    handleFileChange,
    inputRef,
    input,
    setInput,
    showUserPicker,
    setShowUserPicker,
    setUserPickerSearch,
    userPickerSearch,
    userQueryRef,
    loadingUsersRef,
    setUserOffset,
    setAllUsers,
    setHasMoreUsers,
    setUserLoadError,
    setLoadingUsers,
    filteredAllUsers,
    userLoadError,
    loadingUsers,
    handleStartChat,
    loadUsers,
    userOffset,
    hasMoreUsers,
  };
}
