import { useCallback, useEffect, useRef, useState } from 'react';

const SpeechRecognitionImpl: any =
  typeof window !== 'undefined' ? (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition : undefined;

/**
 * Continuous browser speech-to-text (Chrome/Edge).
 * Keeps listening across pauses (auto-restarts when the browser ends a session)
 * until stop() is called, accumulating final text plus the live interim guess.
 */
export function useSpeechRecognition(lang = 'en-US') {
  const [finalText, setFinalText] = useState('');
  const [interim, setInterim] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<any>(null);
  const wantRef = useRef(false);

  useEffect(() => {
    if (!SpeechRecognitionImpl) return;
    const rec = new SpeechRecognitionImpl();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;

    rec.onstart = () => setIsListening(true);
    rec.onresult = (event: any) => {
      let fin = '';
      let live = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) fin += result[0].transcript;
        else live += result[0].transcript;
      }
      if (fin.trim()) setFinalText((prev) => (prev ? `${prev.trimEnd()} ${fin.trim()}` : fin.trim()));
      setInterim(live);
    };
    rec.onerror = (event: any) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      setError(event.error);
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') wantRef.current = false;
    };
    rec.onend = () => {
      setInterim('');
      if (wantRef.current) {
        try {
          rec.start(); // browser ended the session (silence/timeout); keep listening
          return;
        } catch {
          /* fall through */
        }
      }
      setIsListening(false);
    };

    recRef.current = rec;
    return () => {
      wantRef.current = false;
      rec.onend = null;
      try {
        rec.abort();
      } catch {
        /* ignore */
      }
      recRef.current = null;
    };
  }, [lang]);

  const start = useCallback(() => {
    if (!recRef.current) return;
    setError(null);
    wantRef.current = true;
    try {
      recRef.current.start();
    } catch {
      /* already running */
    }
  }, []);

  /** Stop immediately and discard pending audio, so late results can't leak into the next answer. */
  const stop = useCallback(() => {
    wantRef.current = false;
    try {
      recRef.current?.abort();
    } catch {
      /* ignore */
    }
  }, []);

  const reset = useCallback(() => {
    setFinalText('');
    setInterim('');
  }, []);

  const transcript = `${finalText} ${interim}`.trim();

  return { transcript, finalText, interim, isListening, error, isSupported: !!SpeechRecognitionImpl, start, stop, reset };
}
