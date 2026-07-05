import { NextRequest, NextResponse } from "next/server";
import { Client, PlaceType1 } from "@googlemaps/google-maps-services-js";
import Anthropic from "@anthropic-ai/sdk";
import type { SmokingInfo, SmokingSpot } from "@/lib/types";

const SHIZUOKA_STATION = { lat: 34.9715, lng: 138.3891 };
const SEARCH_RADIUS_METERS = 1000;
// Nearby Search + Place Details + a Claude call happen per store, so this caps
// latency/cost for the prototype rather than fanning out to every result.
const MAX_STORES = 12;
const REVIEWS_PER_STORE = 5;

const mapsClient = new Client({});
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const FALLBACK_SMOKING_INFO: SmokingInfo = {
  allows_paper: false,
  allows_electronic: false,
  has_outside_ashtray: false,
  proof_text: "口コミに喫煙に関する記載なし",
};

async function searchNearbyPlaces(lat: number, lng: number, type: PlaceType1) {
  const response = await mapsClient.placesNearby({
    params: {
      location: { lat, lng },
      radius: SEARCH_RADIUS_METERS,
      type,
      key: process.env.GOOGLE_MAPS_API_KEY as string,
    },
  });
  return response.data.results;
}

async function fetchPlaceDetails(placeId: string) {
  const response = await mapsClient.placeDetails({
    params: {
      place_id: placeId,
      fields: ["name", "formatted_address", "geometry", "rating", "reviews"],
      key: process.env.GOOGLE_MAPS_API_KEY as string,
    },
  });
  return response.data.result;
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
    const [convenienceStores, restaurants] = await Promise.all([
      searchNearbyPlaces(lat, lng, PlaceType1.convenience_store),
      searchNearbyPlaces(lat, lng, PlaceType1.restaurant),
    ]);

    const categorized = [
      ...convenienceStores.map((place) => ({ place, category: "convenience_store" as const })),
      ...restaurants.map((place) => ({ place, category: "restaurant" as const })),
    ];

    const seen = new Set<string>();
    const deduped = categorized.filter(({ place }) => {
      if (!place.place_id || seen.has(place.place_id)) return false;
      seen.add(place.place_id);
      return true;
    });

    const targets = deduped.slice(0, MAX_STORES);

    const spots = await Promise.allSettled(
      targets.map(async ({ place, category }): Promise<SmokingSpot | null> => {
        if (!place.place_id || !place.geometry) return null;

        const details = await fetchPlaceDetails(place.place_id);
        const reviewTexts = (details.reviews ?? [])
          .slice(0, REVIEWS_PER_STORE)
          .map((review) => review.text)
          .filter((text): text is string => Boolean(text));

        const smoking = await analyzeReviewsWithClaude(
          details.name ?? place.name ?? "名称不明の店舗",
          reviewTexts
        );

        return {
          place_id: place.place_id,
          name: details.name ?? place.name ?? "名称不明の店舗",
          address: details.formatted_address ?? place.vicinity ?? "",
          lat: details.geometry?.location.lat ?? place.geometry.location.lat,
          lng: details.geometry?.location.lng ?? place.geometry.location.lng,
          category,
          rating: details.rating ?? place.rating ?? null,
          smoking,
        };
      })
    );

    const results = spots
      .filter(
        (result): result is PromiseFulfilledResult<SmokingSpot> =>
          result.status === "fulfilled" && result.value !== null
      )
      .map((result) => result.value);

    return NextResponse.json({ center: { lat, lng }, spots: results });
  } catch (error) {
    console.error("[smoking-spots] failed to build spot list", error);
    return NextResponse.json(
      { error: "喫煙所情報の取得に失敗しました。" },
      { status: 500 }
    );
  }
}
