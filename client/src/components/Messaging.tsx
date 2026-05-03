import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../AuthContext';
import {
  listConversations as apiListConversations,
  listMessages as apiListMessages,
  postMessage as apiPostMessage,
  markRead as apiMarkRead,
  type ConversationSummary,
  type Message
} from '../api';
import { useMessageStream } from '../useMessageStream';

export function Inbox() {
  const { user } = useAuth();
  const [convos, setConvos] = useState<ConversationSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    apiListConversations()
      .then(({ conversations }) => { if (!cancelled) setConvos(conversations); })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [user]);

  if (!user) {
    return (
      <div className="dash-panel">
        <div className="dash-panel-header">
          <div>
            <div className="dash-panel-eyebrow">Messages</div>
            <h1 className="dash-panel-title">Sign in to message your matches</h1>
            <p className="dash-panel-sub">Conversations live on your account so you can read them from any device.</p>
          </div>
        </div>
        <div className="saved-empty">
          <div className="saved-empty-icon">🔒</div>
          <div className="settings-actions">
            <Link to="/login" className="settings-secondary-btn">Sign in</Link>
            <Link to="/signup" className="settings-save-btn">Create account</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="dash-panel">
      <div className="dash-panel-header">
        <div>
          <div className="dash-panel-eyebrow">Messages</div>
          <h1 className="dash-panel-title">Inbox</h1>
          <p className="dash-panel-sub">Conversations open automatically when you both swipe right.</p>
        </div>
      </div>
      {error && <div className="auth-error">{error}</div>}
      {convos == null ? (
        <div className="saved-empty"><p>Loading…</p></div>
      ) : convos.length === 0 ? (
        <div className="saved-empty">
          <div className="saved-empty-icon">💬</div>
          <h2>No conversations yet</h2>
          <p>When you both swipe right on someone, a conversation opens automatically.</p>
        </div>
      ) : (
        <ul className="convo-list">
          {convos.map(c => (
            <li key={c.id}>
              <Link className={`convo-item ${c.unread ? 'convo-item-unread' : ''}`} to={`/messages/${c.id}`}>
                {c.peer_photo ? (
                  <img className="convo-photo" src={c.peer_photo} alt="" />
                ) : (
                  <div className="convo-photo convo-photo-empty">👤</div>
                )}
                <div className="convo-meta">
                  <div className="convo-row">
                    <span className="convo-name">{c.peer_name || 'Anonymous'}</span>
                    <span className="convo-time">{timeAgo(c.last_msg_at)}</span>
                  </div>
                  <div className="convo-preview">
                    {c.last_body
                      ? (c.last_sender === user.id ? 'You: ' : '') + c.last_body
                      : <em>Say hi 👋</em>}
                  </div>
                </div>
                {c.unread > 0 && <span className="convo-unread-dot" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function Conversation() {
  const { user } = useAuth();
  const { id: idStr } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const conversationId = idStr ? parseInt(idStr, 10) : NaN;
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [convo, setConvo] = useState<ConversationSummary | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Load conversation summary so we can show peer name/photo
  useEffect(() => {
    if (!user) return;
    apiListConversations().then(({ conversations }) => {
      const c = conversations.find(x => x.id === conversationId) ?? null;
      setConvo(c);
    }).catch(() => {});
  }, [user, conversationId]);

  // Initial load + mark read
  useEffect(() => {
    if (!user || !Number.isFinite(conversationId)) return;
    let cancelled = false;
    apiListMessages(conversationId)
      .then(({ messages }) => {
        if (cancelled) return;
        setMessages(messages);
        apiMarkRead(conversationId).catch(() => {});
      })
      .catch((e) => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [user, conversationId]);

  // Real-time message subscription
  useMessageStream(conversationId, (m) => {
    setMessages(prev => prev ? [...prev, m] : [m]);
    apiMarkRead(conversationId).catch(() => {});
  });

  // Auto-scroll
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages?.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setError(null);
    try {
      const { message } = await apiPostMessage(conversationId, text);
      setMessages(prev => prev ? [...prev, message] : [message]);
      setDraft('');
    } catch (err: any) {
      setError(err.message ?? 'Send failed');
    } finally {
      setSending(false);
    }
  }

  if (!user) {
    navigate('/login', { replace: true });
    return null;
  }

  return (
    <div className="convo-page">
      <header className="convo-nav">
        <Link to="/messages" className="settings-back">← Messages</Link>
        <div className="convo-header-meta">
          {convo?.peer_photo ? (
            <img className="convo-photo convo-photo-small" src={convo.peer_photo} alt="" />
          ) : (
            <div className="convo-photo convo-photo-small convo-photo-empty">👤</div>
          )}
          <div>
            <div className="convo-header-name">{convo?.peer_name || 'Anonymous'}</div>
            {convo?.peer_bio && <div className="convo-header-bio">{convo.peer_bio}</div>}
          </div>
        </div>
      </header>

      <main className="convo-thread" ref={scrollRef}>
        {messages == null ? (
          <div className="convo-empty">Loading…</div>
        ) : messages.length === 0 ? (
          <div className="convo-empty">No messages yet. Make the first move 💬</div>
        ) : (
          messages.map(m => (
            <div
              key={m.id}
              className={`msg-bubble ${m.sender_id === user.id ? 'msg-mine' : 'msg-theirs'}`}
            >
              <div className="msg-body">{m.body}</div>
              <div className="msg-time">{formatTime(m.sent_at)}</div>
            </div>
          ))
        )}
      </main>

      {error && <div className="auth-error" style={{ margin: '12px 16px' }}>{error}</div>}

      <form className="convo-compose" onSubmit={send}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Type a message…"
          maxLength={1000}
          disabled={sending}
          autoFocus
        />
        <button type="submit" disabled={!draft.trim() || sending}>
          {sending ? '…' : 'Send'}
        </button>
      </form>
    </div>
  );
}

function timeAgo(ts: number): string {
  const d = Date.now() - ts;
  if (d < 60_000) return 'now';
  if (d < 3600_000) return `${Math.floor(d / 60_000)}m`;
  if (d < 86400_000) return `${Math.floor(d / 3600_000)}h`;
  return `${Math.floor(d / 86400_000)}d`;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
