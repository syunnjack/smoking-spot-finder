/**
 * 指定した市町村のローカルデータを収集し、口コミをClaudeで解析してSupabaseへ保存するスタンドアロンスクリプト。
 *
 * 使い方:
 *   npx tsx scripts/sync-places.ts <市町村名> <smoking|workspace|laundry|gym|sauna>
 *   例) npx tsx scripts/sync-places.ts 静岡市 smoking
 *
 * 必要な環境変数（.env.local から読み込む。CI等では事前にexportしておけばよい）:
 *   GOOGLE_MAPS_API_KEY, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import Anthropic from "@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  VENUE_CATEGORIES,
  type VenueCategory,
  type SmokingMetadata,
  type WorkspaceMetadata,
  type LaundryMetadata,
  type GymMetadata,
  type SaunaMetadata,
  type OpeningHours,
} from "@/lib/types";

try {
  process.loadEnvFile(".env.local");
} catch {
  // .env.local が無い場合はシェル側で環境変数がexport済みという想定でそのまま進める。
}

const PLACES_SEARCH_TEXT_URL = "https://places.googleapis.com/v1/places:searchText";
const PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places";

// Google Place Details は reviews を要求しても実際には最大5件程度しか返さない仕様のため、
// この値は「取得を試みる上限」であり実際の件数を保証するものではない。
const MAX_REVIEWS_PER_PLACE = 20;
// 1回の実行あたりのAPIコスト・実行時間を抑えるための処理件数上限。
const MAX_PLACES_PER_RUN = 40;
// Google Places / Anthropic への同時リクエスト数上限。
const CONCURRENCY = 4;

type SyncableCategory = Extract<
  VenueCategory,
  "smoking" | "workspace" | "laundry" | "gym" | "sauna"
>;

// includedTypeを省略した場合はGoogle Places Text Searchのtypeフィルタをかけず、
// textQueryだけで検索する（「有料自習室」のようにGoogle Places側に専用typeが存在しない業態向け）。
interface PlaceQuerySpec {
  includedType?: string;
  queryLabel: string;
}

const CATEGORY_QUERIES: Record<SyncableCategory, PlaceQuerySpec[]> = {
  smoking: [
    { includedType: "convenience_store", queryLabel: "コンビニ" },
    { includedType: "restaurant", queryLabel: "飲食店" },
    { includedType: "cafe", queryLabel: "カフェ" },
    { includedType: "park", queryLabel: "公園" },
  ],
  workspace: [
    { includedType: "cafe", queryLabel: "カフェ 電源 WIFI" },
    { includedType: "coworking_space", queryLabel: "コワーキングスペース" },
    { includedType: "library", queryLabel: "図書館" },
    { queryLabel: "有料自習室" },
  ],
  laundry: [{ includedType: "laundry", queryLabel: "コインランドリー" }],
  gym: [
    { includedType: "gym", queryLabel: "ジム" },
    { includedType: "fitness_center", queryLabel: "フィットネスクラブ" },
  ],
  sauna: [
    { includedType: "sauna", queryLabel: "サウナ" },
    { includedType: "public_bath", queryLabel: "スーパー銭湯 天然温泉" },
    { queryLabel: "岩盤浴" },
  ],
};

// Claudeへの構造化抽出リクエストをカテゴリごとに切り替えるための設定。
// tool_choiceで強制するtool定義とフォールバック値をセットで持たせ、processPlace側はカテゴリを意識しない。
interface AnalysisConfig<T> {
  systemPrompt: string;
  toolName: string;
  toolDescription: string;
  inputSchema: Anthropic.Tool.InputSchema;
  fallback: T;
}

const SMOKING_ANALYSIS_CONFIG: AnalysisConfig<SmokingMetadata> = {
  systemPrompt:
    "提供されたこの施設のユーザー口コミを分析してください。この施設でタバコが吸えるかどうかを判定し、以下のブーリアン（真偽値）フラグを持つ構造化されたJSONオブジェクトとして出力してください：\n" +
    "- allows_paper_cigarettes (true/false)\n" +
    "- allows_electronic_cigarettes_only (true/false)\n" +
    "- has_outdoor_ashtray (true/false)\n" +
    "- text_proof (クチコミ内から、この状態を裏付ける具体的な日本語の一文をそのまま抽出してください)",
  toolName: "report_smoking_analysis",
  toolDescription: "口コミの分析結果を構造化されたフラグとして報告する。",
  inputSchema: {
    type: "object",
    properties: {
      allows_paper_cigarettes: { type: "boolean" },
      allows_electronic_cigarettes_only: { type: "boolean" },
      has_outdoor_ashtray: { type: "boolean" },
      text_proof: { type: "string" },
    },
    required: [
      "allows_paper_cigarettes",
      "allows_electronic_cigarettes_only",
      "has_outdoor_ashtray",
      "text_proof",
    ],
  },
  fallback: {
    allows_paper_cigarettes: false,
    allows_electronic_cigarettes_only: false,
    has_outdoor_ashtray: false,
    text_proof: "口コミに喫煙に関する記載なし",
  },
};

const WORKSPACE_ANALYSIS_CONFIG: AnalysisConfig<WorkspaceMetadata> = {
  systemPrompt:
    "提供されたこの施設のユーザー口コミを分析してください。この施設が作業や勉強に使えるかどうかを判定し、以下のブーリアン（真偽値）フラグを持つ構造化されたJSONオブジェクトとして出力してください：\n" +
    "- has_power_outlet (電源・コンセントが利用できるとの記載があればtrue、無ければfalse)\n" +
    "- has_wifi (WIFIが利用できるとの記載があればtrue、無ければfalse)\n" +
    "- has_wired_lan (有線LANが利用できるとの記載があればtrue、無ければfalse)\n" +
    "- has_usage_fee (座席利用料・時間制の利用料金など、飲食の注文以外に料金が必要との記載があればtrue、注文のみで利用できる場合はfalse)\n" +
    "- text_proof (クチコミ内から、この状態を裏付ける具体的な日本語の一文をそのまま抽出してください)",
  toolName: "report_workspace_analysis",
  toolDescription: "口コミの分析結果を構造化されたフラグとして報告する。",
  inputSchema: {
    type: "object",
    properties: {
      has_power_outlet: { type: "boolean" },
      has_wifi: { type: "boolean" },
      has_wired_lan: { type: "boolean" },
      has_usage_fee: { type: "boolean" },
      text_proof: { type: "string" },
    },
    required: ["has_power_outlet", "has_wifi", "has_wired_lan", "has_usage_fee", "text_proof"],
  },
  fallback: {
    has_power_outlet: false,
    has_wifi: false,
    has_wired_lan: false,
    has_usage_fee: false,
    text_proof: "口コミに作業環境に関する記載なし",
  },
};

const LAUNDRY_ANALYSIS_CONFIG: AnalysisConfig<LaundryMetadata> = {
  systemPrompt:
    "提供されたこの施設のユーザー口コミを分析してください。このコインランドリーの設備を判定し、以下のブーリアン（真偽値）フラグを持つ構造化されたJSONオブジェクトとして出力してください：\n" +
    "- has_24h (24時間営業・24時間利用可能との記載があればtrue、無ければfalse)\n" +
    "- has_large_machine (布団・毛布等が洗える大型洗濯機/乾燥機があるとの記載があればtrue、無ければfalse)\n" +
    "- has_cashless_payment (電子マネー・QRコード決済・クレジットカード等キャッシュレス対応との記載があればtrue、現金（コイン）のみ、または記載が無ければfalse)\n" +
    "- has_wifi (Wi-Fiが利用できるとの記載があればtrue、無ければfalse)\n" +
    "- text_proof (クチコミ内から、この状態を裏付ける具体的な日本語の一文をそのまま抽出してください)",
  toolName: "report_laundry_analysis",
  toolDescription: "口コミの分析結果を構造化されたフラグとして報告する。",
  inputSchema: {
    type: "object",
    properties: {
      has_24h: { type: "boolean" },
      has_large_machine: { type: "boolean" },
      has_cashless_payment: { type: "boolean" },
      has_wifi: { type: "boolean" },
      text_proof: { type: "string" },
    },
    required: ["has_24h", "has_large_machine", "has_cashless_payment", "has_wifi", "text_proof"],
  },
  fallback: {
    has_24h: false,
    has_large_machine: false,
    has_cashless_payment: false,
    has_wifi: false,
    text_proof: "口コミに設備に関する記載なし",
  },
};

const GYM_ANALYSIS_CONFIG: AnalysisConfig<GymMetadata> = {
  systemPrompt:
    "提供されたこの施設のユーザー口コミを分析してください。このジムの利用条件・設備を判定し、以下のブーリアン（真偽値）フラグを持つ構造化されたJSONオブジェクトとして出力してください：\n" +
    "- has_24h (24時間営業・24時間利用可能との記載があればtrue、無ければfalse)\n" +
    "- has_dropin (会員登録なしの都度利用・ビジター利用・ドロップインができるとの記載があればtrue、会員限定、または記載が無ければfalse)\n" +
    "- has_shower (シャワー設備があるとの記載があればtrue、無ければfalse)\n" +
    "- has_parking (駐車場があるとの記載があればtrue、無ければfalse)\n" +
    "- text_proof (クチコミ内から、この状態を裏付ける具体的な日本語の一文をそのまま抽出してください)",
  toolName: "report_gym_analysis",
  toolDescription: "口コミの分析結果を構造化されたフラグとして報告する。",
  inputSchema: {
    type: "object",
    properties: {
      has_24h: { type: "boolean" },
      has_dropin: { type: "boolean" },
      has_shower: { type: "boolean" },
      has_parking: { type: "boolean" },
      text_proof: { type: "string" },
    },
    required: ["has_24h", "has_dropin", "has_shower", "has_parking", "text_proof"],
  },
  fallback: {
    has_24h: false,
    has_dropin: false,
    has_shower: false,
    has_parking: false,
    text_proof: "口コミに利用条件・設備に関する記載なし",
  },
};

const SAUNA_ANALYSIS_CONFIG: AnalysisConfig<SaunaMetadata> = {
  systemPrompt:
    "提供されたこの施設のユーザー口コミを分析してください。この施設（サウナ専門店・スーパー銭湯・岩盤浴施設のいずれか）の設備を判定し、以下のブーリアン（真偽値）フラグを持つ構造化されたJSONオブジェクトとして出力してください：\n" +
    "- has_sauna (サウナ室・ドライサウナ・スチームサウナ等があるとの記載があればtrue、無ければfalse)\n" +
    "- has_cold_bath (水風呂があるとの記載があればtrue、無ければfalse)\n" +
    "- has_ganban_yoku (岩盤浴があるとの記載があればtrue、無ければfalse)\n" +
    "- has_outdoor_bath (露天風呂があるとの記載があればtrue、無ければfalse)\n" +
    "- text_proof (クチコミ内から、この状態を裏付ける具体的な日本語の一文をそのまま抽出してください)",
  toolName: "report_sauna_analysis",
  toolDescription: "口コミの分析結果を構造化されたフラグとして報告する。",
  inputSchema: {
    type: "object",
    properties: {
      has_sauna: { type: "boolean" },
      has_cold_bath: { type: "boolean" },
      has_ganban_yoku: { type: "boolean" },
      has_outdoor_bath: { type: "boolean" },
      text_proof: { type: "string" },
    },
    required: ["has_sauna", "has_cold_bath", "has_ganban_yoku", "has_outdoor_bath", "text_proof"],
  },
  fallback: {
    has_sauna: false,
    has_cold_bath: false,
    has_ganban_yoku: false,
    has_outdoor_bath: false,
    text_proof: "口コミに設備に関する記載なし",
  },
};

const ANALYSIS_CONFIG: Record<
  SyncableCategory,
  AnalysisConfig<SmokingMetadata | WorkspaceMetadata | LaundryMetadata | GymMetadata | SaunaMetadata>
> = {
  smoking: SMOKING_ANALYSIS_CONFIG,
  workspace: WORKSPACE_ANALYSIS_CONFIG,
  laundry: LAUNDRY_ANALYSIS_CONFIG,
  sauna: SAUNA_ANALYSIS_CONFIG,
  gym: GYM_ANALYSIS_CONFIG,
};

interface PlaceSearchResult {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
}

interface ParkingOptions {
  freeParkingLot?: boolean;
  paidParkingLot?: boolean;
  freeStreetParking?: boolean;
  paidStreetParking?: boolean;
  valetParking?: boolean;
  freeGarageParking?: boolean;
  paidGarageParking?: boolean;
}

interface PaymentOptions {
  acceptsCreditCards?: boolean;
  acceptsDebitCards?: boolean;
  acceptsCashOnly?: boolean;
  acceptsNfc?: boolean;
}

interface PlaceDetailsResult extends PlaceSearchResult {
  addressComponents?: Array<{ longText?: string; types?: string[] }>;
  reviews?: Array<{ text?: { text?: string } }>;
  regularOpeningHours?: OpeningHours;
  parkingOptions?: ParkingOptions;
  paymentOptions?: PaymentOptions;
}

// Googleは24時間営業の曜日についてclose（閉店時刻）を返さない仕様のため、全periodsにcloseが
// 無ければ24時間営業と高確度で判定できる。一部の曜日だけcloseが無い等の曖昧なケースはnullを返し、
// Claudeの推定（口コミの記載）を維持させる。
function derivedHas24h(openingHours: OpeningHours | undefined): boolean | null {
  const periods = openingHours?.periods;
  if (!periods || periods.length === 0) return null;
  return periods.every((p) => !p.close) ? true : null;
}

// Claudeは口コミにしか書かれていない情報しか拾えないが、Google側が構造化データとして
// 直接持っているフィールド（駐車場・決済方法・営業時間）はそちらを正とする方が精度が高い。
// Googleがそのフィールドを返さなかった場合（未収集の店舗）はClaudeの推定を維持する。
function applyStructuredSignals(
  category: SyncableCategory,
  analysis: SmokingMetadata | WorkspaceMetadata | LaundryMetadata | GymMetadata | SaunaMetadata,
  details: PlaceDetailsResult
): void {
  if (category === "gym" && details.parkingOptions) {
    const hasParking = Object.values(details.parkingOptions).some(Boolean);
    (analysis as GymMetadata).has_parking = hasParking;
  }
  if (category === "laundry" && details.paymentOptions) {
    const cashless = Boolean(
      details.paymentOptions.acceptsCreditCards ||
        details.paymentOptions.acceptsDebitCards ||
        details.paymentOptions.acceptsNfc
    );
    (analysis as LaundryMetadata).has_cashless_payment = cashless;
  }
  if (category === "gym" || category === "laundry") {
    const has24h = derivedHas24h(details.regularOpeningHours);
    if (has24h !== null) {
      (analysis as GymMetadata | LaundryMetadata).has_24h = has24h;
    }
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません。`);
  }
  return value;
}

function isSyncableCategory(value: string): value is SyncableCategory {
  return value in CATEGORY_QUERIES;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await fn(items[index], index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function searchPlacesByText(
  apiKey: string,
  city: string,
  spec: PlaceQuerySpec
): Promise<PlaceSearchResult[]> {
  const response = await fetch(PLACES_SEARCH_TEXT_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      textQuery: `${city} ${spec.queryLabel}`,
      ...(spec.includedType ? { includedType: spec.includedType } : {}),
      languageCode: "ja",
      regionCode: "JP",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Places Text Search 失敗 (query=${spec.queryLabel}, status=${response.status}): ${body}`
    );
  }

  const json = (await response.json()) as { places?: PlaceSearchResult[] };
  return json.places ?? [];
}

async function fetchPlaceDetails(
  apiKey: string,
  placeId: string
): Promise<PlaceDetailsResult> {
  const response = await fetch(
    `${PLACES_DETAILS_URL}/${placeId}?languageCode=ja&regionCode=JP`,
    {
      headers: {
        "X-Goog-Api-Key": apiKey,
        // regularOpeningHours/parkingOptions/paymentOptionsはreviewsと同じEnterprise+Atmosphere
        // 課金枠のフィールドのため、既にreviewsを要求している本リクエストへの追加コストは発生しない。
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,location,addressComponents,reviews,regularOpeningHours,parkingOptions,paymentOptions",
      },
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Place Details 失敗 (placeId=${placeId}, status=${response.status}): ${body}`
    );
  }

  return (await response.json()) as PlaceDetailsResult;
}

function extractPrefecture(details: PlaceDetailsResult): string | null {
  const component = details.addressComponents?.find((c) =>
    c.types?.includes("administrative_area_level_1")
  );
  return component?.longText ?? null;
}

async function analyzeReviews<T>(
  anthropic: Anthropic,
  placeName: string,
  reviewTexts: string[],
  config: AnalysisConfig<T>
): Promise<T> {
  if (reviewTexts.length === 0) {
    return config.fallback;
  }

  const reviewBlock = reviewTexts.map((text, i) => `${i + 1}. ${text}`).join("\n");

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 500,
    system: config.systemPrompt,
    tool_choice: { type: "tool", name: config.toolName },
    tools: [
      {
        name: config.toolName,
        description: config.toolDescription,
        input_schema: config.inputSchema,
      },
    ],
    messages: [
      {
        role: "user",
        content: `施設名: ${placeName}\n\n口コミ:\n${reviewBlock}`,
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  return toolUse ? (toolUse.input as T) : config.fallback;
}

interface ProcessResult {
  placeId: string;
  status: "upserted" | "skipped" | "error";
  detail?: string;
}

async function processPlace(
  place: PlaceSearchResult,
  city: string,
  category: SyncableCategory,
  googleApiKey: string,
  anthropic: Anthropic,
  supabase: SupabaseClient
): Promise<ProcessResult> {
  try {
    const details = await fetchPlaceDetails(googleApiKey, place.id);

    const latitude = details.location?.latitude ?? place.location?.latitude;
    const longitude = details.location?.longitude ?? place.location?.longitude;
    if (latitude === undefined || longitude === undefined) {
      return { placeId: place.id, status: "skipped", detail: "座標が取得できませんでした" };
    }

    // Google Places Text Searchは検索語に対する緩い関連度検索であり、指定した市町村と
    // 無関係な場所が結果に混ざることがある（実際に発生: 「横浜市」で検索して静岡市の店舗がヒットした）。
    // 住所に検索対象の市町村名が含まれない結果は保存せず、既存データの city 誤上書きを防ぐ。
    const address = details.formattedAddress ?? place.formattedAddress ?? null;
    if (!address || !address.includes(city)) {
      return {
        placeId: place.id,
        status: "skipped",
        detail: `住所が検索対象の市町村と一致しません（address: ${address ?? "不明"}）`,
      };
    }

    const reviewTexts = (details.reviews ?? [])
      .slice(0, MAX_REVIEWS_PER_PLACE)
      .map((review) => review.text?.text)
      .filter((text): text is string => Boolean(text));

    const name = details.displayName?.text ?? place.displayName?.text ?? "名称不明の施設";
    const analysis = await analyzeReviews(anthropic, name, reviewTexts, ANALYSIS_CONFIG[category]);
    applyStructuredSignals(category, analysis, details);

    const { error } = await supabase.from("venues").upsert(
      {
        name,
        latitude,
        longitude,
        address,
        google_place_id: place.id,
        city,
        prefecture: extractPrefecture(details),
        category,
        metadata: analysis,
        opening_hours: details.regularOpeningHours ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "google_place_id" }
    );

    if (error) throw error;

    return { placeId: place.id, status: "upserted" };
  } catch (error) {
    return {
      placeId: place.id,
      status: "error",
      detail:
        error instanceof Error
          ? error.message
          : JSON.stringify(error, Object.getOwnPropertyNames(error as object)),
    };
  }
}

async function main() {
  const [city, categoryArg] = process.argv.slice(2);

  if (!city || !categoryArg) {
    console.error(
      "使い方: npx tsx scripts/sync-places.ts <市町村名> <smoking|workspace|laundry|gym|sauna>"
    );
    process.exitCode = 1;
    return;
  }

  if (!isSyncableCategory(categoryArg)) {
    console.error(
      `category は次のいずれかを指定してください: ${Object.keys(CATEGORY_QUERIES).join(", ")}` +
        `\n（venuesテーブル全体では ${VENUE_CATEGORIES.join(", ")} も許容されるが、施設種別マッピングが未定義のため本スクリプトでは未対応）`
    );
    process.exitCode = 1;
    return;
  }
  const category = categoryArg;

  const googleApiKey = requireEnv("GOOGLE_MAPS_API_KEY");
  const anthropic = new Anthropic({ apiKey: requireEnv("ANTHROPIC_API_KEY") });
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const querySpecs = CATEGORY_QUERIES[category];
  console.log(
    `[sync-places] "${city}" / ${category} を検索します (queries: ${querySpecs.map((s) => s.queryLabel).join(", ")})`
  );

  const found = new Map<string, PlaceSearchResult>();
  for (const spec of querySpecs) {
    try {
      const places = await searchPlacesByText(googleApiKey, city, spec);
      for (const place of places) {
        if (!found.has(place.id)) found.set(place.id, place);
      }
    } catch (error) {
      console.error(`[sync-places] query="${spec.queryLabel}" の検索に失敗しました`, error);
    }
  }

  const targets = Array.from(found.values()).slice(0, MAX_PLACES_PER_RUN);
  console.log(`[sync-places] ${targets.length}件の候補を処理します`);

  const results = await mapWithConcurrency(targets, CONCURRENCY, (place) =>
    processPlace(place, city, category, googleApiKey, anthropic, supabase)
  );

  const upserted = results.filter((r) => r.status === "upserted").length;
  const skipped = results.filter((r) => r.status === "skipped");
  const errored = results.filter((r) => r.status === "error");

  console.log(`[sync-places] 完了: 保存 ${upserted}件 / スキップ ${skipped.length}件 / 失敗 ${errored.length}件`);
  for (const r of [...skipped, ...errored]) {
    console.warn(`  - ${r.placeId}: ${r.status} ${r.detail ?? ""}`);
  }
}

main().catch((error) => {
  console.error("[sync-places] 致命的なエラーが発生しました", error);
  process.exitCode = 1;
});
