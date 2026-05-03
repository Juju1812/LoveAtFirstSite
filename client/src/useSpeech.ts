import { useEffect, useRef, useState } from 'react';

/**
 * Live speech-to-text on the LOCAL microphone via the Web Speech API.
 * Each user transcribes themselves; transcripts stay in the browser and
 * are never sent to our server — only the numeric chemistry score is shared.
 *
 * Browser support: Chrome, Edge, Safari (via webkit prefix). Firefox: not
 * supported. We degrade gracefully — if the API is missing, the chemistry
 * meter just stays driven by chat messages.
 */

type SR = any;

interface UseSpeechOpts {
  active: boolean;
  onTranscript: (text: string) => void;
}

export interface UseSpeechResult {
  supported: boolean;
  listening: boolean;
}

export function useSpeech({ active, onTranscript }: UseSpeechOpts): UseSpeechResult {
  const onTranscriptRef = useRef(onTranscript);
  const [listening, setListening] = useState(false);

  useEffect(() => { onTranscriptRef.current = onTranscript; }, [onTranscript]);

  const SR: { new(): SR } | undefined =
    (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  const supported = !!SR;

  useEffect(() => {
    if (!active || !SR) {
      setListening(false);
      return;
    }

    let stopped = false;
    const recognition: SR = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);
    recognition.onend = () => {
      setListening(false);
      // Browser auto-stops periodically; restart while active.
      if (!stopped) {
        try { recognition.start(); } catch { /* already starting */ }
      }
    };

    recognition.onerror = (e: any) => {
      // 'no-speech' fires constantly during silence — ignore.
      if (e?.error && e.error !== 'no-speech' && e.error !== 'aborted') {
        console.warn('SpeechRecognition error', e.error);
      }
    };

    recognition.onresult = (event: any) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          const text = (result[0]?.transcript ?? '').trim();
          if (text) onTranscriptRef.current(text);
        }
      }
    };

    try { recognition.start(); } catch (err) {
      console.warn('SpeechRecognition start failed', err);
    }

    return () => {
      stopped = true;
      setListening(false);
      try { recognition.stop(); } catch { /* noop */ }
    };
  }, [active, SR]);

  return { supported, listening };
}
