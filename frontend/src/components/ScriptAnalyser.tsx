"use client";

import { Dispatch, SetStateAction, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface Props {
  productionBrief: string;
  improvedScript: string;
  setImprovedScript: Dispatch<SetStateAction<string>>;
  loading: boolean;
  onConfirm: (approvedScript: string) => void;
  onBack: () => void;
}

export default function ScriptAnalyser({
  productionBrief,
  improvedScript,
  setImprovedScript,
  loading,
  onConfirm,
  onBack,
}: Props) {
  const [briefOpen, setBriefOpen] = useState(true);

  return (
    <div className="space-y-6">
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white">
            🔍 Step 0 — Script Analysis &amp; Rewrite
          </h2>
          <p className="mt-1 text-sm text-white/60">
            Review the production brief and the improved script. Edit freely, then build clip prompts.
          </p>
        </div>
        <button
          onClick={onBack}
          className="rounded-lg border border-white/15 px-4 py-2 text-sm text-white/60 transition hover:bg-white/5 hover:text-white"
        >
          ← Back
        </button>
      </div>

      {/* ── Production Brief ────────────────────────────────────────────── */}
      {productionBrief && (
        <div
          className="rounded-2xl border overflow-hidden"
          style={{
            background: "rgba(234,179,8,0.06)",
            borderColor: "rgba(234,179,8,0.3)",
          }}
        >
          <button
            onClick={() => setBriefOpen((o) => !o)}
            className="w-full flex items-center justify-between px-5 py-4 text-left transition hover:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <span className="text-xl">📋</span>
              <div>
                <p className="text-sm font-semibold text-yellow-300">Production Brief</p>
                <p className="text-xs text-white/45">
                  Hook · Register · Arc · Word counts · Director notes
                </p>
              </div>
            </div>
            <span className="text-white/40 text-sm select-none">{briefOpen ? "▲" : "▼"}</span>
          </button>

          <AnimatePresence initial={false}>
            {briefOpen && (
              <motion.div
                key="brief"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: "hidden" }}
              >
                <pre
                  className="px-5 pb-5 text-xs leading-relaxed whitespace-pre-wrap font-mono"
                  style={{ color: "rgba(253,224,71,0.85)" }}
                >
                  {productionBrief}
                </pre>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* ── Improved Script ─────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border p-5 space-y-3"
        style={{
          background: "rgba(255,255,255,0.04)",
          borderColor: "rgba(37,168,90,0.25)",
        }}
      >
        <div className="flex items-center gap-2 mb-1">
          <span className="text-lg">✏️</span>
          <div>
            <p className="text-sm font-semibold text-[#7ecfa0]">Improved Script</p>
            <p className="text-xs text-white/45">
              Single character · Coach dialogue converted to quotes · Register &amp; word counts fixed.
              Edit before building prompts.
            </p>
          </div>
        </div>

        {/* Single-character notice */}
        <div
          className="rounded-xl px-4 py-2.5 text-xs flex items-start gap-2"
          style={{
            background: "rgba(37,168,90,0.08)",
            borderLeft: "3px solid rgba(37,168,90,0.5)",
          }}
        >
          <span>ℹ️</span>
          <span className="text-white/60">
            Any coach dialogue has been converted to quoted speech —
            e.g. <span className="text-[#7ecfa0]">&quot;Coach Rashmi ne bola, &apos;sab band karo...&apos;&quot;</span>.
            Only one character appears on screen throughout.
          </span>
        </div>

        <textarea
          value={improvedScript}
          onChange={(e) => setImprovedScript(e.target.value)}
          rows={20}
          className="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-mono text-sm leading-relaxed text-white/85 outline-none focus:border-[#25a85a]/60 focus:ring-1 focus:ring-[#25a85a]/40"
          placeholder="Improved script will appear here…"
        />
      </div>

      {/* ── Action ──────────────────────────────────────────────────────── */}
      <div className="flex justify-center">
        <button
          onClick={() => onConfirm(improvedScript)}
          disabled={loading || !improvedScript.trim()}
          className="rounded-xl px-12 py-4 text-lg font-bold text-white transition-all hover:opacity-90 hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          style={{ background: "linear-gradient(90deg, #1a7a3c, #25a85a)" }}
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Building clip prompts…
            </span>
          ) : "🎬  Build Clip Prompts"}
        </button>
      </div>
    </div>
  );
}
