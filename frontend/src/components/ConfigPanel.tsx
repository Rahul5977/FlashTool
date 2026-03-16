"use client";

import { Dispatch, SetStateAction } from "react";

/* ─── Props ─────────────────────────────────────────────────────────────── */

interface Props {
  script: string;
  setScript: Dispatch<SetStateAction<string>>;
  extraPrompt: string;
  setExtraPrompt: Dispatch<SetStateAction<string>>;
  numClips: number;
  setNumClips: Dispatch<SetStateAction<number>>;
  durationLabel: string;
  setDurationLabel: Dispatch<SetStateAction<string>>;
  aspectRatio: string;
  setAspectRatio: Dispatch<SetStateAction<string>>;
  veoModel: string;
  setVeoModel: Dispatch<SetStateAction<string>>;
  languageNote: boolean;
  setLanguageNote: Dispatch<SetStateAction<boolean>>;
}

/* ─── Helpers ───────────────────────────────────────────────────────────── */

const DURATION_MAP: Record<string, number> = {
  "15s": 2,
  "30s": 4,
  "45s": 6,
  "60s": 8,
};

const ASPECT_OPTIONS = [
  "9:16 (Reels / Shorts)",
  "16:9 (YouTube / Landscape)",
];

const VEO_MODELS = [
  { label: "Veo 3.1 Preview", value: "veo-3.1-generate-preview" },
  { label: "Veo 3.0 Preview", value: "veo-3.0-generate-preview" },
];

/* ─── Component ─────────────────────────────────────────────────────────── */

export default function ConfigPanel({
  script,
  setScript,
  extraPrompt,
  setExtraPrompt,
  setNumClips,
  durationLabel,
  setDurationLabel,
  aspectRatio,
  setAspectRatio,
  veoModel,
  setVeoModel,
  languageNote,
  setLanguageNote,
}: Props) {
  const handleDurationChange = (dur: string) => {
    setDurationLabel(dur);
    setNumClips(DURATION_MAP[dur] ?? 6);
  };

  return (
    <div className="space-y-6">
      {/* ── Ad Script ────────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border p-6"
        style={{
          background: "rgba(255,255,255,0.04)",
          borderColor: "rgba(37,168,90,0.18)",
        }}
      >
        <label className="mb-2 block text-sm font-semibold text-[#7ecfa0]">
          📝 Ad Script
        </label>
        <textarea
          value={script}
          onChange={(e) => setScript(e.target.value)}
          rows={10}
          placeholder="Paste your ad script here (Hindi/English)…"
          className="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-[#25a85a]/60 focus:ring-1 focus:ring-[#25a85a]/40"
        />
      </div>

      {/* ── Settings Grid ────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border p-6"
        style={{
          background: "rgba(255,255,255,0.04)",
          borderColor: "rgba(37,168,90,0.18)",
        }}
      >
        <label className="mb-4 block text-sm font-semibold text-[#7ecfa0]">
          ⚙️ Settings
        </label>

        <div className="grid gap-4 sm:grid-cols-2">
          {/* Duration */}
          <div>
            <label className="mb-1 block text-xs text-white/60">
              Duration
            </label>
            <select
              value={durationLabel}
              onChange={(e) => handleDurationChange(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            >
              {Object.keys(DURATION_MAP).map((d) => (
                <option key={d} value={d} className="bg-[#0d2b1a]">
                  {d} ({DURATION_MAP[d]} clips)
                </option>
              ))}
            </select>
          </div>

          {/* Aspect Ratio */}
          <div>
            <label className="mb-1 block text-xs text-white/60">
              Aspect Ratio
            </label>
            <select
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            >
              {ASPECT_OPTIONS.map((a) => (
                <option key={a} value={a} className="bg-[#0d2b1a]">
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Veo Model */}
          <div>
            <label className="mb-1 block text-xs text-white/60">
              Veo Model
            </label>
            <select
              value={veoModel}
              onChange={(e) => setVeoModel(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm text-white outline-none"
            >
              {VEO_MODELS.map((m) => (
                <option key={m.value} value={m.value} className="bg-[#0d2b1a]">
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          {/* Language Note */}
          <div className="flex items-center gap-3 pt-5">
            <input
              type="checkbox"
              checked={languageNote}
              onChange={(e) => setLanguageNote(e.target.checked)}
              id="lang-note"
              className="h-4 w-4 rounded border-white/20 accent-[#25a85a]"
            />
            <label htmlFor="lang-note" className="text-xs text-white/60">
              Include dialogue tone note
            </label>
          </div>
        </div>
      </div>

      {/* ── Extra Prompt ──────────────────────────────────────────────────── */}
      <div
        className="rounded-2xl border p-6"
        style={{
          background: "rgba(255,255,255,0.04)",
          borderColor: "rgba(37,168,90,0.18)",
        }}
      >
        <label className="mb-2 block text-sm font-semibold text-[#7ecfa0]">
          📎 Additional Instructions (optional)
        </label>
        <textarea
          value={extraPrompt}
          onChange={(e) => setExtraPrompt(e.target.value)}
          rows={3}
          placeholder="Product brand guidelines, specific visual references, style notes…"
          className="w-full resize-y rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white placeholder-white/30 outline-none focus:border-[#25a85a]/60 focus:ring-1 focus:ring-[#25a85a]/40"
        />
      </div>
    </div>
  );
}
