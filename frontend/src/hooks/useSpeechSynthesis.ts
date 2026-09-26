import { useCallback, useEffect, useRef, useState } from 'react';

// Male English voices, best first. Edge has the natural-sounding "Online" voices; Chrome on Windows
// has "Microsoft David/Mark"; Chrome has "Google UK English Male"; macOS/iOS have Daniel, Alex, Fred.
const PREFERRED_VOICES = [
  'Microsoft Andrew Online (Natural) - English (United States)',
  'Microsoft Guy Online (Natural) - English (United States)',
  'Microsoft Christopher Online (Natural) - English (United States)',
  'Microsoft Eric Online (Natural) - English (United States)',
  'Microsoft Brian Online (Natural) - English (United States)',
  'Microsoft Ryan Online (Natural) - English (United Kingdom)',
  'Google UK English Male',
  'Microsoft David - English (United States)',
  'Microsoft Mark - English (United States)',
  'Daniel',
  'Alex',
  'Fred',
];
const MALE_NAME_HINT = /\b(male|andrew|guy|christopher|eric|brian|roger|steffan|ryan|thomas|william|liam|david|mark|james|george|daniel|fred|tom|aaron|arthur|oliver)\b/i;

function pickMaleVoice(voices: SpeechSynthesisVoice[]): { voice: SpeechSynthesisVoice | null; knownMale: boolean } {
  const english = voices.filter((v) => v.lang.toLowerCase().startsWith('en'));
  const exact = PREFERRED_VOICES.map((n) => english.find((v) => v.name === n)).find(Boolean);
  if (exact) return { voice: exact, knownMale: true };
  const hinted =
    english.find((v) => /natural/i.test(v.name) && MALE_NAME_HINT.test(v.name)) ?? english.find((v) => MALE_NAME_HINT.test(v.name));
  if (hinted) return { voice: hinted, knownMale: true };
  // No male voice installed: use any English voice and lower the pitch.
  return { voice: english.find((v) => v.lang === 'en-US') ?? english[0] ?? null, knownMale: false };
}

/**
 * Browser text-to-speech. speak() resolves when the text has finished playing
 * (or was interrupted), so callers can start listening only after the question ends.
 */
export function useSpeechSynthesis() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [isSpeaking, setIsSpeaking] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const pitchRef = useRef(1);
  const tokenRef = useRef(0);

  useEffect(() => {
    if (!supported) return;
    const pick = () => {
      const { voice, knownMale } = pickMaleVoice(window.speechSynthesis.getVoices());
      voiceRef.current = voice;
      pitchRef.current = knownMale ? 1 : 0.8;
    };
    pick();
    window.speechSynthesis.addEventListener('voiceschanged', pick);
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', pick);
      tokenRef.current++;
      window.speechSynthesis.cancel();
    };
  }, [supported]);

  const speak = useCallback(
    (text: string) =>
      new Promise<void>((resolve) => {
        if (!supported || !text.trim()) return resolve();
        window.speechSynthesis.cancel();
        const token = ++tokenRef.current;
        // Speak sentence by sentence: avoids Chrome cutting off long utterances.
        const chunks = text.match(/[^.!?]+[.!?]*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
        let i = 0;
        setIsSpeaking(true);

        const next = () => {
          if (token !== tokenRef.current) return resolve();
          if (i >= chunks.length) {
            setIsSpeaking(false);
            return resolve();
          }
          const chunk = chunks[i++]!;
          const u = new SpeechSynthesisUtterance(chunk);
          if (voiceRef.current) u.voice = voiceRef.current;
          u.rate = 1.02;
          u.pitch = pitchRef.current;
          let advanced = false;
          // Watchdog: some browsers occasionally never fire onend.
          const watchdog = window.setTimeout(() => advance(), 2500 + chunk.split(/\s+/).length * 550);
          const advance = () => {
            if (advanced) return;
            advanced = true;
            window.clearTimeout(watchdog);
            next();
          };
          u.onend = advance;
          u.onerror = advance;
          window.speechSynthesis.speak(u);
        };
        next();
      }),
    [supported],
  );

  const stop = useCallback(() => {
    tokenRef.current++;
    if (supported) window.speechSynthesis.cancel();
    setIsSpeaking(false);
  }, [supported]);

  return { isSpeaking, isSupported: supported, speak, stop };
}
