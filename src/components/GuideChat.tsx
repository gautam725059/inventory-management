"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import Link from "next/link";
import { useMe } from "@/lib/useMe";
import { GUIDES, searchGuides, type Guide } from "@/lib/guides";

type Msg =
  | { from: "user"; text: string }
  | { from: "bot"; guide: Guide; more?: Guide[] }
  | { from: "bot-empty"; text: string };

const CATEGORY_ORDER: Guide["category"][] = [
  "Daily",
  "Orders",
  "Setup",
  "Account",
  "Admin",
];

/** Reusable offline guide chat. Used full-page (/help) and inside the floating
 *  panel. `onNavigate` lets the panel close itself when a link is followed. */
export default function GuideChat({ onNavigate }: { onNavigate?: () => void }) {
  const { me } = useMe();
  const isAdmin = me?.role === "admin";

  // Staff shouldn't be shown admin-only flows.
  const visible = useMemo(
    () => GUIDES.filter((g) => !g.adminOnly || isAdmin),
    [isAdmin]
  );
  const visibleIds = useMemo(() => new Set(visible.map((g) => g.id)), [visible]);

  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function answer(query: string) {
    const text = query.trim();
    if (!text) return;
    const hits = searchGuides(text).filter((g) => visibleIds.has(g.id));
    setMessages((m) => [
      ...m,
      { from: "user", text },
      hits.length === 0
        ? {
            from: "bot-empty",
            text: "Iska matlab samajh nahi aaya. Neeche diye topics me se koi chuno, ya alag shabdon me poochho (jaise \"maal andar\", \"bahar bhejna\", \"kisne kiya\").",
          }
        : { from: "bot", guide: hits[0], more: hits.slice(1, 4) },
    ]);
    setInput("");
  }

  function openGuide(g: Guide) {
    setMessages((m) => [
      ...m,
      { from: "user", text: g.title },
      { from: "bot", guide: g, more: [] },
    ]);
  }

  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    items: visible.filter((g) => g.category === cat),
  })).filter((x) => x.items.length > 0);

  return (
    <div className="flex h-full flex-col">
      {/* Conversation */}
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {messages.length === 0 && (
          <BotBubble>
            <p className="text-sm text-slate-700">
              Namaste! 👋 Main is app ka guide hoon. Neeche kisi topic pe click
              karo, ya apna sawaal type karo.
            </p>
          </BotBubble>
        )}

        {messages.map((m, i) =>
          m.from === "user" ? (
            <div key={i} className="flex justify-end">
              <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-brand-600 px-4 py-2.5 text-sm text-white shadow-sm">
                {m.text}
              </div>
            </div>
          ) : m.from === "bot-empty" ? (
            <BotBubble key={i}>
              <p className="text-sm text-slate-700">{m.text}</p>
            </BotBubble>
          ) : (
            <BotBubble key={i}>
              <GuideAnswer guide={m.guide} onNavigate={onNavigate} />
              {m.more && m.more.length > 0 && (
                <div className="mt-3 border-t border-slate-100 pt-3">
                  <p className="mb-2 text-xs font-medium text-slate-400">
                    Ye bhi shayad kaam ka ho:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {m.more.map((g) => (
                      <Chip key={g.id} onClick={() => openGuide(g)}>
                        {g.icon} {g.title.split(" — ")[0]}
                      </Chip>
                    ))}
                  </div>
                </div>
              )}
            </BotBubble>
          )
        )}
        <div ref={endRef} />
      </div>

      {/* Topics */}
      <div className="mt-3 max-h-44 shrink-0 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Topics
        </p>
        <div className="space-y-2.5">
          {grouped.map(({ cat, items }) => (
            <div key={cat}>
              <p className="mb-1.5 text-xs font-medium text-slate-500">{cat}</p>
              <div className="flex flex-wrap gap-2">
                {items.map((g) => (
                  <Chip key={g.id} onClick={() => openGuide(g)}>
                    {g.icon} {g.title.split(" — ")[0]}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Ask box */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          answer(input);
        }}
        className="mt-3 flex shrink-0 gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Sawaal likho… jaise: stock in kaise kare?"
          className="flex-1 rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm outline-none transition focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        <button
          type="submit"
          className="rounded-xl bg-brand-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-brand-700 disabled:opacity-50"
          disabled={!input.trim()}
        >
          Poochho
        </button>
      </form>
    </div>
  );
}

function BotBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-base">
        📖
      </span>
      <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 shadow-sm">
        {children}
      </div>
    </div>
  );
}

function GuideAnswer({
  guide,
  onNavigate,
}: {
  guide: Guide;
  onNavigate?: () => void;
}) {
  return (
    <div>
      <h3 className="flex items-center gap-2 text-sm font-bold text-slate-900">
        <span className="text-base">{guide.icon}</span>
        {guide.title}
      </h3>
      {guide.intro && (
        <p className="mt-1.5 text-sm text-slate-600">{guide.intro}</p>
      )}
      <ol className="mt-2.5 space-y-1.5">
        {guide.steps.map((s, i) => (
          <li key={i} className="flex gap-2.5 text-sm text-slate-700">
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700">
              {i + 1}
            </span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      {guide.note && (
        <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          💡 {guide.note}
        </p>
      )}
      {guide.links && guide.links.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {guide.links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={onNavigate}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-brand-700"
            >
              {l.label} →
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  children,
  onClick,
}: {
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm transition hover:border-brand-400 hover:bg-brand-50 hover:text-brand-700"
    >
      {children}
    </button>
  );
}
