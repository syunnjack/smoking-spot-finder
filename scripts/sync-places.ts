/**
 * 指定した市町村のローカルデータを収集し、口コミをClaudeで解析してSupabaseへ保存するスタンドアロンスクリプト。
 *
 * 使い方:
 *   npx tsx scripts/sync-places.ts <市町村名> <smoking|invoice-cafe>
 *   例) npx tsx scripts/sync-places.ts 静岡市 smoking
 *
 * 必要な環境変数（.env.local から読み込む。CI等では事前にexportしておけばよい）:
 *   GOOGLE_MAPS_API_KEY, ANTHROPIC_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */
import Anthropic from "@anthropic-ai/sdk";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { VENUE_CATEGORIES, type VenueCategory, type SmokingMetadata } from "@/lib/types";

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

type SyncableCategory = Extract<VenueCategory, "smoking" | "invoice-cafe">;

const CATEGORY_PLACE_TYPES: Record<SyncableCategory, string[]> = {
  smoking: ["convenience_store", "restaurant", "cafe", "park"],
  "invoice-cafe": ["cafe", "co_working_space"],
};

const PLACE_TYPE_QUERY_LABEL: Record<string, string> = {
  convenience_store: "コンビニ",
  restaurant: "飲食店",
  cafe: "カフェ",
  park: "公園",
  co_working_space: "コワーキングスペース",
};

const SMOKING_ANALYSIS_SYSTEM_PROMPT =
  "提供されたこの施設のユーザー口コミを分析してください。この施設でタバコが吸えるかどうかを判定し、以下のブーリアン（真偽値）フラグを持つ構造化されたJSONオブジェクトとして出力してください：\n" +
  "- allows_paper_cigarettes (true/false)\n" +
  "- allows_electronic_cigarettes_only (true/false)\n" +
  "- has_outdoor_ashtray (true/false)\n" +
  "- text_proof (クチコミ内から、この状態を裏付ける具体的な日本語の一文をそのまま抽出してください)";

type SmokingAnalysis = SmokingMetadata;

const FALLBACK_ANALYSIS: SmokingAnalysis = {
  allows_paper_cigarettes: false,
  allows_electronic_cigarettes_only: false,
  has_outdoor_ashtray: false,
  text_proof: "口コミに喫煙に関する記載なし",
};

interface PlaceSearchResult {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
}

interface PlaceDetailsResult extends PlaceSearchResult {
  addressComponents?: Array<{ longText?: string; types?: string[] }>;
  reviews?: Array<{ text?: { text?: string } }>;
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`環境変数 ${name} が設定されていません。`);
  }
  return value;
}

function isSyncableCategory(value: string): value is SyncableCategory {
  return value in CATEGORY_PLACE_TYPES;
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
  placeType: string
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
      textQuery: `${city} ${PLACE_TYPE_QUERY_LABEL[placeType] ?? placeType}`,
      includedType: placeType,
      languageCode: "ja",
      regionCode: "JP",
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Places Text Search 失敗 (type=${placeType}, status=${response.status}): ${body}`
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
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,location,addressComponents,reviews",
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

async function analyzeSmokingInfo(
  anthropic: Anthropic,
  placeName: string,
  reviewTexts: string[]
): Promise<SmokingAnalysis> {
  if (reviewTexts.length === 0) {
    return FALLBACK_ANALYSIS;
  }

  const reviewBlock = reviewTexts.map((text, i) => `${i + 1}. ${text}`).join("\n");

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 500,
    system: SMOKING_ANALYSIS_SYSTEM_PROMPT,
    tool_choice: { type: "tool", name: "report_smoking_analysis" },
    tools: [
      {
        name: "report_smoking_analysis",
        description: "口コミの分析結果を構造化されたフラグとして報告する。",
        input_schema: {
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

  return toolUse ? (toolUse.input as SmokingAnalysis) : FALLBACK_ANALYSIS;
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
    const analysis = await analyzeSmokingInfo(anthropic, name, reviewTexts);

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
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}

async function main() {
  const [city, categoryArg] = process.argv.slice(2);

  if (!city || !categoryArg) {
    console.error(
      "使い方: npx tsx scripts/sync-places.ts <市町村名> <smoking|invoice-cafe>"
    );
    process.exitCode = 1;
    return;
  }

  if (!isSyncableCategory(categoryArg)) {
    console.error(
      `category は次のいずれかを指定してください: ${Object.keys(CATEGORY_PLACE_TYPES).join(", ")}` +
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

  const placeTypes = CATEGORY_PLACE_TYPES[category];
  console.log(`[sync-places] "${city}" / ${category} を検索します (types: ${placeTypes.join(", ")})`);

  const found = new Map<string, PlaceSearchResult>();
  for (const placeType of placeTypes) {
    try {
      const places = await searchPlacesByText(googleApiKey, city, placeType);
      for (const place of places) {
        if (!found.has(place.id)) found.set(place.id, place);
      }
    } catch (error) {
      console.error(`[sync-places] type=${placeType} の検索に失敗しました`, error);
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
