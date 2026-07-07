import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabaseClient";
import {
  CATEGORY_LABELS,
  isVenueCategory,
  isSmokingMetadata,
  isWorkspaceMetadata,
  parseVenueMetadata,
  type Venue,
  type VenueCategory,
} from "@/lib/types";
import { findOrdinance } from "@/lib/streetSmokingOrdinances";
import VenueExplorer from "./VenueExplorer";

// 5分間はVercelのエッジキャッシュから即座に返し、毎回Supabaseへ問い合わせない（画面遷移の高速化）。
// sync-places/import-opendataの更新はこの間隔で反映されれば十分なため許容している。
export const revalidate = 300;

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

// headers()を読むと全リクエストが強制的に動的レンダリングになりISRが効かなくなるため、
// 本番ドメインが確定した後は環境変数から組み立てる（sitemap.ts/robots.tsと同じ方式）。
function resolveBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
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
    updated_at: row.updated_at,
  }));
}

// 同じ都道府県内の他の市区町村への内部リンク用（クロール性・回遊率の向上のため）。
async function fetchNearbyAreas(
  prefecture: string,
  city: string,
  category: VenueCategory
): Promise<string[]> {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    return [];
  }

  const { data, error } = await supabase
    .from("venues")
    .select("city")
    .eq("prefecture", prefecture)
    .eq("category", category)
    .neq("city", city)
    .not("city", "is", null);

  if (error || !data) return [];

  const cities = [...new Set(data.map((row) => row.city as string))];
  cities.sort((a, b) => a.localeCompare(b, "ja"));
  return cities.slice(0, 12);
}

function faqEntry(question: string, answer: string) {
  return {
    "@type": "Question",
    name: question,
    acceptedAnswer: { "@type": "Answer", text: answer },
  };
}

function namesMatching<T>(
  venues: Venue[],
  guard: (value: unknown) => value is T,
  predicate: (metadata: T) => boolean,
  limit = 5
): string | null {
  const names = venues
    .filter((v) => guard(v.metadata) && predicate(v.metadata as T))
    .map((v) => v.name)
    .slice(0, limit);
  return names.length > 0 ? names.join("、") : null;
}

