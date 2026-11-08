"use client";

import { useEffect, useState } from "react";

/**
 * item_id -> [left, top, width, z, mirror?, photo?] in figure units (300 x 600). Built by model/make_fit.py.
 * mirror = 1: single shoe, drawn on the right foot plus a mirrored copy on the left.
 * photo = 1: background couldn't be removed; shown as a small framed snapshot.
 */
export type FitMap = Record<string, [number, number, number, number, number?, number?]>;

let cache: FitMap | null = null;
let pending: Promise<FitMap> | null = null;

function loadFit(): Promise<FitMap> {
  pending ??= fetch("/fit.json")
    .then((r) => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then((m: FitMap) => (cache = m));
  return pending;
}

export function useFit(): FitMap | null {
  const [fit, setFit] = useState<FitMap | null>(cache);
  useEffect(() => {
    if (!cache) loadFit().then(setFit);
  }, []);
  return fit;
}
