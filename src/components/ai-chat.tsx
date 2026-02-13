"use client";

import { useState, useRef, useEffect } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import type { UnifiedSearchResult } from "@/lib/api/types";

function ToolIndicator({ part }: { part: { type: string; state: string; input?: unknown; output?: unknown } }) {
  const isLoading = part.state === "input-streaming" || part.state === "input-available";
  const input = part.input as Record<string, unknown> | undefined;
  const isDownload = input && "magnet" in input;

  // Download tool
  if (isDownload) {
    const title = input?.title as string | undefined;
    const output = part.output as { success?: boolean; message?: string } | undefined;
    const isDone = part.state === "output-available";
    const success = isDone && output?.success;

    return (
      <div className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs ${
        isDone
          ? success ? "bg-emerald-950/60 text-emerald-400" : "bg-red-950/60 text-red-400"
          : "bg-zinc-900/60 text-zinc-400"
      }`}>
        {isLoading ? (
          <span className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border border-emerald-400 border-t-transparent" />
        ) : success ? (
          <svg className="h-3 w-3 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        ) : (
          <svg className="h-3 w-3 shrink-0 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        )}
        <span className="wrap-break-word">
          {isLoading ? "Downloading" : isDone && success ? "Downloaded" : isDone ? "Failed to download" : "Downloading"}{" "}
          <span className="font-medium text-zinc-300">
            {title ?? "..."}
          </span>
        </span>
      </div>
    );
  }

  // Torrent search tool (has query but output contains torrents array, not movie results)
  const output = part.output as Record<string, unknown> | undefined;
  const isTorrentSearch = output && "torrents" in output;
  const query = input?.query as string | undefined;

  if (isTorrentSearch || (!isLoading && output && "torrents" in output)) {
    const torrents = (output as { torrents?: unknown[] })?.torrents;
    return (
      <div className="flex items-center gap-2 rounded-lg bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-400">
        {isLoading ? (
          <span className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border border-indigo-400 border-t-transparent" />
        ) : (
          <svg className="h-3 w-3 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
        <span className="wrap-break-word">
          {isLoading ? "Searching torrents for" : `Found ${torrents?.length ?? 0} torrents for`}{" "}
          <span className="font-medium text-zinc-300">
            &ldquo;{query ?? "..."}&rdquo;
          </span>
        </span>
      </div>
    );
  }

  // Movie search tool (default)
  return (
    <div className="flex items-center gap-2 rounded-lg bg-zinc-900/60 px-3 py-1.5 text-xs text-zinc-400">
      {isLoading ? (
        <span className="inline-block h-3 w-3 shrink-0 animate-spin rounded-full border border-indigo-400 border-t-transparent" />
      ) : (
        <svg className="h-3 w-3 shrink-0 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      )}
      <span className="wrap-break-word">
        {isLoading ? "Searching" : "Searched"}{" "}
        <span className="font-medium text-zinc-300">
          &ldquo;{query ?? "..."}&rdquo;
        </span>
      </span>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[90%] overflow-hidden rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? "bg-indigo-600 text-white"
            : "bg-zinc-800 text-zinc-200 ring-1 ring-zinc-700"
        }`}
      >
        {/* Render parts in document order so text streams below tool indicators */}
        {(message.parts ?? []).map((part, i) => {
          if (part.type === "text") {
            if (!part.text) return null;
            return (
              <div key={i} className="wrap-break-word whitespace-pre-wrap">
                {part.text}
              </div>
            );
          }
          if (part.type.startsWith("tool-")) {
            return (
              <div key={i} className="my-1">
                <ToolIndicator part={part as { type: string; state: string; input?: unknown; output?: unknown }} />
              </div>
            );
          }
          return null;
        })}
      </div>
    </div>
  );
}

interface AiChatProps {
  onResults?: (results: UnifiedSearchResult[]) => void;
}

function extractResultsFromMessages(messages: UIMessage[]): UnifiedSearchResult[] {
  const seen = new Set<string>();
  const results: UnifiedSearchResult[] = [];

  for (const msg of messages) {
    if (msg.role !== "assistant") continue;
    for (const part of msg.parts ?? []) {
      if (!part.type.startsWith("tool-")) continue;
      const toolPart = part as { state: string; output?: unknown };
      console.log("[AiChat] tool part state:", toolPart.state, "type:", part.type);
      if (toolPart.state === "output-available") {
        const output = toolPart.output as { results?: UnifiedSearchResult[] } | undefined;
        console.log("[AiChat] tool output:", output);
        if (!output?.results) continue;
        for (const r of output.results) {
          if (r.imdbId && !seen.has(r.imdbId)) {
            seen.add(r.imdbId);
            results.push(r);
          }
        }
      }
    }
  }

  console.log("[AiChat] extractResultsFromMessages total:", results.length);
  return results;
}

