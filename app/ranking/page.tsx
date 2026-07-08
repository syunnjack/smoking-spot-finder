import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabaseClient";
import { isSmokingMetadata, parseVenueMetadata } from "@/lib/types";
import { RAKUTEN_ASHTRAY_SEARCH_URL, VAPE_SEARCH_URL } from "@/lib/affiliateLinks";
import PrBanner from "@/app/PrBanner";

// 5分間はエッジキャッシュから返し、毎回全件集計をやり直さない（画面遷移の高速化）。
export const revalidate = 300;

export const metadata: Metadata = {
  title: "喫煙所充実度ランキング｜市区町村別",
  description:
    "コンビニ・飲食店の口コミをAIが解析し、喫煙可能な店舗の割合が高い市区町村をランキング形式で紹介します。",
};

interface CityStats {
  prefecture: string;
  city: string;
  total: number;
  smokingOk: number;
  rate: number;
}

async function fetchRanking(): Promise<CityStats[]> {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    return [];
  }

  const pageSize = 1000;
  const rows: { prefecture: string | null; city: string | null; metadata: unknown }[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("venues")
      .select("prefecture, city, metadata")
      .eq("category", "smoking")
      .not("prefecture", "is", null)
      .not("city", "is", null)
      .range(from, from + pageSize - 1);

    if (error || !data) break;
    rows.push(...data);
    if (data.length < pageSize) break;
  }

  const byCity = new Map<string, CityStats>();
  for (const row of rows) {
    const prefecture = row.prefecture as string;
    const city = row.city as string;
    const key = `${prefecture}|${city}`;
    const entry = byCity.get(key) ?? { prefecture, city, total: 0, smokingOk: 0, rate: 0 };

    entry.total += 1;
    const metadata = parseVenueMetadata(row.metadata);
    if (
      isSmokingMetadata(metadata) &&
      (metadata.allows_paper_cigarettes ||
        metadata.allows_electronic_cigarettes_only ||
        metadata.has_outdoor_ashtray)
    ) {
      entry.smokingOk += 1;
    }

    byCity.set(key, entry);
  }

  const stats = [...byCity.values()].map((entry) => ({
    ...entry,
    rate: entry.total > 0 ? entry.smokingOk / entry.total : 0,
  }));

  stats.sort((a, b) => b.rate - a.rate || b.total - a.total);
  return stats;
}

export default async function RankingPage() {
  const stats = await fetchRanking();

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm font-medium text-gray-500 hover:text-gray-900">
        ← トップに戻る
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-gray-900 sm:text-3xl">
        喫煙所充実度ランキング
      </h1>
      <p className="mt-3 text-sm text-gray-600">
        各市区町村のコンビニ・飲食店のうち、口コミのAI解析で喫煙可能(紙タバコ・電子タバコ・店外灰皿のいずれか)と確認できた店舗の割合が高い順に並べています。
      </p>
      <p className="mt-2 text-sm">
        <Link href="/ranking/workspace" className="text-indigo-600 hover:underline">
          💻 電源・WIFI充実度ランキングはこちら
        </Link>
      </p>

      {stats.length === 0 ? (
        <p className="mt-8 text-sm text-gray-500">まだデータがありません。</p>
      ) : (
        <ol className="mt-8 divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
          {stats.map((stat, index) => (
            <li key={`${stat.prefecture}-${stat.city}`} className="flex items-center gap-4 px-5 py-4">
              <span className="w-8 shrink-0 text-right text-lg font-bold text-gray-400">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <Link
                  href={`/${encodeURIComponent(stat.prefecture)}/${encodeURIComponent(stat.city)}/smoking`}
                  className="truncate font-medium text-indigo-600 hover:underline"
                >
                  {stat.prefecture}{stat.city}
                </Link>
                <p className="mt-0.5 text-xs text-gray-500">
                  調査{stat.total}件中{stat.smokingOk}件で喫煙可能を確認
                </p>
              </div>
              <span className="shrink-0 text-xl font-bold text-gray-900">
                {Math.round(stat.rate * 100)}
                <span className="text-sm font-normal text-gray-500">%</span>
              </span>
            </li>
          ))}
        </ol>
      )}

      <PrBanner
        items={[
          {
            href: RAKUTEN_ASHTRAY_SEARCH_URL,
            label: "灰こぼれ・火の不始末、大丈夫？消臭・飛散防止設計の携帯灰皿はコレ",
          },
          {
            href: VAPE_SEARCH_URL,
            label: "TEREAが吸えるIQOS互換機「Fasoul Q1」。USB Type-C充電・1100mAhをチェック",
            note: "20歳未満の方の喫煙・購入はできません",
          },
        ]}
      />
    </div>
  );
}
