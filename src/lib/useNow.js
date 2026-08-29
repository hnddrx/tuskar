"use client";

import { useEffect, useState } from "react";

// A ticking "now" for live durations.
//
// Returns an ISO timestamp that updates on an interval, so the time-tracking
// helpers (which all take `now` explicitly) can render a running clock
// without any of them reading the wall clock themselves.
//
// Starts null and fills in from an effect: rendering a timestamp during the
// first render would differ between the server and the client and produce a
// hydration mismatch.
export function useNow(intervalMs = 1000, active = true) {
  const [now, setNow] = useState(null);

  useEffect(() => {
    if (!active) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setNow(new Date().toISOString());
    const id = setInterval(() => setNow(new Date().toISOString()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, active]);

  return now;
}
