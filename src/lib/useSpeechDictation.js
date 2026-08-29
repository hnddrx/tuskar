"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { describeSpeechError } from "@/lib/speechErrors";

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
export function useSpeechDictation(onResult, lang) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // Resolved in an effect rather than during render. Computing it inline from
  // `typeof window` makes the server render "unsupported" (a disabled button)
  // and the client's very first render "supported" — a hydration mismatch that
  // behaves differently in a production build than under `next dev`, which is
  // why the mic could come up dead on a deployed origin but fine locally.
  const [supported, setSupported] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
  }, []);

  const effectiveLang =
    lang || (typeof navigator !== "undefined" && navigator.language) || "en-US";

  useEffect(() => {
    if (!supported) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = effectiveLang;

    recognition.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          onResultRef.current(result[0].transcript.trim());
        }
      }
    };
    recognition.onend = () => setListening(false);
    recognition.onerror = (event) => {
      setListening(false);
      const message = describeSpeechError(event?.error);
      if (message) setError(message);
    };

    recognitionRef.current = recognition;
    return () => recognition.stop();
    // Recreates recognition (stopping any in-progress session) whenever the
    // dictation language changes, since SpeechRecognition can't switch
    // languages mid-session.
  }, [supported, effectiveLang]);

  const toggle = useCallback(async () => {
    const recognition = recognitionRef.current;
    if (!recognition) return;

    if (listening) {
      recognition.stop();
      setListening(false);
      return;
    }

    setError(null);

    // Ask for the microphone explicitly, inside the click, before handing off
    // to SpeechRecognition. Permission is per-origin and does not carry over
    // from localhost to a deployed URL; Chrome's own implicit prompt is easy
    // to miss or dismiss, and a dismissed prompt is indistinguishable from a
    // dead button. Requesting it here turns that into a real message.
    if (typeof navigator !== "undefined" && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((track) => track.stop());
      } catch (err) {
        setError(
          describeSpeechError(
            err?.name === "NotFoundError" || err?.name === "DevicesNotFoundError"
              ? "audio-capture"
              : "not-allowed"
          )
        );
        return;
      }
    }

    try {
      recognition.start();
      setListening(true);
    } catch {
      // start() throws InvalidStateError when a previous session hasn't fully
      // released yet. Reset rather than leaving the UI stuck mid-state.
      recognition.stop();
      setError("Dictation was still finishing the last session — try again.");
    }
  }, [listening]);

  const clearError = useCallback(() => setError(null), []);

  return { supported, listening, error, toggle, clearError };
}
