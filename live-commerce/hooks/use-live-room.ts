"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import { applyLiveEvent, roomFromSnapshot, type RoomState } from "@/lib/live/room-state";
import type { LiveEvent, RoomSnapshot } from "@/types/domain";

type Action = { type: "snapshot"; snapshot: RoomSnapshot } | { type: "event"; event: LiveEvent };

function reducer(state: RoomState, action: Action): RoomState {
  return action.type === "snapshot"
    ? roomFromSnapshot(action.snapshot, state)
    : applyLiveEvent(state, action.event);
}

export type ConnectionState = "connecting" | "live" | "reconnecting";

/**
 * Live room state: starts from the server-rendered snapshot, then follows the
 * SSE feed. On every (re)connect it refetches the snapshot, so events missed
 * while offline are never lost.
 */
export function useLiveRoom(initial: RoomSnapshot, onEvent?: (e: LiveEvent) => void) {
  const [state, dispatch] = useReducer(reducer, initial, (s) => roomFromSnapshot(s));
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const onEventRef = useRef(onEvent);
  useEffect(() => {
    onEventRef.current = onEvent;
  });
  const streamId = initial.stream.id;

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`/api/streams/${streamId}`, { cache: "no-store" });
      if (res.ok) dispatch({ type: "snapshot", snapshot: await res.json() });
    } catch {
      /* the next reconnect will retry */
    }
  }, [streamId]);

  useEffect(() => {
    const es = new EventSource(`/api/streams/${streamId}/events`);
    es.addEventListener("ready", () => {
      setConnection("live");
      void refresh();
    });
    es.onmessage = (msg) => {
      const event = JSON.parse(msg.data) as LiveEvent;
      dispatch({ type: "event", event });
      onEventRef.current?.(event);
      if (event.type === "products.changed") void refresh();
    };
    es.onerror = () => setConnection("reconnecting");
    return () => es.close();
  }, [streamId, refresh]);

  return { state, connection, refresh };
}
