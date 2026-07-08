import { ImageResponse } from "next/og";
import { getSupabaseServerClient } from "@/lib/supabaseClient";
import { OgCard, OG_CONTENT_TYPE, OG_SIZE } from "./ogImageCard";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

// ジャンル横断でエリア数（都道府県+市区町村の重複なし件数）を数える。
// トップページのOGPは特定ジャンルに偏らせず、5ジャンル横断のスケール感を伝える。
async function countAreas(): Promise<number> {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    return 0;
  }

  const pageSize = 1000;
  const seen = new Set<string>();

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("venues")
      .select("prefecture, city")
      .not("prefecture", "is", null)
      .not("city", "is", null)
      .range(from, from + pageSize - 1);

    if (error || !data) break;
    for (const row of data) seen.add(`${row.prefecture}|${row.city}`);
    if (data.length < pageSize) break;
  }

  return seen.size;
}

export default async function Image() {
  const areaCount = await countAreas();

  return new ImageResponse(
    (
      <OgCard
        eyebrow="近くナビ"
        heading="今いる場所から、必要な場所へ"
        subheading={`全国${areaCount}エリアで作業スペース・ジム・サウナ・コインランドリー・喫煙所をAIが解析`}
      />
    ),
    { ...size }
  );
}
