"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Wraps the browser's built-in Web Speech API (SpeechRecognition) for live
// dictation. Only finalized results are reported to onResult — no interim/
// partial text — keeping the caller's state updates simple. Unsupported in
// Firefox and Safari; `supported` reflects that so callers can disable the UI.
//
// The recognition instance is created once and kept alive for the whole
// listening session — recreating it on every result (which would happen if
// the effect depended on `onResult` directly, since that's a fresh closure
// every render) would silently stop dictation after the first phrase.
// Instead, the latest `onResult` is tracked in a ref that the long-lived
// recognition object reads from, so the caller can freely pass a new
// closure each render.
export function useSpeechDictation(onResult) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef(null);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  const supported =
    typeof window !== "undefined" &&
    Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);

  useEffect(() => {
    if (!supported) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = "en-US";

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          onResultRef.current(result[0].transcript.trim());
        }
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = () => setListening(false);

    recognitionRef.current = recognition;
    return () => recognition.stop();
  }, [supported]);

  const toggle = useCallback(() => {
    if (!recognitionRef.current) return;
    if (listening) {
      recognitionRef.current.stop();
      setListening(false);
    } else {
      recognitionRef.current.start();
      setListening(true);
    }
  }, [listening]);

  return { supported, listening, toggle };
}
