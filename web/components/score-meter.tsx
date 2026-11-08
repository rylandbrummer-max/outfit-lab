import type { ScoreResult } from "@/lib/api";
import { cn } from "@/lib/utils";

const VERDICT_COLOR: Record<ScoreResult["verdict"], string> = {
  strong: "#7dff9a",
  good: "#d6ff6b",
  weak: "#ffd35c",
  clashing: "#ff6b8b",
};

const BARS = 12;

export function ScoreMeter({
  score,
  verdict,
  compact,
}: Pick<ScoreResult, "score" | "verdict"> & { compact?: boolean }) {
  const pct = Math.round(score * 100);
  const lit = Math.round(score * BARS);
  return (
    <div className={cn("lcd px-3 py-2", compact ? "text-xl" : "text-2xl")} role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3 leading-none">
        <span className="opacity-80">COMPATIBILITY</span>
        <span className={cn("tabular-nums", compact ? "text-3xl" : "text-4xl")}>{String(pct).padStart(3, "0")}%</span>
      </div>
      <div className="mt-1.5 flex items-center gap-2">
        <div className="flex flex-1 gap-[3px]" aria-hidden>
          {Array.from({ length: BARS }).map((_, i) => (
            <span
              key={i}
              className="h-3 flex-1"
              style={{ background: i < lit ? VERDICT_COLOR[verdict] : "rgb(143 243 255 / 0.12)" }}
            />
          ))}
        </div>
        <span className="uppercase" style={{ color: VERDICT_COLOR[verdict] }}>
          {verdict}
        </span>
      </div>
    </div>
  );
}

export function LcdMessage({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("lcd px-3 py-2 text-xl leading-tight", className)}>{children}</div>;
}

export function ImpactNote({ impact }: { impact?: number | null }) {
  if (impact === null || impact === undefined) return null;
  const pts = Math.round(impact * 100);
  const cls = pts > 1 ? "text-emerald-700" : pts < -1 ? "text-rose-700" : "text-[var(--lo)]";
  const label = pts > 1 ? `HELPS +${pts}` : pts < -1 ? `HURTS ${pts}` : "NEUTRAL";
  return (
    <span className={`font-pixel text-base leading-none ${cls}`} title="Change in score if this item is removed">
      {label}
    </span>
  );
}
