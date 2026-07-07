function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

// 2地点間の直線距離をメートルで計算する（サーバー側のキャッシュ検索・クライアント側の現在地距離表示の両方で使用）。
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const earthRadiusMeters = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a));
}

// 都道府県を8地方に分類し、北から南への並び順を定義する（エリア一覧の表示用）。
export const REGION_ORDER = [
  "北海道地方",
  "東北地方",
  "関東地方",
  "中部地方",
  "近畿地方",
  "中国地方",
  "四国地方",
  "九州・沖縄地方",
] as const;

const PREFECTURE_TO_REGION: Record<string, (typeof REGION_ORDER)[number]> = {
  北海道: "北海道地方",
  青森県: "東北地方",
  岩手県: "東北地方",
  宮城県: "東北地方",
  秋田県: "東北地方",
  山形県: "東北地方",
  福島県: "東北地方",
  茨城県: "関東地方",
  栃木県: "関東地方",
  群馬県: "関東地方",
  埼玉県: "関東地方",
  千葉県: "関東地方",
  東京都: "関東地方",
  神奈川県: "関東地方",
  新潟県: "中部地方",
  富山県: "中部地方",
  石川県: "中部地方",
  福井県: "中部地方",
  山梨県: "中部地方",
  長野県: "中部地方",
  岐阜県: "中部地方",
  静岡県: "中部地方",
  愛知県: "中部地方",
  三重県: "近畿地方",
  滋賀県: "近畿地方",
  京都府: "近畿地方",
  大阪府: "近畿地方",
  兵庫県: "近畿地方",
  奈良県: "近畿地方",
  和歌山県: "近畿地方",
  鳥取県: "中国地方",
  島根県: "中国地方",
  岡山県: "中国地方",
  広島県: "中国地方",
  山口県: "中国地方",
  徳島県: "四国地方",
  香川県: "四国地方",
  愛媛県: "四国地方",
  高知県: "四国地方",
  福岡県: "九州・沖縄地方",
  佐賀県: "九州・沖縄地方",
  長崎県: "九州・沖縄地方",
  熊本県: "九州・沖縄地方",
  大分県: "九州・沖縄地方",
  宮崎県: "九州・沖縄地方",
  鹿児島県: "九州・沖縄地方",
  沖縄県: "九州・沖縄地方",
};

export function regionForPrefecture(prefecture: string): string {
  return PREFECTURE_TO_REGION[prefecture] ?? "その他";
}

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
  updated_at: string;
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

// venuesテーブルは店舗種別（コンビニ/飲食店）を持たないため、名称から簡易推定する。
// マーカー色分けやアフィリエイト導線の出し分けなど、UI上のヒントとしてのみ使う。
const CONVENIENCE_STORE_NAME_PATTERNS = [
  "セブン-イレブン",
  "セブンイレブン",
  "ファミリーマート",
  "ローソン",
  "ミニストップ",
  "デイリーヤマザキ",
  "セイコーマート",
  "ポプラ",
];

export function looksLikeConvenienceStore(name: string): boolean {
  return CONVENIENCE_STORE_NAME_PATTERNS.some((pattern) => name.includes(pattern));
}

// Claudeが口コミから根拠を見つけられなかった場合に "<UNKNOWN>" 等のプレースホルダーを
// text_proof/proof_text にそのまま返すことがあるため、UI表示前にその状態を判定する。
export function isUnknownProof(proof: string): boolean {
  const normalized = proof.trim().toLowerCase();
  return normalized === "" || normalized === "<unknown>" || normalized === "unknown";
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
