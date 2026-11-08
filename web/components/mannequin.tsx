"use client";

import type { CSSProperties } from "react";
import { cutoutUrl, type Item, type Slot } from "@/lib/api";
import { useFit } from "@/lib/fit";
import { cn } from "@/lib/utils";

/**
 * Paper-doll dress-up. Each cut-out is placed using public/fit.json (measured per item by
 * model/make_fit.py so the garment lines up with the figure); ZONES is the fallback box per slot.
 * Pure layout, no model involved.
 */
type Zone = { top: number; left: number; width: number; height: number; z: number; anchor: string };

const ZONES: Record<Slot, Zone> = {
  bottom:     { top: 44,  left: 32, width: 36, height: 45, z: 2, anchor: "top" },
  shoes:      { top: 89,  left: 31, width: 38, height: 10, z: 3, anchor: "bottom" },
  top:        { top: 16.5, left: 27, width: 46, height: 32, z: 4, anchor: "top" },
  dress:      { top: 16.5, left: 25, width: 50, height: 62, z: 4, anchor: "top" },
  outerwear:  { top: 15.5, left: 21, width: 58, height: 38, z: 5, anchor: "top" },
  scarf:      { top: 13.5, left: 37, width: 26, height: 16, z: 6, anchor: "top" },
  jewellery:  { top: 14.5, left: 42, width: 16, height: 8,  z: 7, anchor: "top" },
  bag:        { top: 46,  left: 72, width: 27, height: 19, z: 8, anchor: "top" },
  accessory:  { top: 50,  left: 1,  width: 22, height: 12, z: 8, anchor: "top" },
  sunglasses: { top: 6.6, left: 40, width: 20, height: 4.6, z: 9, anchor: "center" },
  hat:        { top: 0,   left: 33, width: 34, height: 9.5, z: 10, anchor: "bottom" },
};

const SKIN = "#efcfb1";
const LINE = "#13205a";

function Figure() {
  return (
    <svg viewBox="0 0 300 600" className="absolute inset-0 h-full w-full" aria-hidden>
      <g stroke={LINE} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" strokeOpacity="0.55">
        {/* hair back */}
        <path d="M118 52 Q118 14 150 14 Q182 14 182 52 L186 92 Q170 100 150 98 Q130 100 114 92 Z" fill="#6b4a2b" />
        {/* arms */}
        <path d="M108 112 Q92 120 88 160 L74 250 Q70 286 64 318 L74 322 Q84 290 90 258 L110 170 Z" fill={SKIN} />
        <path d="M192 112 Q208 120 212 160 L226 250 Q230 286 236 318 L226 322 Q216 290 210 258 L190 170 Z" fill={SKIN} />
        <ellipse cx="68" cy="328" rx="8" ry="11" fill={SKIN} />
        <ellipse cx="232" cy="328" rx="8" ry="11" fill={SKIN} />
        {/* legs */}
        <path d="M122 290 Q118 400 126 470 L130 540 L146 540 L148 470 Q152 400 150 300 Z" fill={SKIN} />
        <path d="M178 290 Q182 400 174 470 L170 540 L154 540 L152 470 Q148 400 150 300 Z" fill={SKIN} />
        <path d="M126 540 L148 540 L150 556 Q138 562 120 558 Z" fill={SKIN} />
        <path d="M174 540 L152 540 L150 556 Q162 562 180 558 Z" fill={SKIN} />
        {/* neck + head */}
        <path d="M140 78 L160 78 L162 104 L138 104 Z" fill={SKIN} />
        <ellipse cx="150" cy="56" rx="25" ry="30" fill={SKIN} />
        {/* bodysuit (base layer) */}
        <path
          d="M110 108 Q150 98 190 108 Q200 116 196 140 L184 214 Q180 240 186 270 Q190 296 178 304 L150 310 L122 304 Q110 296 114 270 Q120 240 116 214 L104 140 Q100 116 110 108 Z"
          fill="#f4f6fb"
        />
        {/* hair front */}
        <path d="M125 44 Q132 22 150 22 Q170 22 176 44 Q162 34 150 36 Q136 36 125 44 Z" fill="#6b4a2b" />
      </g>
      {/* face */}
      <g fill={LINE} opacity="0.6">
        <ellipse cx="141" cy="57" rx="2" ry="2.6" />
        <ellipse cx="159" cy="57" rx="2" ry="2.6" />
      </g>
      <path d="M144 72 Q150 76 156 72" stroke="#c0567a" strokeWidth="2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function Mannequin({ items, className, dim }: { items: Item[]; className?: string; dim?: boolean }) {
  // a dress replaces top + bottom on the figure
  const hasDress = items.some((i) => i.slot === "dress");
  const fit = useFit();
  return (
    <div className={cn("stage relative mx-auto aspect-[1/2] w-full max-w-[300px] overflow-hidden", className)}>
      <Figure />
      {items
        .filter((i) => !(hasDress && (i.slot === "top" || i.slot === "bottom")))
        .map((it) => {
          const f = fit?.[it.item_id];
          if (f) {
            const [left, top, width, zi, mirror, photo] = f;
            if (photo) {
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={it.item_id}
                  src={it.image}
                  alt={it.name}
                  draggable={false}
                  title="Photo couldn't be cut out, shown as a snapshot"
                  className={cn("absolute h-auto max-w-none rotate-3 border-[3px] border-white shadow-md", dim && "opacity-60")}
                  style={{ left: `${left / 3}%`, top: `${top / 6}%`, width: `${width / 3}%`, zIndex: zi }}
                />
              );
            }
            const copies = mirror ? [left, 300 - left - width] : [left];
            return copies.map((x, k) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={`${it.item_id}-${k}`}
                src={cutoutUrl(it.item_id)}
                alt={k === 0 ? it.name : ""}
                aria-hidden={k > 0}
                draggable={false}
                className={cn("garment absolute h-auto max-w-none", dim && "opacity-60", k > 0 && "-scale-x-100")}
                style={{ left: `${x / 3}%`, top: `${top / 6}%`, width: `${width / 3}%`, zIndex: zi }}
              />
            ));
          }
          const z = ZONES[it.slot];
          const style: CSSProperties = {
            top: `${z.top}%`, left: `${z.left}%`, width: `${z.width}%`, height: `${z.height}%`, zIndex: z.z,
          };
          return (
            <div key={it.item_id} className="absolute" style={style}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={cutoutUrl(it.item_id)}
                alt={it.name}
                className={cn("garment h-full w-full object-contain", dim && "opacity-60")}
                style={{ objectPosition: `center ${z.anchor}` }}
                draggable={false}
              />
            </div>
          );
        })}
    </div>
  );
}
