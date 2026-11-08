"use client";

import { useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Lock, LockOpen, Shuffle, Sparkles } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Mannequin } from "@/components/mannequin";
import { ImpactNote, LcdMessage, ScoreMeter } from "@/components/score-meter";
import {
  api, COLORS, SLOT_CATEGORY, SLOTS,
  type ColorFamily, type Item, type ScoreResult, type Slot,
} from "@/lib/api";
import type { useCloset } from "@/lib/closet";
import { cn } from "@/lib/utils";

const DEFAULT_SLOTS: Slot[] = ["top", "bottom", "shoes", "bag", "jewellery"];

export function BuildPanel({ closet }: { closet: ReturnType<typeof useCloset> }) {
  const [slots, setSlots] = useState<Slot[]>(DEFAULT_SLOTS);
  const [avoid, setAvoid] = useState<ColorFamily[]>([]);
  const [style, setStyle] = useState(0);
  const [closetOnly, setClosetOnly] = useState(false);
  const [locked, setLocked] = useState<string[]>([]);
  const [result, setResult] = useState<ScoreResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [swapping, setSwapping] = useState<Slot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pools = useRef(new Map<string, Item[]>());

  const toggleSlot = (s: Slot) => {
    setSlots((cur) => {
      if (cur.includes(s)) return cur.filter((x) => x !== s);
      if (s === "dress") return [...cur.filter((x) => x !== "top" && x !== "bottom"), s];
      if (s === "top" || s === "bottom") return [...cur.filter((x) => x !== "dress"), s];
      return [...cur, s];
    });
  };

  const closetIds = closetOnly ? closet.items.map((i) => i.item_id) : null;

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      const keep = locked.filter((id) => result?.items.some((i) => i.item_id === id));
      const res = await api.build({
        slots: SLOTS.filter((s) => slots.includes(s)),
        locked_ids: keep,
        avoid_colors: avoid,
        style,
        closet_ids: closetIds,
        seed: Math.floor(Math.random() * 1e9),
      });
      setResult(res);
      setLocked(keep);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  /** ◀ / ▶ on a garment: step through that slot's items, then re-score. */
  const swap = async (slot: Slot, dir: 1 | -1) => {
    if (!result) return;
    setSwapping(slot);
    setError(null);
    try {
      const category = SLOT_CATEGORY[slot];
      let pool: Item[];
      if (closetOnly) {
        pool = closet.items.filter((i) => i.category === category);
      } else {
        if (!pools.current.has(category)) {
          pools.current.set(category, (await api.catalog({ category, limit: 300 })).items);
        }
        pool = pools.current.get(category)!;
      }
      const others = new Set(result.items.filter((i) => i.slot !== slot).map((i) => i.item_id));
      pool = pool.filter((i) => !avoid.includes(i.color_family) && !others.has(i.item_id));
      const current = result.items.find((i) => i.slot === slot);
      if (pool.length < 2) throw new Error(`No other ${slot} options with these settings.`);
      const at = pool.findIndex((i) => i.item_id === current?.item_id);
      const next = pool[(at + dir + pool.length) % pool.length];
      const ids = result.items.map((i) => (i.slot === slot ? next.item_id : i.item_id));
      const res = await api.score(ids);
      setResult({ ...res, notes: [] });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSwapping(null);
    }
  };

  const toggleLock = (id: string) =>
    setLocked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const closetTooSmall = closetOnly && closet.items.length < 2;
  const busy = loading || swapping !== null;
  const rackSlots: Slot[] = result
    ? result.items.map((i) => i.slot)
    : SLOTS.filter((s) => slots.includes(s));

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,300px)] xl:grid-cols-[300px_minmax(0,1fr)_290px]">
      {/* ---- garment rack ---- */}
      <section className="order-3 flex flex-col gap-3 lg:col-span-2 xl:order-1 xl:col-span-1" aria-label="Outfit pieces">
        <h2 className="title-plate font-pixel self-start px-3 py-0.5 text-2xl leading-none">THE RACK</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:max-h-[700px] xl:grid-cols-1 xl:overflow-y-auto xl:pr-1">
          {rackSlots.map((slot) => {
            const it = result?.items.find((i) => i.slot === slot);
            const isLocked = it ? locked.includes(it.item_id) : false;
            return (
              <div key={slot} className={cn("bevel p-1.5", isLocked && "outline-3 outline-[var(--hotpink)]")}>
                <div className="flex items-center justify-between px-0.5 pb-1">
                  <span className="font-pixel text-xl leading-none uppercase">{slot}</span>
                  {it && <ImpactNote impact={it.impact} />}
                </div>
                <div className="bevel-in relative flex aspect-[5/3] items-center justify-center">
                  {it ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={it.image}
                      alt={it.name}
                      className={cn("h-full w-full object-contain p-1.5", swapping === slot && "opacity-40")}
                    />
                  ) : (
                    <span className="font-pixel text-lg text-[var(--lo)]">— EMPTY —</span>
                  )}
                </div>
                {it && (
                  <p className="truncate px-0.5 pt-1 text-[11px] font-medium" title={it.name}>{it.name}</p>
                )}
                <div className="mt-1.5 grid grid-cols-3 gap-1">
                  <Button className="btn-retro h-8" disabled={!it || busy || isLocked}
                    onClick={() => swap(slot, -1)} aria-label={`Previous ${slot}`}>
                    <ChevronLeft />
                  </Button>
                  <Button className="btn-retro h-8" data-on={isLocked} disabled={!it}
                    onClick={() => it && toggleLock(it.item_id)} aria-label={isLocked ? `Unlock ${slot}` : `Lock ${slot}`}>
                    {isLocked ? <Lock /> : <LockOpen />}
                  </Button>
                  <Button className="btn-retro h-8" disabled={!it || busy || isLocked}
                    onClick={() => swap(slot, 1)} aria-label={`Next ${slot}`}>
                    <ChevronRight />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ---- the figure ---- */}
      <section className="order-1 flex flex-col gap-3 xl:order-2" aria-label="Outfit preview">
        {result ? (
          <ScoreMeter score={result.score} verdict={result.verdict} />
        ) : (
          <LcdMessage>{loading ? "STYLING… PLEASE HOLD" : "READY. PRESS “DRESS ME” TO BEGIN_"}</LcdMessage>
        )}
        <div className="bevel-in stage p-2">
          <Mannequin items={result?.items ?? []} dim={loading} className="max-w-[300px]" />
        </div>
        {error && (
          <Alert variant="destructive" className="rounded-none border-2 border-rose-700 bg-rose-50">
            <AlertTitle className="font-display uppercase">Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        {result?.notes?.map((n) => (
          <p key={n} className="font-pixel text-lg text-amber-800">{n}</p>
        ))}
      </section>

      {/* ---- controls ---- */}
      <section className="order-2 xl:order-3" aria-label="Style settings">
        <div className="bevel flex flex-col gap-5 p-3">
          <h2 className="title-plate font-pixel self-start px-3 py-0.5 text-2xl leading-none">STYLE SETTINGS</h2>

          <div className="flex flex-col gap-2">
            <Label className="font-display text-xs uppercase">Pieces</Label>
            <div className="flex flex-wrap gap-1.5">
              {SLOTS.map((s) => (
                <button key={s} type="button" onClick={() => toggleSlot(s)} data-on={slots.includes(s)}
                  className="btn-retro px-2 py-1 text-[10px]">
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="font-display text-xs uppercase">Color mood</Label>
              <span className="font-pixel text-lg leading-none">
                {style === 0 ? "MODEL'S PICK" : style < 0 ? "MATCHING" : "BOLD"}
              </span>
            </div>
            <div className="bevel-in px-3 py-3">
              <Slider min={-1} max={1} step={0.1} value={style}
                onValueChange={(v) => setStyle(Array.isArray(v) ? v[0] : v)} aria-label="Color mood" />
            </div>
            <div className="font-pixel flex justify-between text-base leading-none text-[var(--lo)]">
              <span>MATCHING</span><span>BOLD CONTRAST</span>
            </div>
          </div>

          <div className="flex flex-col gap-2">
            <Label className="font-display text-xs uppercase">No thanks to…</Label>
            <div className="flex flex-wrap gap-1.5">
              {COLORS.map((c) => {
                const on = avoid.includes(c.id);
                return (
                  <button key={c.id} type="button" data-on={on}
                    onClick={() => setAvoid((cur) => (on ? cur.filter((x) => x !== c.id) : [...cur, c.id]))}
                    className={cn("btn-retro flex items-center gap-1.5 px-2 py-1 text-[10px]", on && "line-through")}>
                    <span className="size-2.5 border border-[var(--navy)]" style={{ background: c.hex }} />
                    {c.id}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Checkbox id="closet-only" checked={closetOnly} onCheckedChange={(v) => setClosetOnly(Boolean(v))}
              className="rounded-none border-2 border-[var(--navy)] bg-white" />
            <div className="grid gap-0.5">
              <Label htmlFor="closet-only" className="font-display text-xs uppercase">Only my closet</Label>
              <p className="font-pixel text-base leading-tight text-[var(--lo)]">
                {closet.items.length} SAVED PIECE{closet.items.length === 1 ? "" : "S"} · ADD MORE IN “CLOSET”
              </p>
            </div>
          </div>

          <Button className="btn-retro btn-hot h-14 text-base" onClick={run}
            disabled={busy || slots.length === 0 || closetTooSmall}>
            {result ? <Shuffle /> : <Sparkles />}
            {loading ? "Styling…" : result ? (locked.length ? "Mix unlocked" : "Dress me again") : "Dress me"}
          </Button>
          {closetTooSmall && (
            <p className="font-pixel -mt-3 text-base text-[var(--lo)]">SAVE AT LEAST 2 PIECES TO YOUR CLOSET FIRST.</p>
          )}
          <p className="text-[11px] leading-snug text-[var(--lo)]">
            Only the compatibility score comes from the model. Pieces, color mood and filters are hand-set controls.
          </p>
        </div>
      </section>
    </div>
  );
}
