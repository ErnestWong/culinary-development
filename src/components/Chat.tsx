"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createClient } from "@/lib/supabase/client";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface Usage {
  input_tokens: number;
  output_tokens: number;
  cache_write_tokens: number;
  cache_read_tokens: number;
  cost_usd: number;
}

const SESSION_KEY = "culinary-session-id";

export default function Chat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [lastUsage, setLastUsage] = useState<Usage | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load existing session on mount
  useEffect(() => {
    const savedId = localStorage.getItem(SESSION_KEY);
    if (!savedId) return;
    sessionIdRef.current = savedId;

    supabase
      .from("messages")
      .select("role, content")
      .eq("session_id", savedId)
      .order("created_at", { ascending: true })
      .then(({ data }) => {
        if (data && data.length > 0) setMessages(data as Message[]);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function getOrCreateSession(): Promise<string> {
    if (sessionIdRef.current) return sessionIdRef.current;

    const { data, error } = await supabase
      .from("sessions")
      .insert({})
      .select("id")
      .single();

    if (error || !data) throw new Error("Failed to create session");

    sessionIdRef.current = data.id;
    localStorage.setItem(SESSION_KEY, data.id);
    return data.id;
  }

  async function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: "user", content: input.trim() };
    const history = [...messages, userMessage];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setIsLoading(true);

    try {
      const sessionId = await getOrCreateSession();

      await supabase.from("messages").insert({
        session_id: sessionId,
        role: "user",
        content: userMessage.content,
      });

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: history }),
      });

      if (!response.ok) throw new Error(await response.text());

      const reader = response.body!.getReader();
      const decoder = new TextDecoder();
      let assistantContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const raw = decoder.decode(value);

        const nullIdx = raw.indexOf("\x00");
        if (nullIdx !== -1) {
          const text = raw.slice(0, nullIdx);
          const usageJson = raw.slice(nullIdx + 1);
          if (text) {
            assistantContent += text;
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              return [...prev.slice(0, -1), { ...last, content: last.content + text }];
            });
          }
          try { setLastUsage(JSON.parse(usageJson)); } catch {}
        } else {
          assistantContent += raw;
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            return [...prev.slice(0, -1), { ...last, content: last.content + raw }];
          });
        }
      }

      await supabase.from("messages").insert({
        session_id: sessionId,
        role: "assistant",
        content: assistantContent,
      });
    } catch {
      setMessages((prev) => [
        ...prev.slice(0, -1),
        { role: "assistant", content: "Something went wrong. Please try again." },
      ]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  }

  async function clearSession() {
    const sessionId = sessionIdRef.current;
    if (sessionId) {
      await supabase.from("sessions").delete().eq("id", sessionId);
    }
    sessionIdRef.current = null;
    localStorage.removeItem(SESSION_KEY);
    setMessages([]);
    setLastUsage(null);
  }

  return (
    <div className="flex flex-col h-screen bg-white">
      <header className="border-b px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-gray-900">Culinary Development</h1>
          <p className="text-sm text-gray-500">Powered by Claude</p>
        </div>
        {messages.length > 0 && (
          <button
            onClick={clearSession}
            className="text-xs text-gray-400 hover:text-gray-600 transition-colors"
          >
            Clear
          </button>
        )}
      </header>

      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-gray-400 text-sm">
              Ask about recipes, techniques, substitutions, or flavor development.
            </p>
          </div>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "max-w-[75%] bg-gray-900 text-white whitespace-pre-wrap"
                  : "w-full max-w-[85%] bg-gray-100 text-gray-900"
              }`}
            >
              {msg.role === "user" ? (
                msg.content
              ) : msg.content ? (
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    h2: ({ children }) => <h2 className="text-base font-bold mt-4 mb-1 first:mt-0">{children}</h2>,
                    h3: ({ children }) => <h3 className="text-sm font-semibold mt-3 mb-0.5">{children}</h3>,
                    p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                    ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-0.5">{children}</ul>,
                    ol: ({ children }) => <ol className="list-decimal pl-4 mb-2 space-y-0.5">{children}</ol>,
                    li: ({ children }) => <li>{children}</li>,
                    strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
                    code: ({ children }) => <code className="bg-gray-200 rounded px-1 py-0.5 text-xs font-mono">{children}</code>,
                    pre: ({ children }) => <pre className="bg-gray-200 rounded p-3 text-xs font-mono overflow-x-auto mb-2">{children}</pre>,
                    table: ({ children }) => <table className="w-full text-xs border-collapse mb-2">{children}</table>,
                    th: ({ children }) => <th className="text-left border border-gray-300 px-2 py-1 bg-gray-200 font-semibold">{children}</th>,
                    td: ({ children }) => <td className="border border-gray-300 px-2 py-1">{children}</td>,
                    hr: () => <hr className="border-gray-300 my-3" />,
                  }}
                >
                  {msg.content}
                </ReactMarkdown>
              ) : isLoading && i === messages.length - 1 ? (
                <span className="inline-flex gap-1">
                  <span className="animate-bounce">·</span>
                  <span className="animate-bounce [animation-delay:150ms]">·</span>
                  <span className="animate-bounce [animation-delay:300ms]">·</span>
                </span>
              ) : null}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {lastUsage && (
        <div className="border-t px-6 py-2 flex gap-4 text-xs text-gray-400 font-mono">
          <span>in {lastUsage.input_tokens.toLocaleString()}</span>
          <span>out {lastUsage.output_tokens.toLocaleString()}</span>
          {lastUsage.cache_read_tokens > 0 && (
            <span className="text-green-500">cache hit {lastUsage.cache_read_tokens.toLocaleString()}</span>
          )}
          {lastUsage.cache_write_tokens > 0 && (
            <span className="text-blue-400">cache write {lastUsage.cache_write_tokens.toLocaleString()}</span>
          )}
          <span className="ml-auto">${lastUsage.cost_usd.toFixed(5)}</span>
        </div>
      )}

      <form onSubmit={sendMessage} className="border-t px-6 py-4 flex gap-3">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask anything culinary…"
          disabled={isLoading}
          className="flex-1 rounded-full border border-gray-200 bg-gray-50 px-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:bg-white focus:outline-none disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="rounded-full bg-gray-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </form>
    </div>
  );
}
