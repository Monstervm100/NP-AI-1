"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft, Send, Paperclip, X, Brain, Bot, User } from "lucide-react";
import Navbar from "@/components/navbar";
import { motion, AnimatePresence } from "framer-motion";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  imagePreview?: string;
  imageBase64?: string;
  imageMediaType?: string;
  imageName?: string;
}

type ApiContentBlock =
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } }
  | { type: "text"; text: string };

function toApiMessages(messages: ChatMessage[]) {
  return messages.map((m) => {
    if (m.role === "assistant") {
      return { role: "assistant" as const, content: m.text };
    }
    const content: ApiContentBlock[] = [];
    if (m.imageBase64 && m.imageMediaType) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: m.imageMediaType, data: m.imageBase64 },
      });
    }
    content.push({ type: "text", text: m.text || "Please analyze this brain scan." });
    return { role: "user" as const, content };
  });
}

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "Hello! I'm NueroScan AI — your neuroimaging assistant.\n\nYou can:\n• Ask me anything about brain anatomy or neuroimaging\n• Upload a brain scan image (PNG/JPEG) for analysis\n• Share findings you'd like a second read on\n\nHow can I help you today?",
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState<{
    preview: string;
    base64: string;
    mediaType: string;
    name: string;
  } | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingId, setStreamingId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const base64 = dataUrl.split(",")[1];
      const mediaType = file.type || "image/png";
      setPendingImage({ preview: dataUrl, base64, mediaType, name: file.name });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  }, []);

  const sendMessage = useCallback(async () => {
    const text = input.trim();
    if ((!text && !pendingImage) || isStreaming) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      text: text || "Please analyze this brain scan.",
      imagePreview: pendingImage?.preview,
      imageBase64: pendingImage?.base64,
      imageMediaType: pendingImage?.mediaType,
      imageName: pendingImage?.name,
    };

    const history = [...messages, userMsg];
    setMessages(history);
    setInput("");
    setPendingImage(null);
    if (textareaRef.current) textareaRef.current.style.height = "auto";

    const assistantId = crypto.randomUUID();
    setStreamingId(assistantId);
    setIsStreaming(true);
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", text: "" },
    ]);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: toApiMessages(history) }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? "Chat failed");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, text: m.text + chunk } : m
          )
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, text: `⚠ ${msg}` } : m
        )
      );
    } finally {
      setIsStreaming(false);
      setStreamingId(null);
    }
  }, [input, pendingImage, messages, isStreaming]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    },
    [sendMessage]
  );

  const canSend = (input.trim().length > 0 || !!pendingImage) && !isStreaming;

  return (
    <main className="bg-black min-h-screen flex flex-col">
      <Navbar />

      <div
        className="flex flex-col flex-1 max-w-3xl w-full mx-auto px-4"
        style={{ paddingTop: "72px" }}
      >
        {/* Header */}
        <div className="py-4 border-b border-[rgba(249,168,212,0.08)] flex items-center justify-between">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-white/35 hover:text-white/65 text-sm transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Home
          </Link>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#f9a8d4]/10 border border-[#f9a8d4]/25 flex items-center justify-center">
              <Brain className="w-4 h-4 text-[#f9a8d4]" />
            </div>
            <div>
              <p className="text-white text-sm font-semibold leading-none">NueroScan AI</p>
              <p className="text-white/35 text-[11px] mt-0.5">Neuroimaging assistant</p>
            </div>
            <div className="flex items-center gap-1.5 ml-1">
              <div className={`w-1.5 h-1.5 rounded-full ${isStreaming ? "bg-[#f9a8d4] animate-pulse" : "bg-emerald-400"}`} />
              <span className="text-white/35 text-xs">{isStreaming ? "Thinking…" : "Online"}</span>
            </div>
          </div>

          <Link
            href="/analyze"
            className="text-[#f9a8d4]/50 hover:text-[#f9a8d4] text-xs transition-colors"
          >
            Full analysis →
          </Link>
        </div>

        {/* Messages */}
        <div
          className="flex-1 overflow-y-auto py-6 space-y-5"
          style={{ minHeight: 0, maxHeight: "calc(100vh - 215px)" }}
        >
          <AnimatePresence initial={false}>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18 }}
                className={`flex gap-3 ${msg.role === "user" ? "flex-row-reverse" : "flex-row"}`}
              >
                {/* Avatar */}
                <div
                  className={`flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center mt-0.5 ${
                    msg.role === "assistant"
                      ? "bg-[rgba(249,168,212,0.1)] border border-[rgba(249,168,212,0.22)]"
                      : "bg-white/8 border border-white/12"
                  }`}
                >
                  {msg.role === "assistant" ? (
                    <Bot className="w-3.5 h-3.5 text-[#f9a8d4]" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-white/45" />
                  )}
                </div>

                {/* Bubble */}
                <div
                  className={`flex flex-col gap-2 max-w-[80%] ${
                    msg.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  {msg.imagePreview && (
                    <img
                      src={msg.imagePreview}
                      alt={msg.imageName ?? "scan"}
                      className="max-w-[220px] max-h-[180px] rounded-xl border border-[rgba(249,168,212,0.2)] object-cover"
                    />
                  )}

                  {(msg.text || (isStreaming && msg.id === streamingId)) && (
                    <div
                      className={`px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words ${
                        msg.role === "user"
                          ? "bg-[rgba(249,168,212,0.09)] border border-[rgba(249,168,212,0.17)] text-white/85 rounded-tr-sm"
                          : "glass-card text-white/80 rounded-tl-sm"
                      }`}
                    >
                      {msg.text}
                      {isStreaming && msg.id === streamingId && (
                        <span className="inline-block w-[2px] h-[13px] ml-0.5 bg-[#f9a8d4] animate-pulse rounded-sm align-text-bottom" />
                      )}
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="py-4 border-t border-[rgba(249,168,212,0.08)]">
          <AnimatePresence>
            {pendingImage && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="flex items-center gap-3 mb-3 overflow-hidden"
              >
                <div className="relative flex-shrink-0">
                  <img
                    src={pendingImage.preview}
                    alt="attachment"
                    className="h-12 w-12 object-cover rounded-lg border border-[rgba(249,168,212,0.25)]"
                  />
                  <button
                    onClick={() => setPendingImage(null)}
                    className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-black border border-white/20 flex items-center justify-center hover:bg-white/10"
                  >
                    <X className="w-2.5 h-2.5 text-white/55" />
                  </button>
                </div>
                <span className="text-white/35 text-xs truncate">{pendingImage.name}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="hidden"
              onChange={handleFileSelect}
            />

            <button
              onClick={() => fileInputRef.current?.click()}
              title="Attach image"
              className="flex-shrink-0 w-9 h-9 rounded-xl border border-[rgba(249,168,212,0.16)] hover:border-[rgba(249,168,212,0.35)] text-[#f9a8d4]/45 hover:text-[#f9a8d4] hover:bg-[rgba(249,168,212,0.05)] transition-all flex items-center justify-center"
            >
              <Paperclip className="w-3.5 h-3.5" />
            </button>

            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onInput={(e) => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
              }}
              placeholder="Ask about a scan, upload an image… (Enter to send, Shift+Enter for newline)"
              rows={1}
              className="flex-1 resize-none bg-[rgba(249,168,212,0.04)] border border-[rgba(249,168,212,0.13)] focus:border-[rgba(249,168,212,0.3)] rounded-xl px-4 py-2.5 text-sm text-white/85 placeholder-white/20 outline-none transition-all overflow-y-auto"
              style={{ lineHeight: "1.55", maxHeight: 128 }}
            />

            <button
              onClick={sendMessage}
              disabled={!canSend}
              className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all ${
                canSend
                  ? "bg-[#f9a8d4] text-black hover:bg-[#fbcfe8] hover:shadow-[0_0_16px_rgba(249,168,212,0.35)] active:scale-95"
                  : "bg-white/5 text-white/18 cursor-not-allowed"
              }`}
            >
              <Send className="w-3.5 h-3.5" />
            </button>
          </div>

          <p className="text-center text-white/18 text-[11px] mt-3">
            For research and educational use only · Not medical advice
          </p>
        </div>
      </div>
    </main>
  );
}