function buildFaqItems(category: VenueCategory, city: string, venues: Venue[]) {
  const label = CATEGORY_LABELS[category];

  if (category === "smoking") {
    const paperNames = namesMatching(venues, isSmokingMetadata, (m) => m.allows_paper_cigarettes);
    const electronicNames = namesMatching(
      venues,
      isSmokingMetadata,
      (m) => m.allows_electronic_cigarettes_only
    );
    const ashtrayNames = namesMatching(venues, isSmokingMetadata, (m) => m.has_outdoor_ashtray);

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

  if (category === "workspace") {
    const powerNames = namesMatching(venues, isWorkspaceMetadata, (m) => m.has_power_outlet);
    const wifiNames = namesMatching(venues, isWorkspaceMetadata, (m) => m.has_wifi);
    const freeNames = namesMatching(venues, isWorkspaceMetadata, (m) => !m.has_usage_fee);

    return [
      faqEntry(
        `${city}で電源が使えるカフェ・コワーキングスペースはどこですか？`,
        powerNames
          ? `${city}周辺で電源(コンセント)が利用できると口コミから確認されている店舗・施設には${powerNames}があります。座席数に限りがある場合があるため、訪問時に現地でもご確認ください。`
          : `${city}周辺では現時点で電源の利用が確認できる店舗・施設の情報が登録されていません。`
      ),
      faqEntry(
        `${city}でWIFIが使える自習室・カフェはありますか？`,
        wifiNames
          ? `${wifiNames}などが、口コミからWIFI利用可能と確認されています。`
          : `${city}周辺でWIFI利用が確認できる店舗・施設は現時点で登録されていません。`
      ),
      faqEntry(
        `${city}で無料で作業できる場所はどこですか？`,
        freeNames
          ? `${freeNames}などは、口コミから座席利用料が不要(飲食の注文のみ)と確認されています。`
          : `${city}周辺で利用料が不要と確認できる店舗・施設は現時点で登録されていません。`
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
  baseUrl: string;
}) {
  const { prefecture, city, category, venues, pageUrl, baseUrl } = params;
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
        : category === "workspace" && isWorkspaceMetadata(metadata)
          ? [
              {
                "@type": "LocationFeatureSpecification",
                name: "電源あり",
                value: metadata.has_power_outlet,
              },
              {
                "@type": "LocationFeatureSpecification",
                name: "WIFIあり",
                value: metadata.has_wifi,
              },
              {
                "@type": "LocationFeatureSpecification",
                name: "有線LANあり",
                value: metadata.has_wired_lan,
              },
              {
                "@type": "LocationFeatureSpecification",
                name: "利用料あり",
                value: metadata.has_usage_fee,
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
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "トップページ", item: baseUrl },
          {
            "@type": "ListItem",
            position: 2,
            name: `${prefecture}${city}の${label}`,
            item: pageUrl,
          },
        ],
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

  const baseUrl = resolveBaseUrl();
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

  // 互いに依存しないSupabaseクエリは並列実行し、往復回数分の待ち時間を減らす。
  const [venues, nearbyAreas] = await Promise.all([
    fetchVenues(prefecture, city, category),
    fetchNearbyAreas(prefecture, city, category),
  ]);
  const baseUrl = resolveBaseUrl();
  const path = `/${encodeURIComponent(prefecture)}/${encodeURIComponent(city)}/${encodeURIComponent(category)}`;
  const pageUrl = `${baseUrl}${path}`;
  const jsonLd = buildJsonLd({ prefecture, city, category, venues, pageUrl, baseUrl });
  const label = CATEGORY_LABELS[category];

  const lastUpdated = venues.reduce<string | null>((latest, venue) => {
    if (!venue.updated_at) return latest;
    return !latest || venue.updated_at > latest ? venue.updated_at : latest;
  }, null);
  const faqItems = buildFaqItems(category, city, venues);
  const ordinance = category === "smoking" ? findOrdinance(prefecture, city) : null;

  const shareText = `${prefecture}${city}の${label}一覧`;
  const lineShareUrl = `https://social-plugins.line.me/lineit/share?url=${encodeURIComponent(pageUrl)}`;
  const xShareUrl = `https://twitter.com/intent/tweet?url=${encodeURIComponent(pageUrl)}&text=${encodeURIComponent(shareText)}`;

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <VenueExplorer
        venues={venues}
        category={category}
        areaLabel={`${prefecture} ${city} — ${label}`}
        googleMapsApiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
        ordinance={ordinance}
      />

      <footer className="mx-auto max-w-3xl px-6 py-12">
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={lineShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-[#06C755] px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            LINEで送る
          </a>
          <a
            href={xShareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-full bg-black px-4 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            Xでポスト
          </a>
          {lastUpdated && (
            <span className="ml-auto text-xs text-gray-500">
              最終更新: <time dateTime={lastUpdated}>{new Date(lastUpdated).toLocaleDateString("ja-JP")}</time>
            </span>
          )}
        </div>

        {ordinance && (
          <section id="ordinance-details" className="mt-10 scroll-mt-4 rounded-lg border border-amber-200 bg-amber-50 p-5">
            <h2 className="text-lg font-bold text-gray-900">路上喫煙防止条例について</h2>
            <p className="mt-2 text-sm text-gray-700">
              {prefecture}{city}には<span className="font-medium">{ordinance.ordinanceName}</span>があります。
            </p>
            <dl className="mt-3 space-y-2 text-sm text-gray-700">
              <div>
                <dt className="font-medium text-gray-900">禁止区域</dt>
                <dd>{ordinance.prohibitedAreas}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-900">罰則</dt>
                <dd>{ordinance.fine}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs text-gray-500">
              区域や金額は変更されることがあります。最新情報は
              <a
                href={ordinance.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-indigo-600 underline"
              >
                自治体の公式サイト
              </a>
              でご確認ください。
            </p>
          </section>
        )}

        {faqItems.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-bold text-gray-900">よくある質問</h2>
            <dl className="mt-4 space-y-4">
              {faqItems.map((item) => (
                <div key={item.name}>
                  <dt className="font-medium text-gray-900">{item.name}</dt>
                  <dd className="mt-1 text-sm text-gray-600">{item.acceptedAnswer.text}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {nearbyAreas.length > 0 && (
          <section className="mt-10">
            <h2 className="text-lg font-bold text-gray-900">{prefecture}の他のエリア</h2>
            <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3">
              {nearbyAreas.map((nearbyCity) => (
                <Link
                  key={nearbyCity}
                  href={`/${encodeURIComponent(prefecture)}/${encodeURIComponent(nearbyCity)}/${encodeURIComponent(category)}`}
                  className="truncate text-sm text-indigo-600 hover:underline"
                >
                  {nearbyCity}
                </Link>
              ))}
            </div>
          </section>
        )}
      </footer>
    </>
  );
}
