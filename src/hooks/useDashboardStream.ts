import { useEffect, useRef, useState } from "react";
import { createStreamUrl, fetchDashboard } from "@/lib/api";
import { DashboardSnapshot } from "@/types/dashboard";

export type StreamStatus = "connecting" | "live" | "error";

export const useDashboardStream = (token: string | null) => {
  const [data, setData] = useState<DashboardSnapshot | null>(null);
  const [status, setStatus] = useState<StreamStatus>("connecting");
  const [lastMessageAt, setLastMessageAt] = useState<number | null>(null);
  const reconnectRef = useRef<number | null>(null);

  useEffect(() => {
    if (!token) {
      setData(null);
      setStatus("error");
      return;
    }

    let cancelled = false;
    let source: EventSource | null = null;

    const initSnapshot = async () => {
      try {
        const snapshot = await fetchDashboard(token);
        if (!cancelled) setData(snapshot);
      } catch {
        // ignored; stream may catch up
      }
    };

    const connect = () => {
      setStatus("connecting");
      source = new EventSource(createStreamUrl(token));
      source.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data) as DashboardSnapshot;
          setData(payload);
          setLastMessageAt(Date.now());
          setStatus("live");
        } catch {
          setStatus("error");
        }
      };
      source.onerror = () => {
        setStatus("error");
        source?.close();
        if (reconnectRef.current) {
          window.clearTimeout(reconnectRef.current);
        }
        reconnectRef.current = window.setTimeout(connect, 2000);
      };
    };

    initSnapshot();
    connect();

    return () => {
      cancelled = true;
      source?.close();
      if (reconnectRef.current) {
        window.clearTimeout(reconnectRef.current);
      }
    };
  }, [token]);

  return { data, status, lastMessageAt };
};
