import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import type { SmokingInfo, SmokingMetadata, SmokingSpot } from "@/lib/types";
import {
  haversineMeters,
  isSmokingMetadata,
  looksLikeConvenienceStore,
  parseVenueMetadata,
} from "@/lib/types";
import { getSupabaseServerClient } from "@/lib/supabaseClient";

const SHIZUOKA_STATION = { lat: 34.9715, lng: 138.3891 };
const SEARCH_RADIUS_METERS = 1000;
// キャッシュ（venuesテーブル）がこの日数より古い場合のみGoogle Places+Claudeを叩き直す。
const CACHE_MAX_AGE_DAYS = 7;
// Nearby Search + Place Details + a Claude call happen per store, so this caps
// latency/cost for the prototype rather than fanning out to every result.
const MAX_STORES = 12;
const REVIEWS_PER_STORE = 5;

// scripts/sync-places.ts と同じ Places API (New) を使う。レガシーPlaces APIは使わない
// （プロジェクト側で有効化するAPIを1つに絞り、管理・コストを単純化するため）。
const PLACES_SEARCH_NEARBY_URL = "https://places.googleapis.com/v1/places:searchNearby";
const PLACES_DETAILS_URL = "https://places.googleapis.com/v1/places";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FALLBACK_SMOKING_INFO: SmokingInfo = {
  allows_paper: false,
  allows_electronic: false,
  has_outside_ashtray: false,
  proof_text: "口コミに喫煙に関する記載なし",
};

function inferStoreCategory(name: string): SmokingSpot["category"] {
  return looksLikeConvenienceStore(name) ? "convenience_store" : "restaurant";
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function boundingBox(lat: number, lng: number, radiusMeters: number) {
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.cos(toRad(lat)) || 1);
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

function metadataToSmokingInfo(metadata: SmokingMetadata): SmokingInfo {
  return {
    allows_paper: metadata.allows_paper_cigarettes,
    allows_electronic: metadata.allows_electronic_cigarettes_only,
    has_outside_ashtray: metadata.has_outdoor_ashtray,
    proof_text: metadata.text_proof,
  };
}

function smokingInfoToMetadata(info: SmokingInfo): SmokingMetadata {
  return {
    allows_paper_cigarettes: info.allows_paper,
    allows_electronic_cigarettes_only: info.allows_electronic,
    has_outdoor_ashtray: info.has_outside_ashtray,
    text_proof: info.proof_text,
  };
}

interface CachedVenueRow {
  google_place_id: string | null;
  name: string;
  address: string | null;
  latitude: number;
  longitude: number;
  metadata: unknown;
}

function venueRowToSmokingSpot(row: CachedVenueRow): SmokingSpot | null {
  if (!row.google_place_id) return null;
  const metadata = parseVenueMetadata(row.metadata);
  if (!isSmokingMetadata(metadata)) return null;

  return {
    place_id: row.google_place_id,
    name: row.name,
    address: row.address ?? "",
    lat: row.latitude,
    lng: row.longitude,
    category: inferStoreCategory(row.name),
    rating: null,
    smoking: metadataToSmokingInfo(metadata),
  };
}

// キャッシュ（Supabase venuesテーブル）から半径内・鮮度内のデータを探す。
// Supabase未設定やクエリ失敗時はnullを返し、呼び出し側がライブ取得にフォールバックできるようにする。
async function fetchFromCache(lat: number, lng: number): Promise<SmokingSpot[] | null> {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    return null;
  }

  const { minLat, maxLat, minLng, maxLng } = boundingBox(lat, lng, SEARCH_RADIUS_METERS);
  const cutoff = new Date(Date.now() - CACHE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data, error } = await supabase
    .from("venues")
    .select("google_place_id, name, address, latitude, longitude, metadata")
    .eq("category", "smoking")
    .gte("latitude", minLat)
    .lte("latitude", maxLat)
    .gte("longitude", minLng)
    .lte("longitude", maxLng)
    .gte("updated_at", cutoff);

  if (error || !data || data.length === 0) return null;

  const spots = data
    .filter((row) => haversineMeters(lat, lng, row.latitude, row.longitude) <= SEARCH_RADIUS_METERS)
    .map(venueRowToSmokingSpot)
    .filter((spot): spot is SmokingSpot => spot !== null);

  return spots.length > 0 ? spots : null;
}

