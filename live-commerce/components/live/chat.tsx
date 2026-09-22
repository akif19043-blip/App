"use client";

import { Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "@/lib/client";
import type { ChatMessage } from "@/types/domain";

export function ChatFeed({ messages, sellerId }: { messages: ChatMessage[]; sellerId: string }) {
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => endRef.current?.scrollIntoView({ block: "end" }), [messages.length]);

  return (
    <div
      className="no-scrollbar max-h-[26dvh] overflow-y-auto pr-16 [mask-image:linear-gradient(to_bottom,transparent,black_30%)]"
      aria-live="polite"
    >
      <div className="flex min-h-full flex-col justify-end gap-1 pt-6">
        {messages.map((m) => (
          <p key={m.id} className="text-sm leading-snug text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
            <span className={m.userId === sellerId ? "font-bold text-amber-300" : "font-bold text-white/70"}>
              {m.userName}
              {m.userId === sellerId && " ★"}
            </span>{" "}
            {m.body}
          </p>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}

export function ChatInput({ streamId, signedIn, disabled }: { streamId: string; signedIn: boolean; disabled?: boolean }) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <Link
        href={`/login?next=/live/${streamId}`}
        className="flex h-10 flex-1 items-center rounded-full bg-white/15 px-4 text-sm text-white/70 backdrop-blur"
      >
        Zaloguj się, aby pisać…
      </Link>
    );
  }

  return (
    <form
      className="flex h-10 flex-1 items-center rounded-full bg-white/15 pl-4 pr-1 backdrop-blur focus-within:bg-white/25"
      onSubmit={async (e) => {
        e.preventDefault();
        const body = text.trim();
        if (!body) return;
        setText("");
        setError(null);
        try {
          await api(`/api/streams/${streamId}/chat`, { body: { body } });
        } catch (err) {
          setText(body);
          setError(err instanceof ApiError ? err.message : "Nie wysłano.");
        }
      }}
    >
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        maxLength={280}
        disabled={disabled}
        placeholder={error ?? "Napisz coś…"}
        aria-label="Wiadomość"
        className="min-w-0 flex-1 bg-transparent text-sm text-white placeholder:text-white/60 focus:outline-none"
      />
      <button type="submit" aria-label="Wyślij" className="grid size-8 place-items-center rounded-full text-white disabled:opacity-40" disabled={!text.trim()}>
        <Send className="size-4" />
      </button>
    </form>
  );
}
