import { ImageResponse } from "next/og";
import { getSupabaseServerClient } from "@/lib/supabaseClient";
import { isSmokingMetadata, parseVenueMetadata } from "@/lib/types";
import { OgCard, OG_CONTENT_TYPE, OG_SIZE } from "@/app/ogImageCard";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

async function fetchTopCity(): Promise<{ prefecture: string; city: string; rate: number } | null> {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    return null;
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

  const byCity = new Map<string, { prefecture: string; city: string; total: number; ok: number }>();
  for (const row of rows) {
    const prefecture = row.prefecture as string;
    const city = row.city as string;
    const key = `${prefecture}|${city}`;
    const entry = byCity.get(key) ?? { prefecture, city, total: 0, ok: 0 };
    entry.total += 1;
    const metadata = parseVenueMetadata(row.metadata);
    if (
      isSmokingMetadata(metadata) &&
      (metadata.allows_paper_cigarettes ||
        metadata.allows_electronic_cigarettes_only ||
        metadata.has_outdoor_ashtray)
    ) {
      entry.ok += 1;
    }
    byCity.set(key, entry);
  }

  let top: { prefecture: string; city: string; rate: number } | null = null;
  for (const entry of byCity.values()) {
    const rate = entry.total > 0 ? entry.ok / entry.total : 0;
    if (!top || rate > top.rate) {
      top = { prefecture: entry.prefecture, city: entry.city, rate };
    }
  }
  return top;
}

export default async function Image() {
  const top = await fetchTopCity();
  const subheading = top
    ? `1位は${top.prefecture}${top.city}（喫煙可能率${Math.round(top.rate * 100)}%）`
    : "口コミAI解析でわかる、喫煙可能率が高い街は？";

  return new ImageResponse(
    (
      <OgCard
        eyebrow="喫煙所ファインダー"
        heading="喫煙所充実度ランキング"
        subheading={subheading}
        showLegend={false}
      />
    ),
    { ...size }
  );
}
