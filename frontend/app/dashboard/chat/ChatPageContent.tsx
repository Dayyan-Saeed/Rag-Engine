'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams, useRouter } from 'next/navigation';
import { Send, Loader2, FileText, MessageSquare, X, Copy, Check, MoreVertical, Edit2, Trash2 } from 'lucide-react';
import { api, chatApi } from '@/lib/api';
import { ChatSession, ChatMessage, Citation } from '@/lib/types';
import { formatDate, truncate, cn } from '@/lib/utils';
import { DocumentSelector } from '@/components/search/DocumentSelector';

export default function ChatPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(
    searchParams.get('session') || null
  );
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>(
    searchParams.get('doc') ? [searchParams.get('doc')!] : []
  );
  const [showDocSelector, setShowDocSelector] = useState(false);
  const [showSessions, setShowSessions] = useState(false);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [liveAnswer, setLiveAnswer] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Fetch sessions
  const { data: sessionsData } = useQuery({
    queryKey: ['chat-sessions'],
    queryFn: () => chatApi.listSessions(),
    staleTime: 1000 * 60 * 2,
  });

  useEffect(() => {
    if (sessionsData) setSessions(sessionsData.data);
  }, [sessionsData]);

  // Fetch messages for current session
  const { data: messagesData, isLoading: messagesLoading } = useQuery({
    queryKey: ['chat-messages', currentSessionId],
    queryFn: async () => {
      if (!currentSessionId) return { data: [] };
      return chatApi.getMessages(currentSessionId);
    },
    enabled: !!currentSessionId,
  });

  const messages: ChatMessage[] = messagesData?.data || [];

  // Chat mutation - using streaming fetch
  const chatMutation = useMutation({
    mutationFn: async (params: { message: string; session_id?: string; document_ids?: string[] }) => {
      const response = await chatApi.chatStream(params.message, {
        session_id: params.session_id,
        document_ids: params.document_ids,
      });
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', currentSessionId] });
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
    },
    onError: () => {
      setIsStreaming(false);
    },
  });

  // Scroll to bottom
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const message = input;
    setInput('');
    setIsStreaming(true);
    setLiveAnswer('');

    try {
      const response = await chatMutation.mutateAsync({
        message,
        session_id: currentSessionId || undefined,
        document_ids: selectedDocIds.length > 0 ? selectedDocIds : undefined,
      });

      if (!response.ok) {
        throw new Error(`Chat failed: ${response.status}`);
      }

      // Handle streaming response from Fetch API
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data === '[DONE]') {
              break;
            }
            try {
              const parsed = JSON.parse(data);
              if (parsed.type === 'token' && parsed.content) {
                setLiveAnswer((prev) => prev + parsed.content);
              } else if (parsed.type === 'error') {
                setLiveAnswer('');
                alert(parsed.message || 'Chat failed');
              } else if (parsed.type === 'done' && parsed.session_id) {
                if (!currentSessionId) {
                  setCurrentSessionId(parsed.session_id);
                  router.push(`/dashboard/chat?session=${parsed.session_id}`, { scroll: false });
                }
              }
            } catch {}
          }
        }
      }

      setIsStreaming(false);
      setLiveAnswer('');
      queryClient.invalidateQueries({ queryKey: ['chat-messages', currentSessionId] });
      queryClient.invalidateQueries({ queryKey: ['chat-sessions'] });
    } catch (error) {
      setIsStreaming(false);
      setLiveAnswer('');
      alert(error instanceof Error ? error.message : 'Failed to send message');
    }
  };

  const handleNewChat = () => {
    setCurrentSessionId(null);
    router.push('/dashboard/chat', { scroll: false });
  };

  const handleSessionSelect = (session: ChatSession) => {
    setCurrentSessionId(session.id);
    router.push(`/dashboard/chat?session=${session.id}`, { scroll: false });
  };

  const handleDeleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this chat session?')) return;
    try {
      await api.delete(`/chat/sessions/${id}`);
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (currentSessionId === id) {
        handleNewChat();
      }
    } catch {
      alert('Failed to delete session');
    }
  };

  const handleDocSelect = (docIds: string[]) => {
    setSelectedDocIds(docIds);
    setShowDocSelector(false);
  };

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="flex items-center gap-4">
          <button
            onClick={handleNewChat}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            title="New chat"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Chat</h1>
        </div>

        <div className="flex items-center gap-2">
          <DocumentSelector
            selectedIds={selectedDocIds}
            onSelect={handleDocSelect}
            isOpen={showDocSelector}
            onOpenChange={setShowDocSelector}
          />

          <button
            onClick={() => setShowSessions(!showSessions)}
            className="p-2 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
            title="Chat history"
          >
            <MessageSquare className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6" role="log" aria-live="polite">
        {messagesLoading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
          </div>
        ) : messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-gray-500 dark:text-gray-400">
            <MessageSquare className="w-16 h-16 mb-4 opacity-50" />
            <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Start a conversation
            </h3>
            <p className="max-w-xs">
              Ask questions about your documents. Select specific documents to narrow the search scope.
            </p>
          </div>
        ) : (
          <>
            {messages.map((msg, idx) => (
              <MessageBubble key={`${msg.id}-${idx}`} message={msg} />
            ))}
            {isStreaming && (
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-primary-600 dark:text-primary-400 animate-spin" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                </div>
                <div className="flex-1 bg-gray-100 dark:bg-gray-700 rounded-2xl rounded-tl-md px-4 py-3 whitespace-pre-wrap">
                  {liveAnswer || (
                    <div className="animate-pulse">
                      <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-3/4 mb-2" />
                      <div className="h-4 bg-gray-300 dark:bg-gray-600 rounded w-1/2" />
                    </div>
                  )}
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <form onSubmit={handleSend} className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend(e);
              }
            }}
            placeholder="Ask a question..."
            rows={1}
            disabled={isStreaming}
            className="flex-1 px-4 py-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-900 dark:text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent resize-none"
            style={{ minHeight: '48px', maxHeight: '200px' }}
          />
          <button
            type="submit"
            disabled={!input.trim() || isStreaming}
            className="p-3 bg-primary-600 text-white rounded-xl hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex-shrink-0"
            aria-label="Send"
          >
            {isStreaming ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </button>
        </form>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 text-center">
          Press Enter to send, Shift+Enter for new line
        </p>
      </div>

      {/* Sessions sidebar */}
      {showSessions && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowSessions(false)} />
          <div className="absolute right-0 top-0 bottom-0 w-80 bg-white dark:bg-gray-800 shadow-xl overflow-y-auto">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
              <h2 className="font-semibold text-gray-900 dark:text-white">Chat History</h2>
              <button onClick={() => setShowSessions(false)} className="p-1 text-gray-500">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-2">
              {sessions.length === 0 ? (
                <p className="text-gray-500 dark:text-gray-400 text-center py-8">No chats yet</p>
              ) : (
                sessions.map((session) => (
                  <button
                    key={session.id}
                    onClick={() => {
                      handleSessionSelect(session);
                      setShowSessions(false);
                    }}
                    className={cn(
                      'w-full text-left p-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors',
                      currentSessionId === session.id && 'bg-primary-50 dark:bg-primary-900/30'
                    )}
                  >
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {session.title}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                      {formatDate(session.updated_at)} • {session.message_count} messages
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMessage }) {
  const [copied, setCopied] = useState(false);
  const [showCitations, setShowCitations] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isUser = message.role === 'user';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0',
          isUser
            ? 'bg-primary-100 dark:bg-primary-900 text-primary-600 dark:text-primary-400'
            : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'
        )}
      >
        {isUser ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9 8s9 3.582 9 8z" />
          </svg>
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'px-4 py-3 rounded-2xl max-w-[85%]',
            isUser
              ? 'bg-primary-600 text-white rounded-br-md'
              : 'bg-gray-100 dark:bg-gray-700 text-gray-900 dark:text-white rounded-bl-md'
          )}
        >
          <div className="prose prose-sm dark:prose-invert max-w-none whitespace-pre-wrap">
            {message.content}
          </div>

          {message.citations.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowCitations(!showCitations)}
                className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 flex items-center gap-1"
              >
                {showCitations ? 'Hide' : 'Show'} sources ({message.citations.length})
              </button>
              {showCitations && (
                <div className="mt-2 space-y-1">
                  {message.citations.map((citation, idx) => (
                    <div
                      key={idx}
                      className="text-xs text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-600/50 p-2 rounded flex items-center gap-2"
                    >
                      <span className="font-medium">{citation.filename}</span>
                      {citation.page_number && (
                        <span>• p.{citation.page_number}</span>
                      )}
                      <span className="text-gray-400">• {(citation.score * 100).toFixed(0)}%</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <button
            onClick={handleCopy}
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded transition-colors"
            title={copied ? 'Copied!' : 'Copy'}
          >
            {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}