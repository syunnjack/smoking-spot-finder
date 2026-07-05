import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getSupabaseServerClient } from "@/lib/supabaseClient";
import {
  CATEGORY_LABELS,
  isVenueCategory,
  isSmokingMetadata,
  parseVenueMetadata,
  type SmokingMetadata,
  type Venue,
  type VenueCategory,
} from "@/lib/types";
import VenueExplorer from "./VenueExplorer";

interface RouteParams {
  prefecture: string;
  city: string;
  category: string;
}

// Next.jsのバージョン/実行フェーズによって、動的セグメントがpercent-encodedのまま
// paramsに渡ってくることがある（generateMetadataではデコード済みだがpage側は未デコード、等）。
// どちらの状態で来ても安全に扱えるよう、使用前に必ずデコードを試みる。
function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function resolveRouteParams(params: Promise<RouteParams>) {
  const raw = await params;
  return {
    prefecture: decodeParam(raw.prefecture),
    city: decodeParam(raw.city),
    category: decodeParam(raw.category),
  };
}

async function resolveBaseUrl(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

async function fetchVenues(prefecture: string, city: string, category: VenueCategory): Promise<Venue[]> {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (error) {
    console.error("[venue-category-page] supabase client init failed", error);
    return [];
  }

  const { data, error } = await supabase
    .from("venues")
    .select("*")
    .eq("prefecture", prefecture)
    .eq("city", city)
    .eq("category", category)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[venue-category-page] supabase query failed", error);
    return [];
  }

  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    latitude: row.latitude,
    longitude: row.longitude,
    address: row.address,
    google_place_id: row.google_place_id,
    city: row.city,
    prefecture: row.prefecture,
    category: row.category,
    metadata: parseVenueMetadata(row.metadata),
    created_at: row.created_at,
  }));
}

function faqEntry(question: string, answer: string) {
  return {
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  };
}

function namesMatching(
  venues: Venue[],
  predicate: (metadata: SmokingMetadata) => boolean,
  limit = 5
): string | null {
  const names = venues
    .filter((v) => isSmokingMetadata(v.metadata) && predicate(v.metadata as SmokingMetadata))
    .map((v) => v.name)
    .slice(0, limit);
  return names.length > 0 ? names.join("、") : null;
}

function buildFaqItems(category: VenueCategory, city: string, venues: Venue[]) {
  const label = CATEGORY_LABELS[category];

  if (category === "smoking") {
    const paperNames = namesMatching(venues, (m) => m.allows_paper_cigarettes);
    const electronicNames = namesMatching(venues, (m) => m.allows_electronic_cigarettes_only);
    const ashtrayNames = namesMatching(venues, (m) => m.has_outdoor_ashtray);

    return [
      faqEntry(
        `${city}駅近くで紙タバコが吸える場所はどこですか？`,
        paperNames
          ? `${city}周辺で紙タバコの喫煙が口コミから確認されている店舗には${paperNames}があります。状況は変わる可能性があるため、訪問時に現地の表示もあわせてご確認ください。`
          : `${city}周辺では現時点で紙タバコの喫煙が確認できる店舗の情報が登録されていません。`
      ),
      faqEntry(
        `${city}で電子タバコ専用の喫煙スペースがある店舗はありますか？`,
        electronicNames
          ? `${electronicNames}などが、口コミから電子タバコ専用スペースとして確認されています。`
          : `${city}周辺で電子タバコ専用スペースが確認できる店舗は現時点で登録されていません。`
      ),
      faqEntry(
        `${city}のコンビニで店外に灰皿がある場所はどこですか？`,
        ashtrayNames
          ? `${ashtrayNames}などのコンビニで、口コミから店外灰皿の設置が確認されています。`
          : `${city}周辺で店外灰皿の設置が確認できるコンビニは現時点で登録されていません。`
      ),
    ];
  }

  const names = venues.slice(0, 5).map((v) => v.name);
  return [
    faqEntry(
      `${city}で${label}はどこにありますか？`,
      names.length > 0
        ? `${city}周辺で確認されている${label}には${names.join("、")}などがあります。`
        : `${city}周辺では現時点で${label}の情報が登録されていません。`
    ),
  ];
}

function buildJsonLd(params: {
  prefecture: string;
  city: string;
  category: VenueCategory;
  venues: Venue[];
  pageUrl: string;
}) {
  const { prefecture, city, category, venues, pageUrl } = params;
  const label = CATEGORY_LABELS[category];

  const localBusinesses = venues.map((venue) => {
    const metadata = venue.metadata;
    const amenityFeature =
      category === "smoking" && isSmokingMetadata(metadata)
        ? [
            {
              "@type": "LocationFeatureSpecification",
              name: "紙タバコ喫煙可",
              value: metadata.allows_paper_cigarettes,
            },
            {
              "@type": "LocationFeatureSpecification",
              name: "電子タバコ専用スペース",
              value: metadata.allows_electronic_cigarettes_only,
            },
            {
              "@type": "LocationFeatureSpecification",
              name: "店外灰皿あり",
              value: metadata.has_outdoor_ashtray,
            },
          ]
        : undefined;

    return {
      "@type": "LocalBusiness",
      name: venue.name,
      address: {
        "@type": "PostalAddress",
        streetAddress: venue.address ?? undefined,
        addressLocality: city,
        addressRegion: prefecture,
        addressCountry: "JP",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: venue.latitude,
        longitude: venue.longitude,
      },
      amenityFeature,
    };
  });

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "ItemList",
        url: pageUrl,
        name: `${prefecture}${city}の${label}一覧`,
        itemListElement: localBusinesses.map((business, index) => ({
          "@type": "ListItem",
          position: index + 1,
          item: business,
        })),
      },
      {
        "@type": "FAQPage",
        url: pageUrl,
        mainEntity: buildFaqItems(category, city, venues),
      },
    ],
  };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<RouteParams>;
}): Promise<Metadata> {
  const { prefecture, city, category } = await resolveRouteParams(params);

  if (!isVenueCategory(category)) {
    return { title: "ページが見つかりません" };
  }

  const label = CATEGORY_LABELS[category];
  const title = `${city}（${prefecture}）で${label}を探す`;
  const description = `${prefecture}${city}周辺の${label}を、AIによる口コミ解析付きの地図とリストで検索できます。`;

  const baseUrl = await resolveBaseUrl();
  const path = `/${encodeURIComponent(prefecture)}/${encodeURIComponent(city)}/${encodeURIComponent(category)}`;
  const url = `${baseUrl}${path}`;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      locale: "ja_JP",
      type: "website",
    },
  };
}

export default async function VenueCategoryPage({
  params,
}: {
  params: Promise<RouteParams>;
}) {
  const { prefecture, city, category } = await resolveRouteParams(params);

  if (!isVenueCategory(category)) {
    notFound();
  }

  const venues = await fetchVenues(prefecture, city, category);
  const baseUrl = await resolveBaseUrl();
  const path = `/${encodeURIComponent(prefecture)}/${encodeURIComponent(city)}/${encodeURIComponent(category)}`;
  const jsonLd = buildJsonLd({ prefecture, city, category, venues, pageUrl: `${baseUrl}${path}` });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <VenueExplorer
        venues={venues}
        category={category}
        areaLabel={`${prefecture} ${city} — ${CATEGORY_LABELS[category]}`}
        googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
      />
    </>
  );
}