// ライブ取得した結果を次回以降のキャッシュヒットのためvenuesテーブルへUpsertする。
// この経路は緯度経度ベースで動くため、市町村ルート（/[prefecture]/[city]/[category]）向けの
// prefecture/cityは特定できず null のまま保存する（そちらのページには影響しない）。
async function upsertToCache(spots: SmokingSpot[]): Promise<void> {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    return;
  }

  const rows = spots.map((spot) => ({
    name: spot.name,
    latitude: spot.lat,
    longitude: spot.lng,
    address: spot.address || null,
    google_place_id: spot.place_id,
    category: "smoking" as const,
    metadata: smokingInfoToMetadata(spot.smoking),
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase.from("venues").upsert(rows, { onConflict: "google_place_id" });
  if (error) {
    console.error("[smoking-spots] failed to write cache", error);
  }
}

interface NearbyPlace {
  id: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
}

interface PlaceDetails extends NearbyPlace {
  rating?: number;
  reviews?: Array<{ text?: { text?: string } }>;
}

async function searchNearbyPlaces(
  lat: number,
  lng: number,
  includedType: "convenience_store" | "restaurant"
): Promise<NearbyPlace[]> {
  const response = await fetch(PLACES_SEARCH_NEARBY_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY as string,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({
      includedTypes: [includedType],
      maxResultCount: 20,
      languageCode: "ja",
      regionCode: "JP",
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: SEARCH_RADIUS_METERS,
        },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Nearby Search 失敗 (type=${includedType}, status=${response.status}): ${body}`
    );
  }

  const json = (await response.json()) as { places?: NearbyPlace[] };
  return json.places ?? [];
}

async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const response = await fetch(
    `${PLACES_DETAILS_URL}/${placeId}?languageCode=ja&regionCode=JP`,
    {
      headers: {
        "X-Goog-Api-Key": process.env.GOOGLE_MAPS_API_KEY as string,
        "X-Goog-FieldMask": "id,displayName,formattedAddress,location,rating,reviews",
      },
    }
  );

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Place Details 失敗 (placeId=${placeId}, status=${response.status}): ${body}`);
  }

  return (await response.json()) as PlaceDetails;
}

async function analyzeReviewsWithClaude(
  storeName: string,
  reviewTexts: string[]
): Promise<SmokingInfo> {
  if (reviewTexts.length === 0) {
    return FALLBACK_SMOKING_INFO;
  }

  const reviewBlock = reviewTexts
    .map((text, index) => `${index + 1}. ${text}`)
    .join("\n");

  const message = await anthropic.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-sonnet-5",
    max_tokens: 500,
    tool_choice: { type: "tool", name: "extract_smoking_info" },
    tools: [
      {
        name: "extract_smoking_info",
        description:
          "Googleマップの口コミテキストから、その店舗における喫煙に関する情報を抽出する。",
        input_schema: {
          type: "object",
          properties: {
            allows_paper: {
              type: "boolean",
              description: "紙タバコ（通常の喫煙）が可能だと口コミから読み取れるか",
            },
            allows_electronic: {
              type: "boolean",
              description: "電子タバコ・加熱式タバコのみ許可されていると読み取れるか",
            },
            has_outside_ashtray: {
              type: "boolean",
              description: "店外に灰皿が設置されていると読み取れるか",
            },
            proof_text: {
              type: "string",
              description:
                "判定の根拠となった口コミの一文を日本語でそのまま引用する。該当する記載がない場合は「口コミに喫煙に関する記載なし」とする。",
            },
          },
          required: [
            "allows_paper",
            "allows_electronic",
            "has_outside_ashtray",
            "proof_text",
          ],
        },
      },
    ],
    messages: [
      {
        role: "user",
        content: `以下は「${storeName}」に関するGoogleマップの口コミです。喫煙に関する記述（喫煙可否、電子タバコ専用、店外灰皿の有無など）を探し、ツールを使って情報を抽出してください。\n\n口コミ:\n${reviewBlock}`,
      },
    ],
  });

  const toolUse = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
  );

  if (!toolUse) {
    return FALLBACK_SMOKING_INFO;
  }

  return toolUse.input as SmokingInfo;
}

async function fetchLiveSpots(lat: number, lng: number): Promise<SmokingSpot[]> {
  const [convenienceStores, restaurants] = await Promise.all([
    searchNearbyPlaces(lat, lng, "convenience_store"),
    searchNearbyPlaces(lat, lng, "restaurant"),
  ]);

  const categorized = [
    ...convenienceStores.map((place) => ({ place, category: "convenience_store" as const })),
    ...restaurants.map((place) => ({ place, category: "restaurant" as const })),
  ];

  const seen = new Set<string>();
  const deduped = categorized.filter(({ place }) => {
    if (!place.id || seen.has(place.id)) return false;
    seen.add(place.id);
    return true;
  });

  const targets = deduped.slice(0, MAX_STORES);

  const spots = await Promise.allSettled(
    targets.map(async ({ place, category }): Promise<SmokingSpot | null> => {
      if (!place.id || !place.location) return null;

      const details = await fetchPlaceDetails(place.id);
      const reviewTexts = (details.reviews ?? [])
        .slice(0, REVIEWS_PER_STORE)
        .map((review) => review.text?.text)
        .filter((text): text is string => Boolean(text));

      const name = details.displayName?.text ?? place.displayName?.text ?? "名称不明の店舗";
      const smoking = await analyzeReviewsWithClaude(name, reviewTexts);

      const latitude = details.location?.latitude ?? place.location.latitude;
      const longitude = details.location?.longitude ?? place.location.longitude;
      if (latitude === undefined || longitude === undefined) return null;

      return {
        place_id: place.id,
        name,
        address: details.formattedAddress ?? place.formattedAddress ?? "",
        lat: latitude,
        lng: longitude,
        category,
        rating: details.rating ?? null,
        smoking,
      };
    })
  );

  return spots
    .filter(
      (result): result is PromiseFulfilledResult<SmokingSpot> =>
        result.status === "fulfilled" && result.value !== null
    )
    .map((result) => result.value);
}

export async function GET(request: NextRequest) {
  if (!process.env.GOOGLE_MAPS_API_KEY || !process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: "GOOGLE_MAPS_API_KEY / ANTHROPIC_API_KEY が設定されていません。" },
      { status: 500 }
    );
  }

  const searchParams = request.nextUrl.searchParams;
  const lat = parseFloat(searchParams.get("latitude") ?? "") || SHIZUOKA_STATION.lat;
  const lng = parseFloat(searchParams.get("longitude") ?? "") || SHIZUOKA_STATION.lng;

  try {
    const cached = await fetchFromCache(lat, lng);
    if (cached) {
      return NextResponse.json({ center: { lat, lng }, spots: cached, source: "cache" });
    }

    const liveSpots = await fetchLiveSpots(lat, lng);
    await upsertToCache(liveSpots);

    return NextResponse.json({ center: { lat, lng }, spots: liveSpots, source: "live" });
  } catch (error) {
    console.error("[smoking-spots] failed to build spot list", error);
    return NextResponse.json(
      { error: "喫煙所情報の取得に失敗しました。" },
      { status: 500 }
    );
  }
}
