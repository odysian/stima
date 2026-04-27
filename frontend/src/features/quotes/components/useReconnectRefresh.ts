import { useEffect, useRef, useState } from "react";

const RECONNECT_REFRESH_DEBOUNCE_MS = 1_500;

interface UseReconnectRefreshResult {
  isOnline: boolean;
  reconnectTick: number;
}

export function useReconnectRefresh(onReconnect: () => Promise<void>): UseReconnectRefreshResult {
  const [isOnline, setIsOnline] = useState(typeof navigator === "undefined" ? true : navigator.onLine);
  const [reconnectTick, setReconnectTick] = useState(0);
  const lastOnlineRef = useRef(typeof navigator === "undefined" ? true : navigator.onLine);
  const lastReconnectRefreshAtRef = useRef(0);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    function onOnlineChange(): void {
      const currentlyOnline = window.navigator.onLine;
      const now = Date.now();
      const wasOnline = lastOnlineRef.current;

      setIsOnline(currentlyOnline);
      lastOnlineRef.current = currentlyOnline;

      if (
        currentlyOnline
        && !wasOnline
        && now - lastReconnectRefreshAtRef.current >= RECONNECT_REFRESH_DEBOUNCE_MS
      ) {
        lastReconnectRefreshAtRef.current = now;
        setReconnectTick((current) => current + 1);
        void onReconnect();
      }
    }

    window.addEventListener("online", onOnlineChange);
    window.addEventListener("offline", onOnlineChange);

    return () => {
      window.removeEventListener("online", onOnlineChange);
      window.removeEventListener("offline", onOnlineChange);
    };
  }, [onReconnect]);

  return { isOnline, reconnectTick };
}