export function AiChat({ onResults }: AiChatProps) {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const { messages, sendMessage, setMessages, status, error } = useChat({
    id: "movie-librarian",
  });

  const isStreaming = status === "streaming" || status === "submitted";

  // Extract and push movie results whenever messages update
  const prevResultCountRef = useRef(0);
  useEffect(() => {
    if (!onResults) return;
    const results = extractResultsFromMessages(messages);
    if (results.length !== prevResultCountRef.current) {
      prevResultCountRef.current = results.length;
      onResults(results);
    }
  }, [messages, onResults]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const [input, setInput] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isStreaming) return;
    sendMessage({ text: trimmed });
    setInput("");
  };

  return (
    <>
      {/* Floating toggle button — hidden when chat is open on mobile */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-6 right-6 z-50 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full bg-indigo-600 text-white shadow-lg shadow-indigo-500/30 transition-all hover:bg-indigo-500 hover:shadow-xl hover:shadow-indigo-500/40"
          title="AI Movie Librarian"
        >
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09zM18.259 8.715L18 9.75l-.259-1.035a3.375 3.375 0 00-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 002.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 002.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 00-2.455 2.456zM16.894 20.567L16.5 21.75l-.394-1.183a2.25 2.25 0 00-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 001.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 001.423 1.423l1.183.394-1.183.394a2.25 2.25 0 00-1.423 1.423z" />
          </svg>
        </button>
      )}

      {/* Chat panel — full-screen on mobile, large sidebar on desktop */}
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-zinc-900 sm:inset-auto sm:bottom-4 sm:right-4 sm:h-[min(85vh,800px)] sm:w-[460px] sm:rounded-2xl sm:border sm:border-zinc-700 sm:shadow-2xl sm:shadow-black/50">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div className="flex items-center gap-2">
              <svg className="h-5 w-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
              </svg>
              <h3 className="text-sm font-semibold text-white">AI Movie Librarian</h3>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => {
                  setMessages([]);
                  prevResultCountRef.current = 0;
                  onResults?.([]);
                }}
                className="cursor-pointer rounded-md px-2 py-1 text-xs text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                title="Clear chat"
              >
                Clear
              </button>
              <button
                onClick={() => setOpen(false)}
                className="cursor-pointer rounded-md p-1.5 text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
                title="Close chat"
              >
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-4 py-4">
            {messages.length === 0 && (
              <div className="flex h-full flex-col items-center justify-center px-2 text-center">
                <svg className="mb-4 h-12 w-12 text-indigo-400/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                </svg>
                <p className="text-sm leading-relaxed text-zinc-400">
                  Hey! I&rsquo;m your AI movie and series assistant. Tell me what you&rsquo;re in the mood for and I&rsquo;ll find some great options for you.
                </p>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  Share some favorites and I&rsquo;ll suggest similar picks, or describe that movie you can&rsquo;t quite remember and I&rsquo;ll track it down.
                </p>
                <p className="mt-4 text-xs text-zinc-600">
                  Try &ldquo;Sci-fi movies like Interstellar&rdquo; or &ldquo;That 90s movie about hackers&rdquo;
                </p>
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.id} message={msg} />
            ))}

            {isStreaming && messages.length > 0 && (() => {
              const last = messages[messages.length - 1];
              const hasContent = last.parts?.some(
                (p) => (p.type === "text" && p.text.length > 0) || p.type.startsWith("tool-")
              );
              if (last.role === "assistant" && !hasContent) {
                return (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-1.5 rounded-2xl bg-zinc-800 px-4 py-2.5 ring-1 ring-zinc-700">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:0ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:150ms]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-zinc-500 [animation-delay:300ms]" />
                    </div>
                  </div>
                );
              }
              return null;
            })()}

            {error && (
              <div className="rounded-lg border border-red-800/50 bg-red-950/30 px-3 py-2 text-xs text-red-400">
                Error: {error.message}
              </div>
            )}
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="shrink-0 border-t border-zinc-800 p-3">
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about movies..."
                className="h-10 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-3 text-sm text-white placeholder-zinc-500 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                disabled={isStreaming}
              />
              <button
                type="submit"
                disabled={isStreaming || !input.trim()}
                className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-indigo-600 text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  );
}
