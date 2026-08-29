"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@clerk/nextjs";
import { useTasks } from "@/context/TaskContext";

const ChatContext = createContext(null);

// The sidebar poll doubles as the presence heartbeat, so it runs app-wide
// rather than only on the Chat page — otherwise you would appear offline to
// everyone whenever you were looking at your tasks.
const STATE_POLL_MS = 5000;

// Which conversation the widget has open is per-device UI, so it lives in
// localStorage rather than the database.
const PANEL_KEY = "taskar:chat-panel:v1";

export function ChatProvider({ children }) {
  // Chat follows the signed-in person, not the selected team: direct messages
  // belong to the two people, so they must keep working on a personal account.
  // The active team is still watched, because switching it can change which
  // rooms and teammates you have.
  const { isSignedIn } = useAuth();
  const {
    team: { orgId },
  } = useTasks();

  const [state, setState] = useState(null); // { userId, now, members, conversations }
  // The widget is one panel: closed, showing the conversation list, or
  // showing one conversation. There is no separate window to keep track of.
  const [panelOpen, setPanelOpen] = useState(false);
  const [activeId, setActiveId] = useState(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(PANEL_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (raw) setActiveId(JSON.parse(raw).activeId ?? null);
    } catch {
      /* a corrupt value just means starting with nothing open */
    }
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) localStorage.setItem(PANEL_KEY, JSON.stringify({ activeId }));
  }, [activeId, hydrated]);

  const refresh = useCallback(async () => {
    if (!isSignedIn) return;
    try {
      const res = await fetch("/api/chat/state");
      if (!res.ok) return;
      setState(await res.json());
    } catch {
      /* a missed poll just leaves counts stale until the next one */
    }
  }, [isSignedIn]);

  // Poll only while the tab is visible — a backgrounded tab should neither
  // cost anything nor claim you are present.
  useEffect(() => {
    if (!isSignedIn) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setState(null);
      return;
    }
    let timer = null;
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const start = () => {
      if (timer) clearInterval(timer);
      timer = setInterval(tick, STATE_POLL_MS);
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

    // Load once regardless of visibility, then poll only while visible.
    refresh();
    start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // orgId is a dependency so switching teams re-reads the conversation list.
  }, [isSignedIn, orgId, refresh]);

  const markRead = useCallback(
    async (conversationId) => {
      try {
        await fetch("/api/chat/state", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversationId }),
        });
        await refresh();
      } catch {
        /* the next poll will correct the count */
      }
    },
    [refresh]
  );

  // Opening a conversation shows it inside the panel rather than spawning a
  // window beside it.
  const open = useCallback(
    (conversationId) => {
      setActiveId(conversationId);
      setPanelOpen(true);
      markRead(conversationId);
    },
    [markRead]
  );

  const togglePanel = useCallback(() => setPanelOpen((o) => !o), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  // Back to the conversation list without closing the widget.
  const back = useCallback(() => setActiveId(null), []);

  const conversations = useMemo(() => state?.conversations || [], [state]);
  const totalUnread = useMemo(
    () => conversations.reduce((sum, c) => sum + (c.unread || 0), 0),
    [conversations]
  );

  const value = useMemo(
    () => ({
      enabled: Boolean(isSignedIn),
      userId: state?.userId || null,
      serverNow: state?.now || null,
      members: state?.members || [],
      conversations,
      totalUnread,
      panelOpen,
      activeId,
      open,
      togglePanel,
      closePanel,
      back,
      markRead,
      refresh,
    }),
    [
      isSignedIn,
      state,
      conversations,
      totalUnread,
      panelOpen,
      activeId,
      open,
      togglePanel,
      closePanel,
      back,
      markRead,
      refresh,
    ]
  );

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used within a ChatProvider");
  return ctx;
}
