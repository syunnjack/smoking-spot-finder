import type { MetadataRoute } from "next";
import { getSupabaseServerClient } from "@/lib/supabaseClient";

// sitemap.ts/robots.tsはリクエストヘッダーを参照できないため、本番ドメインは環境変数で与える。
// 未設定時はlocalhostにフォールバックする（.env.localに NEXT_PUBLIC_SITE_URL を設定すること）。
function resolveBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

interface AreaCategory {
  prefecture: string;
  city: string;
  category: string;
}

// venuesは1000件超あるため、Supabase/PostgRESTの1クエリあたり既定上限(1000件)を超えないよう
// ページングしながら全件走査して、重複の無い都道府県・市区町村・カテゴリの組み合わせを集める。
async function fetchAreaCategories(): Promise<AreaCategory[]> {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    return [];
  }

  const pageSize = 1000;
  const seen = new Set<string>();
  const results: AreaCategory[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("venues")
      .select("prefecture, city, category")
      .not("prefecture", "is", null)
      .not("city", "is", null)
      .range(from, from + pageSize - 1);

    if (error || !data) break;

    for (const row of data) {
      const prefecture = row.prefecture as string;
      const city = row.city as string;
      const category = row.category as string;
      const key = `${prefecture}|${city}|${category}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ prefecture, city, category });
    }

    if (data.length < pageSize) break;
  }

  return results;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = resolveBaseUrl();
  const areaCategories = await fetchAreaCategories();

  const entries: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: "daily", priority: 1 },
    { url: `${baseUrl}/ranking`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/smoking`, changeFrequency: "weekly", priority: 0.5 },
  ];

  for (const { prefecture, city, category } of areaCategories) {
    entries.push({
      url: `${baseUrl}/${encodeURIComponent(prefecture)}/${encodeURIComponent(city)}/${encodeURIComponent(category)}`,
      changeFrequency: "daily",
      priority: 0.8,
    });
  }

  return entries;
}
