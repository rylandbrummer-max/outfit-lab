export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000").replace(/\/$/, "");

export const SLOTS = [
  "top", "bottom", "dress", "outerwear", "shoes", "bag",
  "jewellery", "hat", "sunglasses", "scarf", "accessory",
] as const;
export type Slot = (typeof SLOTS)[number];

export const COLORS = [
  { id: "neutral", hex: "#9ca3af" },
  { id: "red/rust", hex: "#b4442e" },
  { id: "pink", hex: "#e48aa8" },
  { id: "tan/beige", hex: "#c9a67a" },
  { id: "yellow", hex: "#e3c64a" },
  { id: "green/teal", hex: "#2e9e8f" },
  { id: "blue", hex: "#3d64b8" },
  { id: "purple", hex: "#8b5fbf" },
] as const;
export type ColorFamily = (typeof COLORS)[number]["id"];

export const CATEGORIES = [
  "tops", "bottoms", "all-body", "outerwear", "shoes", "bags",
  "jewellery", "hats", "sunglasses", "scarves", "accessories",
] as const;

export interface Item {
  item_id: string;
  name: string;
  category: string;
  slot: Slot;
  fine_type: string;
  color_family: ColorFamily;
  hex: string;
  image: string;
  impact?: number | null;
}

export interface ScoreResult {
  score: number;
  verdict: "strong" | "good" | "weak" | "clashing";
  items: Item[];
  notes?: string[];
}

export interface BuildRequest {
  slots: Slot[];
  locked_ids: string[];
  avoid_colors: ColorFamily[];
  style: number;
  closet_ids: string[] | null;
  seed?: number | null;
}

export interface ModelInfo {
  model_name: string;
  sklearn_version: string;
  python_version: string;
  trained_at: string;
  n_train_outfits: number;
  n_features: number;
  catalog_size: number;
  pipeline_steps: string[];
  valid_metrics: { valid_auc: number; valid_accuracy: number; valid_fitb_accuracy: number };
  baseline_valid_metrics: { valid_auc: number; valid_accuracy: number; valid_fitb_accuracy: number };
}

export class ApiError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000); // Modal cold starts can take a while
  let res: Response;
  try {
    res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch (e) {
    throw new ApiError(
      (e as Error).name === "AbortError"
        ? "The API took longer than 60s to answer."
        : `Can't reach the API at ${API_URL}. Is it running?`,
    );
  } finally {
    clearTimeout(timer);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const detail = body?.detail;
    const msg = typeof detail === "string" ? detail
      : Array.isArray(detail) ? detail.map((d: { msg: string }) => d.msg).join("; ")
      : `Request failed (${res.status})`;
    throw new ApiError(res.status === 503 ? `Model unavailable: ${msg}` : msg, res.status);
  }
  return body as T;
}

export const api = {
  health: () => request<{ status: string; model_loaded: boolean; error: string | null }>("/health"),
  info: () => request<ModelInfo>("/info"),
  catalog: (p: { category?: string; color?: string; q?: string; limit?: number; offset?: number }) => {
    const qs = new URLSearchParams();
    Object.entries(p).forEach(([k, v]) => v !== undefined && v !== "" && qs.set(k, String(v)));
    return request<{ total: number; items: Item[] }>(`/catalog?${qs}`);
  },
  score: (item_ids: string[]) =>
    request<ScoreResult>("/score", { method: "POST", body: JSON.stringify({ item_ids }) }),
  build: (req: BuildRequest) =>
    request<ScoreResult>("/build", { method: "POST", body: JSON.stringify(req) }),
};

export const cutoutUrl = (id: string) => `/cutouts/${id}.webp`;

export const SLOT_CATEGORY: Record<Slot, (typeof CATEGORIES)[number]> = {
  top: "tops", bottom: "bottoms", dress: "all-body", outerwear: "outerwear", shoes: "shoes",
  bag: "bags", jewellery: "jewellery", hat: "hats", sunglasses: "sunglasses", scarf: "scarves",
  accessory: "accessories",
};
