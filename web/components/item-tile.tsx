import Image from "next/image";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { Item } from "@/lib/api";

export function ItemTile({
  item,
  actions,
  footer,
  selected,
  onClick,
}: {
  item: Item;
  actions?: ReactNode;
  footer?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <div
      className={cn(
        "bevel group relative flex flex-col p-1.5 transition",
        selected && "outline-3 outline-offset-0 outline-[var(--hotpink)]",
        onClick && "cursor-pointer hover:brightness-105",
      )}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick()) : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? Boolean(selected) : undefined}
    >
      <div className="bevel-in relative aspect-square">
        <Image src={item.image} alt={item.name} fill unoptimized sizes="200px" className="object-contain p-2" />
        {actions && <div className="absolute top-1 right-1 flex gap-1">{actions}</div>}
      </div>
      <div className="flex flex-1 flex-col gap-0.5 px-0.5 pt-1.5">
        <div className="font-pixel flex items-center gap-1.5 text-base leading-none uppercase text-[var(--lo)]">
          <span className="inline-block size-2.5 shrink-0 border border-[var(--navy)]" style={{ background: item.hex }} title={item.color_family} />
          <span className="truncate">{item.fine_type}</span>
        </div>
        <p className="line-clamp-2 text-[11px] leading-snug font-medium" title={item.name}>
          {item.name}
        </p>
        {footer}
      </div>
    </div>
  );
}
