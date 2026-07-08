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
  "workspace",
  "laundry",
  "gym",
  "sauna",
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

// Google Places Details (New) の regularOpeningHours をそのまま保持する。
// JSON-LDのopeningHoursSpecification組み立て（app/[prefecture]/[city]/[category]/page.tsx）でのみ使用。
export interface OpeningHoursPoint {
  day: number; // 0=日曜 ... 6=土曜（Google Places準拠）
  hour: number;
  minute: number;
}

export interface OpeningHoursPeriod {
  open: OpeningHoursPoint;
  close?: OpeningHoursPoint;
}

export interface OpeningHours {
  periods?: OpeningHoursPeriod[];
  weekdayDescriptions?: string[];
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
  opening_hours: OpeningHours | null;
  created_at: string;
  updated_at: string;
}

export const CATEGORY_LABELS: Record<VenueCategory, string> = {
  smoking: "喫煙できる場所",
  workspace: "作業・勉強できる場所",
  laundry: "コインランドリー",
  gym: "ジム",
  sauna: "サウナ・温浴施設",
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

// scripts/sync-places.ts が workspace カテゴリ（カフェ・自習室・コワーキングスペース）で
// venues.metadata に保存する構造。電源・WIFI・有線LAN・利用料の有無を口コミから判定する。
export interface WorkspaceMetadata {
  has_power_outlet: boolean;
  has_wifi: boolean;
  has_wired_lan: boolean;
  has_usage_fee: boolean;
  text_proof: string;
}

const SCHEMA_ORG_DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export interface OpeningHoursSpecification {
  "@type": "OpeningHoursSpecification";
  dayOfWeek: string;
  opens: string;
  closes: string;
}

// venues.opening_hoursの生データ（Google Places準拠のday/hour/minute）を、
// LocalBusiness構造化データが要求するdayOfWeek/opens/closes形式に変換する。
// 24時間営業（closeが無い期間）は正しく表現できないため対象から除く。
export function buildOpeningHoursSpecification(
  openingHours: OpeningHours | null | undefined
): OpeningHoursSpecification[] | undefined {
  const periods = openingHours?.periods;
  if (!periods || periods.length === 0) return undefined;

  const specs = periods
    .filter((p): p is Required<OpeningHoursPeriod> => Boolean(p.close))
    .map((p) => ({
      "@type": "OpeningHoursSpecification" as const,
      dayOfWeek: SCHEMA_ORG_DAY_NAMES[p.open.day] ?? "Monday",
      opens: `${pad2(p.open.hour)}:${pad2(p.open.minute)}`,
      closes: `${pad2(p.close.hour)}:${pad2(p.close.minute)}`,
    }));

  return specs.length > 0 ? specs : undefined;
}

export function isWorkspaceMetadata(value: unknown): value is WorkspaceMetadata {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.has_power_outlet === "boolean" &&
    typeof v.has_wifi === "boolean" &&
    typeof v.has_wired_lan === "boolean" &&
    typeof v.has_usage_fee === "boolean" &&
    typeof v.text_proof === "string"
  );
}

// scripts/sync-places.ts が laundry カテゴリ（コインランドリー）で venues.metadata に保存する構造。
export interface LaundryMetadata {
  has_24h: boolean;
  has_large_machine: boolean;
  has_cashless_payment: boolean;
  has_wifi: boolean;
  text_proof: string;
}

export function isLaundryMetadata(value: unknown): value is LaundryMetadata {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.has_24h === "boolean" &&
    typeof v.has_large_machine === "boolean" &&
    typeof v.has_cashless_payment === "boolean" &&
    typeof v.has_wifi === "boolean" &&
    typeof v.text_proof === "string"
  );
}

// scripts/sync-places.ts が gym カテゴリ（ジム）で venues.metadata に保存する構造。
export interface GymMetadata {
  has_24h: boolean;
  has_dropin: boolean;
  has_shower: boolean;
  has_parking: boolean;
  text_proof: string;
}

export function isGymMetadata(value: unknown): value is GymMetadata {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.has_24h === "boolean" &&
    typeof v.has_dropin === "boolean" &&
    typeof v.has_shower === "boolean" &&
    typeof v.has_parking === "boolean" &&
    typeof v.text_proof === "string"
  );
}

// scripts/sync-places.ts が sauna カテゴリ（サウナ専門店・スーパー銭湯・岩盤浴施設を統合したジャンル）で
// venues.metadata に保存する構造。スーパー銭湯はサウナ・水風呂・岩盤浴を同一施設内に併設していることが
// 多く、Google Places側にも「岩盤浴」専用のtypeが存在しないため、ジャンルは分けず設備フラグで区別する。
export interface SaunaMetadata {
  has_sauna: boolean;
  has_cold_bath: boolean;
  has_ganban_yoku: boolean;
  has_outdoor_bath: boolean;
  text_proof: string;
}

export function isSaunaMetadata(value: unknown): value is SaunaMetadata {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.has_sauna === "boolean" &&
    typeof v.has_cold_bath === "boolean" &&
    typeof v.has_ganban_yoku === "boolean" &&
    typeof v.has_outdoor_bath === "boolean" &&
    typeof v.text_proof === "string"
  );
}
