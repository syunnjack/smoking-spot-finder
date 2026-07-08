import type { Metadata } from "next";
import Link from "next/link";
import { getSupabaseServerClient } from "@/lib/supabaseClient";
import { isWorkspaceMetadata, parseVenueMetadata } from "@/lib/types";
import { WIFIGO_URL, WIFIGO_PIXEL, ONSUKU_URL, ONSUKU_PIXEL } from "@/lib/affiliateLinks";
import PrBanner from "@/app/PrBanner";

// 5分間はエッジキャッシュから返し、毎回全件集計をやり直さない（画面遷移の高速化）。
export const revalidate = 300;

export const metadata: Metadata = {
  title: "電源・WIFI充実度ランキング｜市区町村別",
  description:
    "カフェ・コワーキングスペース・図書館の口コミをAIが解析し、電源・WIFIが両方使えると確認できた店舗・施設の割合が高い市区町村をランキング形式で紹介します。",
};

interface CityStats {
  prefecture: string;
  city: string;
  total: number;
  workReady: number;
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
      .eq("category", "workspace")
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
    const entry = byCity.get(key) ?? { prefecture, city, total: 0, workReady: 0, rate: 0 };

    entry.total += 1;
    const metadata = parseVenueMetadata(row.metadata);
    if (isWorkspaceMetadata(metadata) && metadata.has_power_outlet && metadata.has_wifi) {
      entry.workReady += 1;
    }

    byCity.set(key, entry);
  }

  const stats = [...byCity.values()].map((entry) => ({
    ...entry,
    rate: entry.total > 0 ? entry.workReady / entry.total : 0,
  }));

  stats.sort((a, b) => b.rate - a.rate || b.total - a.total);
  return stats;
}

export default async function WorkspaceRankingPage() {
  const stats = await fetchRanking();

  return (
    <div className="mx-auto max-w-3xl px-6 py-16">
      <Link href="/" className="text-sm font-medium text-gray-500 hover:text-gray-900">
        ← トップに戻る
      </Link>
      <h1 className="mt-4 text-2xl font-bold text-gray-900 sm:text-3xl">
        電源・WIFI充実度ランキング
      </h1>
      <p className="mt-3 text-sm text-gray-600">
        各市区町村のカフェ・コワーキングスペース・図書館のうち、口コミのAI解析で電源・WIFIの両方が使えると確認できた店舗・施設の割合が高い順に並べています。
      </p>
      <p className="mt-2 text-sm">
        <Link href="/ranking" className="text-indigo-600 hover:underline">
          🚬 喫煙所充実度ランキングはこちら
        </Link>
      </p>

      {stats.length > 0 && (
        <Link
          href={`/${encodeURIComponent(stats[0].prefecture)}/${encodeURIComponent(stats[0].city)}/workspace`}
          className="mt-6 flex items-center justify-between rounded-lg border border-indigo-200 bg-indigo-50 px-5 py-4 transition hover:bg-indigo-100"
        >
          <span className="text-sm text-gray-700">
            🏆 1位は
            <span className="font-bold text-indigo-700">
              {stats[0].prefecture}{stats[0].city}
            </span>
            (電源・WIFI充実率{Math.round(stats[0].rate * 100)}%)
          </span>
          <span className="shrink-0 text-sm font-semibold text-indigo-600">
            実際の店舗一覧を見る →
          </span>
        </Link>
      )}

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
                  href={`/${encodeURIComponent(stat.prefecture)}/${encodeURIComponent(stat.city)}/workspace`}
                  className="truncate font-medium text-indigo-600 hover:underline"
                >
                  {stat.prefecture}{stat.city}
                </Link>
                <p className="mt-0.5 text-xs text-gray-500">
                  調査{stat.total}件中{stat.workReady}件で電源・WIFIの両方を確認
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
            href: WIFIGO_URL,
            pixelSrc: WIFIGO_PIXEL,
            label: "作業先にWi-Fiがなくても安心。1日180円〜のポケットWiFiレンタル「WiFiGO!」をチェック",
          },
          {
            href: ONSUKU_URL,
            pixelSrc: ONSUKU_PIXEL,
            label: "スキマ時間で資格取得。70講座以上が学び放題「オンスク.JP」をチェック",
          },
        ]}
      />
    </div>
  );
}
