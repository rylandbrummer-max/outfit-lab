"use client";

import { useCallback, useSyncExternalStore } from "react";
import type { Item } from "./api";

const KEY = "outfit-lab-closet-v1";
const EMPTY: Item[] = [];
const listeners = new Set<() => void>();
let cache: Item[] | null = null;

function snapshot(): Item[] {
  if (cache === null) {
    try {
      cache = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    } catch {
      cache = [];
    }
  }
  return cache!;
}

function write(next: Item[]) {
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: closet just won't persist */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The user's closet lives only in this browser (localStorage). */
export function useCloset() {
  const items = useSyncExternalStore(subscribe, snapshot, () => EMPTY);
  const has = useCallback((id: string) => items.some((i) => i.item_id === id), [items]);
  const toggle = useCallback(
    (item: Item) => {
      const clean = { ...item };
      delete clean.impact;
      write(has(item.item_id) ? items.filter((i) => i.item_id !== item.item_id) : [...items, clean]);
    },
    [items, has],
  );
  const clear = useCallback(() => write([]), []);
  return { items, has, toggle, clear };
}
