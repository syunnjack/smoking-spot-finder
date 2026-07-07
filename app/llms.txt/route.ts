import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseClient";
import { CATEGORY_LABELS, type VenueCategory } from "@/lib/types";

// llms.txt: LLMクローラー（ChatGPT検索・Perplexity等）向けにサイト構造を要約するための慣習的ファイル。
// https://llmstxt.org/ 参照。エリアはsync-places/import-opendataで随時増えるため動的に生成する。
export const dynamic = "force-dynamic";

function resolveBaseUrl(): string {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

interface AreaCategory {
  prefecture: string;
  city: string;
  category: VenueCategory;
}

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
      const category = row.category as VenueCategory;
      const key = `${prefecture}|${city}|${category}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ prefecture, city, category });
    }

    if (data.length < pageSize) break;
  }

  results.sort((a, b) => (a.prefecture + a.city).localeCompare(b.prefecture + b.city, "ja"));
  return results;
}

export async function GET() {
  const baseUrl = resolveBaseUrl();
  const areaCategories = await fetchAreaCategories();

  const lines: string[] = [
    "# 喫煙所ファインダー",
    "",
    "> 全国の市区町村ごとに、コンビニ・飲食店の喫煙可否を口コミのAI解析で判定し、地図とリストで検索できるサービス。" +
      "紙タバコ可否・電子タバコ専用・店外灰皿の有無で色分けして表示する。現在地から一番近い喫煙所も検索できる。",
    "",
    "## トップページ",
    `- [現在地から一番近い喫煙所を探す](${baseUrl}/)`,
    "",
    "## エリア一覧",
  ];

  for (const { prefecture, city, category } of areaCategories) {
    const label = CATEGORY_LABELS[category] ?? category;
    const url = `${baseUrl}/${encodeURIComponent(prefecture)}/${encodeURIComponent(city)}/${encodeURIComponent(category)}`;
    lines.push(`- [${prefecture}${city}の${label}](${url})`);
  }

  return new NextResponse(lines.join("\n"), {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
