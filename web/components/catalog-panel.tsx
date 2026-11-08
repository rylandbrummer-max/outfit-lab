"use client";

import { useEffect, useState } from "react";
import { Check, Heart, Search, X } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { ItemTile } from "@/components/item-tile";
import { Mannequin } from "@/components/mannequin";
import { ImpactNote, ScoreMeter } from "@/components/score-meter";
import { api, CATEGORIES, COLORS, type Item, type ScoreResult } from "@/lib/api";
import type { useCloset } from "@/lib/closet";
import { cn } from "@/lib/utils";

const PAGE = 48;

export function CatalogPanel({ closet }: { closet: ReturnType<typeof useCloset> }) {
  const [category, setCategory] = useState<string>("tops");
  const [color, setColor] = useState<string>("");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [showCloset, setShowCloset] = useState(false);
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const filterKey = `${category}|${color}|${q}`;
  const loading = loadingMore || (loadedKey !== filterKey && !error);

  const [picked, setPicked] = useState<Item[]>([]);
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [scoring, setScoring] = useState(false);
  const [scoreError, setScoreError] = useState<string | null>(null);

  // first page: refetch whenever the filters change
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (showCloset) return;
    let cancelled = false;
    api.catalog({ category, color, q, limit: PAGE, offset: 0 })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items);
        setTotal(res.total);
        setError(null);
        setLoadedKey(`${category}|${color}|${q}`);
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [category, color, q, showCloset, retry]);

  const reload = () => {
    setError(null);
    setRetry((n) => n + 1);
  };

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const res = await api.catalog({ category, color, q, limit: PAGE, offset: items.length });
      setItems((cur) => [...cur, ...res.items]);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 300);
    return () => clearTimeout(t);
  }, [query]);

  const togglePick = (it: Item) => {
    setScore(null);
    setPicked((cur) =>
      cur.some((p) => p.item_id === it.item_id)
        ? cur.filter((p) => p.item_id !== it.item_id)
        : cur.length >= 16 ? cur : [...cur, it],
    );
  };

  const runScore = async () => {
    setScoring(true);
    setScoreError(null);
    try {
      setScore(await api.score(picked.map((p) => p.item_id)));
    } catch (e) {
      setScoreError((e as Error).message);
    } finally {
      setScoring(false);
    }
  };

  const shown = showCloset ? closet.items : items;
  const isPicked = (id: string) => picked.some((p) => p.item_id === id);
  const impactOf = (id: string) => score?.items.find((i) => i.item_id === id)?.impact;

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Category">
          <FilterChip active={showCloset} onClick={() => setShowCloset(true)}>
            <Heart className="size-3" /> My closet ({closet.items.length})
          </FilterChip>
          {CATEGORIES.map((c) => (
            <FilterChip key={c} active={!showCloset && category === c}
              onClick={() => { setShowCloset(false); setCategory(c); }}>
              {c}
            </FilterChip>
          ))}
        </div>

        {!showCloset && (
          <div className="bevel flex flex-wrap items-center gap-2 p-2">
            <div className="relative w-full sm:w-64">
              <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-[var(--lo)]" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search, e.g. denim"
                className="bevel-in h-9 rounded-none pl-8" maxLength={50} aria-label="Search item names" />
            </div>
            <div className="flex flex-wrap gap-1" role="group" aria-label="Color filter">
              {COLORS.map((c) => (
                <button key={c.id} type="button" title={c.id} aria-label={`Filter ${c.id}`}
                  aria-pressed={color === c.id}
                  onClick={() => setColor((cur) => (cur === c.id ? "" : c.id))}
                  className={cn("size-7 border-3 transition",
                    color === c.id ? "border-[var(--navy)] scale-110" : "border-white")}
                  style={{ background: c.hex }} />
              ))}
            </div>
            <span className="font-pixel ml-auto text-xl leading-none">
              {loading && items.length === 0 ? "LOADING…" : `${total} ITEMS`}
            </span>
          </div>
        )}

        {error && (
          <Alert variant="destructive" className="rounded-none border-2 border-rose-700 bg-rose-50">
            <AlertTitle className="font-display uppercase">Couldn&apos;t load the catalog</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center gap-2">
              {error}
              <Button size="sm" className="btn-retro" onClick={reload}>Retry</Button>
            </AlertDescription>
          </Alert>
        )}

        {showCloset && closet.items.length === 0 && (
          <p className="lcd p-8 text-center text-2xl">YOUR CLOSET IS EMPTY. TAP ♥ ON ANY ITEM TO SAVE IT.</p>
        )}

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
          {shown.map((it) => (
            <ItemTile key={it.item_id} item={it} selected={isPicked(it.item_id)} onClick={() => togglePick(it)}
              actions={
                <Button size="icon-sm" className="btn-retro size-7"
                  aria-label={closet.has(it.item_id) ? "Remove from closet" : "Save to closet"}
                  onClick={(e) => { e.stopPropagation(); closet.toggle(it); }}>
                  <Heart className={cn(closet.has(it.item_id) && "fill-[var(--hotpink)] text-[var(--hotpink)]")} />
                </Button>
              }
              footer={isPicked(it.item_id) ? (
                <span className="font-pixel mt-auto flex items-center gap-1 pt-0.5 text-base leading-none text-[var(--hotpink)]">
                  <Check className="size-3" /> TRYING ON
                </span>
              ) : null}
            />
          ))}
          {loading && !showCloset &&
            Array.from({ length: items.length ? 5 : 15 }).map((_, i) => (
              <Skeleton key={i} className="bevel aspect-[3/4] w-full rounded-none" />
            ))}
        </div>

        {!showCloset && !loading && items.length < total && (
          <Button className="btn-retro self-center px-6" onClick={loadMore}>Load more</Button>
        )}
      </div>

      <aside className="h-fit lg:sticky lg:top-4" aria-label="Try on and score">
        <div className="bevel flex flex-col gap-3 p-3">
          <h2 className="title-plate font-pixel self-start px-3 py-0.5 text-2xl leading-none">TRY IT ON</h2>
          <p className="font-pixel text-lg leading-tight text-[var(--lo)]">CLICK ITEMS TO ADD THEM (2–16).</p>
          <div className="bevel-in stage p-1.5">
            <Mannequin items={picked} className="max-w-[200px]" />
          </div>
          {picked.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {picked.map((p) => (
                <li key={p.item_id} className="flex items-center gap-2 text-xs">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={p.image} alt="" className="bevel-in size-9 object-contain" />
                  <span className="min-w-0 flex-1 truncate" title={p.name}>{p.name}</span>
                  <ImpactNote impact={impactOf(p.item_id)} />
                  <Button size="icon-xs" className="btn-retro size-6" onClick={() => togglePick(p)} aria-label="Remove">
                    <X />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex gap-2">
            <Button className="btn-retro btn-hot h-11 flex-1" disabled={picked.length < 2 || scoring} onClick={runScore}>
              {scoring ? "Scoring…" : "Rate my outfit"}
            </Button>
            {picked.length > 0 && (
              <Button className="btn-retro h-11" onClick={() => { setPicked([]); setScore(null); }}>Clear</Button>
            )}
          </div>
          {scoreError && (
            <Alert variant="destructive" className="rounded-none border-2 border-rose-700 bg-rose-50">
              <AlertDescription>{scoreError}</AlertDescription>
            </Alert>
          )}
          {score && <ScoreMeter score={score.score} verdict={score.verdict} compact />}
        </div>
      </aside>
    </div>
  );
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} data-on={active} aria-pressed={active}
      className="btn-retro flex items-center gap-1 px-2.5 py-1.5 text-[10px]">
      {children}
    </button>
  );
}
