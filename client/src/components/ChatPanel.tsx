import { useEffect, useRef, useState } from 'react';

export interface ChatLine {
  from: 'me' | 'them';
  text: string;
  ts: number;
}

interface Props {
  lines: ChatLine[];
  onSend: (text: string) => void;
  disabled?: boolean;
}

export function ChatPanel({ lines, onSend, disabled }: Props) {
  const [text, setText] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t) return;
    onSend(t);
    setText('');
  }

  return (
    <div className="chat-panel">
      <div className="chat-scroll" ref={scrollRef}>
        {lines.length === 0 && (
          <div className="chat-empty">Say hi — type to build chemistry 💬</div>
        )}
        {lines.map((l, i) => (
          <div key={i} className={`chat-line chat-${l.from}`}>
            <span>{l.text}</span>
          </div>
        ))}
      </div>
      <form className="chat-input" onSubmit={submit}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={disabled ? 'Connecting…' : 'Type a message'}
          disabled={disabled}
          maxLength={280}
        />
        <button type="submit" disabled={disabled || !text.trim()}>Send</button>
      </form>
    </div>
  );
}
