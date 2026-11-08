"use client";

import { useEffect, useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BuildPanel } from "@/components/build-panel";
import { CatalogPanel } from "@/components/catalog-panel";
import { ModelPanel } from "@/components/model-panel";
import { api } from "@/lib/api";
import { useCloset } from "@/lib/closet";
import { cn } from "@/lib/utils";

type Status = "checking" | "ok" | "slow" | "down";

const STRIP = ["TOPS", "BOTTOMS", "DRESSES", "OUTERWEAR", "SHOES", "BAGS", "JEWELLERY", "HATS", "SUNGLASSES", "SCARVES", "ACCESSORIES"];

const TAB = "btn-retro h-11 flex-none px-4 text-xs data-active:bg-[var(--navy)] data-active:text-white data-active:[border-color:var(--lo)_var(--hi)_var(--hi)_var(--lo)] sm:text-sm";

export default function Home() {
  const closet = useCloset();
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    const slow = setTimeout(() => setStatus((s) => (s === "checking" ? "slow" : s)), 3000);
    api.health()
      .then((h) => setStatus(h.model_loaded ? "ok" : "down"))
      .catch(() => setStatus("down"))
      .finally(() => clearTimeout(slow));
    return () => clearTimeout(slow);
  }, []);

  const label = {
    checking: "CONNECTING…",
    slow: "WAKING UP API…",
    ok: "MODEL ONLINE",
    down: "API OFFLINE",
  }[status];

  return (
    <main className="mx-auto w-full max-w-[1320px] px-2 py-4 sm:px-6 sm:py-8">
      <div className="monitor p-2 sm:p-4">
        <div className="screen flex flex-col gap-4 p-3 sm:p-5">
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="title-plate px-4 py-1.5">
              <h1 className="font-pixel text-4xl leading-none tracking-wide sm:text-5xl">★ OUTFIT LAB ★</h1>
            </div>
            <div className="lcd flex items-center gap-2 px-3 py-1 text-xl leading-none" role="status">
              <span
                className={cn(
                  "size-2.5",
                  status === "ok" && "bg-[#7dff9a]",
                  (status === "checking" || status === "slow") && "animate-pulse bg-[#ffd35c]",
                  status === "down" && "bg-[#ff6b8b]",
                )}
              />
              {label}
            </div>
          </header>

          <Tabs defaultValue="build" className="gap-4">
            <TabsList className="h-auto w-full justify-start gap-2 overflow-x-auto rounded-none bg-transparent p-0">
              <TabsTrigger value="build" className={TAB}>Dress me</TabsTrigger>
              <TabsTrigger value="catalog" className={TAB}>Closet</TabsTrigger>
              <TabsTrigger value="model" className={TAB}>Stats</TabsTrigger>
            </TabsList>
            <TabsContent value="build"><BuildPanel closet={closet} /></TabsContent>
            <TabsContent value="catalog"><CatalogPanel closet={closet} /></TabsContent>
            <TabsContent value="model"><ModelPanel /></TabsContent>
          </Tabs>
        </div>

        <div className="mt-2 overflow-hidden border-y-2 border-[#000] bg-[var(--navy)] py-1.5 sm:mt-3" aria-hidden>
          <div className="marquee-track font-display flex w-max gap-8 text-sm whitespace-nowrap text-white">
            {[...STRIP, ...STRIP, ...STRIP, ...STRIP].map((s, i) => (
              <span key={i}>{s} <span className="text-[var(--plaid)]">✦</span></span>
            ))}
          </div>
        </div>
      </div>
      <p className="font-pixel mt-3 text-center text-lg text-white [text-shadow:0_1px_2px_#000]">
        COMPATIBILITY MODEL TRAINED ON 17K REAL POLYVORE OUTFITS
      </p>
    </main>
  );
}
