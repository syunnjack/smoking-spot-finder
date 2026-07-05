export interface SmokingInfo {
  allows_paper: boolean;
  allows_electronic: boolean;
  has_outside_ashtray: boolean;
  proof_text: string;
}

export interface SmokingSpot {
  place_id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  category: "convenience_store" | "restaurant";
  rating: number | null;
  smoking: SmokingInfo;
}

export const VENUE_CATEGORIES = [
  "smoking",
  "invoice-cafe",
  "laundry",
  "gym",
] as const;

export type VenueCategory = (typeof VENUE_CATEGORIES)[number];

export function isVenueCategory(value: string): value is VenueCategory {
  return (VENUE_CATEGORIES as readonly string[]).includes(value);
}

// Supabaseはjsonb列を通常オブジェクトとして返すが、文字列で返るドライバ/経路にも耐えられるようにする。
export function parseVenueMetadata(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

export interface Venue {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  google_place_id: string | null;
  city: string | null;
  prefecture: string | null;
  category: VenueCategory;
  metadata: Record<string, unknown>;
  created_at: string;
}

export const CATEGORY_LABELS: Record<VenueCategory, string> = {
  smoking: "喫煙できる場所",
  "invoice-cafe": "インボイス対応カフェ",
  laundry: "コインランドリー",
  gym: "ジム",
};

// scripts/sync-places.ts がClaudeの解析結果として venues.metadata に保存する構造。
// 現状は全カテゴリ共通でこの形になる（sync-places.tsの解析ロジックがカテゴリ非依存のため）。
export interface SmokingMetadata {
  allows_paper_cigarettes: boolean;
  allows_electronic_cigarettes_only: boolean;
  has_outdoor_ashtray: boolean;
  text_proof: string;
}

export function isSmokingMetadata(value: unknown): value is SmokingMetadata {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.allows_paper_cigarettes === "boolean" &&
    typeof v.allows_electronic_cigarettes_only === "boolean" &&
    typeof v.has_outdoor_ashtray === "boolean" &&
    typeof v.text_proof === "string"
  );
}
