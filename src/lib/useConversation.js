"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { mergeMessages, nextCursor } from "@/lib/chat";

// One conversation's messages, polled with a cursor so each request carries
// only what has changed. Shared by the Chat page and the docked panel, so the
// two behave identically.
const POLL_MS = 4000;

export function useConversation(conversationId, { active = true } = {}) {
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState(null);
  const [sending, setSending] = useState(false);
  // How far this client has caught up. It tracks the newest *change*, not the
  // newest message, so an edit or a delete to something older still arrives.
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
        cursorRef.current = nextCursor(batch, reset ? null : cursorRef.current);

        // Merged by id: a batch is what has changed, so an edited message
        // arrives again and replaces the copy on screen instead of doubling.
        setMessages((prev) => mergeMessages(reset ? [] : prev, batch));
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

  // Folds a message the server just handed back into what is on screen, and
  // moves the cursor past it so the next poll does not fetch it again.
  const absorb = useCallback((saved) => {
    cursorRef.current = nextCursor([saved], cursorRef.current);
    setMessages((prev) => mergeMessages(prev, [saved]));
  }, []);

  const send = useCallback(
    async (body, attachment = null, { replyToId = null } = {}) => {
      const text = String(body || "").trim();
      if ((!text && !attachment) || sending) return false;
      setSending(true);
      setError(null);
      try {
        const res = await fetch("/api/chat/messages", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId, body: text, attachment, replyToId }),
        });
        if (!res.ok) throw new Error("Message not sent");
        absorb(await res.json());
        return true;
      } catch (err) {
        setError(err.message || "Message not sent");
        return false;
      } finally {
        setSending(false);
      }
    },
    [conversationId, sending, absorb]
  );

  const edit = useCallback(
    async (id, body) => {
      const text = String(body || "").trim();
      if (!text) return false;
      try {
        const res = await fetch(`/api/chat/messages/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body: text }),
        });
        if (!res.ok) throw new Error("Couldn't save that edit");
        absorb(await res.json());
        return true;
      } catch (err) {
        setError(err.message || "Couldn't save that edit");
        return false;
      }
    },
    [absorb]
  );

  const remove = useCallback(
    async (id) => {
      try {
        const res = await fetch(`/api/chat/messages/${id}`, { method: "DELETE" });
        if (!res.ok) throw new Error("Couldn't delete that message");
        absorb(await res.json());
        return true;
      } catch (err) {
        setError(err.message || "Couldn't delete that message");
        return false;
      }
    },
    [absorb]
  );

  /**
   * Copies a message into another conversation. The copy lands there rather
   * than here, so nothing is folded into this view — only the failure is
   * worth reporting back.
   */
  const forward = useCallback(async (messageId, toConversationId) => {
    if (!messageId || !toConversationId) return false;
    try {
      const res = await fetch("/api/chat/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: toConversationId, forwardOf: messageId }),
      });
      if (!res.ok) throw new Error("Couldn't forward that message");
      return true;
    } catch (err) {
      setError(err.message || "Couldn't forward that message");
      return false;
    }
  }, []);

  return {
    messages,
    error,
    sending,
    send,
    edit,
    remove,
    forward,
    reload: () => load({ reset: true }),
  };
}
