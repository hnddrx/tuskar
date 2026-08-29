"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// One conversation's messages, polled with a cursor so each request carries
// only what is new. Shared by the Chat page and every docked window, so a
// window and the full page behave identically.
const POLL_MS = 4000;

export function useConversation(conversationId, { active = true } = {}) {
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  // The newest message already held, so a poll asks only for what follows it.
  const cursorRef = useRef(null);

  const load = useCallback(
    async ({ reset = false } = {}) => {
      if (!conversationId) return;
      const since = reset ? null : cursorRef.current;
      const params = new URLSearchParams({ conversation: conversationId });
      if (since) params.set("since", since);

      try {
        const res = await fetch(`/api/chat/messages?${params}`);
        if (!res.ok) {
          if (reset) setError("This conversation isn't available.");
          return;
        }
        const batch = await res.json();
        if (batch.length > 0) cursorRef.current = batch[batch.length - 1].createdAt;

        setMessages((prev) => {
          if (reset) return batch;
          if (batch.length === 0) return prev;
          // A message sent from this tab arrives again from the server.
          const seen = new Set(prev.map((m) => m.id));
          return [...prev, ...batch.filter((m) => !seen.has(m.id))];
        });
      } catch {
        /* a missed poll is corrected by the next one */
      }
    },
    [conversationId]
  );

  // Switching conversation starts over rather than showing the previous one's
  // messages under a new name.
  useEffect(() => {
    cursorRef.current = null;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMessages([]);
    setError(null);
    load({ reset: true });
  }, [conversationId, load]);

  useEffect(() => {
    if (!active || !conversationId) return;
    let timer = null;
    const tick = () => {
      if (document.visibilityState === "visible") load();
    };
    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(tick, POLL_MS);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        tick();
        start();
      } else if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [active, conversationId, load]);

  const send = useCallback(
    async (body, attachment = null) => {
      const text = String(body || "").trim();
      if ((!text && !attachment) || sending) return false;
      setSending(true);
      setError(null);
      try {
        const res = await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, body: text, attachment }),
        });
        if (!res.ok) throw new Error("Message not sent");
        const saved = await res.json();
        cursorRef.current = saved.createdAt;
        setMessages((prev) => [...prev, saved]);
        return true;
      } catch (err) {
        setError(err.message || "Message not sent");
        return false;
      } finally {
        setSending(false);
      }
    },
    [conversationId, sending]
  );

  return { messages, error, sending, send, reload: () => load({ reset: true }) };
}
