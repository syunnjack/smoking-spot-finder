import { ImageResponse } from "next/og";
import { getSupabaseServerClient } from "@/lib/supabaseClient";
import { OgCard, OG_CONTENT_TYPE, OG_SIZE } from "./ogImageCard";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

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
      .eq("category", "smoking")
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
        eyebrow="喫煙所ファインダー"
        heading="現在地から、一番近い喫煙所へ"
        subheading={`全国${areaCount}エリアのコンビニ・飲食店をAIが解析`}
      />
    ),
    { ...size }
  );
}
