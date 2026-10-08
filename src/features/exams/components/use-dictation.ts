"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

// Minimal typing for the browser Web Speech API (not in lib.dom for all targets).
interface SpeechResultLike { isFinal: boolean; 0: { transcript: string } }
interface SpeechEventLike { resultIndex: number; results: ArrayLike<SpeechResultLike> }
interface RecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: SpeechEventLike) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognitionCtor = new () => RecognitionLike;

export type DictationLang = "en-PH" | "fil-PH";
const subscribeSupport=()=>()=>{};
const browserSupport=()=>{const w=window as unknown as {SpeechRecognition?:RecognitionCtor;webkitSpeechRecognition?:RecognitionCtor};return Boolean(w.SpeechRecognition??w.webkitSpeechRecognition);};

/** Voice input for the answer key. Chrome and Edge only. Sends the audio to the browser vendor. */
export function useDictation(lang: DictationLang, onFinalText: (text: string) => void) {
  const supported = useSyncExternalStore(subscribeSupport,browserSupport,()=>false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<RecognitionLike | null>(null);
  const cbRef = useRef(onFinalText);

  useEffect(() => {
    cbRef.current = onFinalText;
  }, [onFinalText]);

  useEffect(() => {
    return () => recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    setError(null);
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let partial = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        if (!r) continue;
        if (r.isFinal) cbRef.current(r[0].transcript);
        else partial += r[0].transcript;
      }
      setInterim(partial);
    };
    rec.onerror = (e) => {
      setError(e.error === "not-allowed" ? "Microphone access is blocked. Allow it in your browser." : "Voice input stopped. Try again.");
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [lang]);

  const stop = useCallback(() => recRef.current?.stop(), []);

  return { supported, listening, interim, error, start, stop };
}
