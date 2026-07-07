import { getSupabaseServerClient } from "@/lib/supabaseClient";
import { REGION_ORDER, regionForPrefecture, type VenueCategory } from "@/lib/types";
import HomeClient from "./HomeClient";

// エリア一覧はsync-places/import-opendataの実行で随時増えるが、毎回Supabaseに問い合わせるのは
// 画面遷移が遅くなる原因になるため、5分間はエッジキャッシュから返す。
export const revalidate = 300;

interface Area {
  prefecture: string;
  city: string;
}

// venuesは1000件超あるため、Supabase/PostgRESTの1クエリあたり既定上限(1000件)を超えないよう
// ページングしながら全件走査して、重複の無い都道府県・市区町村の一覧を組み立てる。
async function fetchAreas(category: VenueCategory): Promise<Area[]> {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    return [];
  }

  const pageSize = 1000;
  const seen = new Set<string>();
  const areas: Area[] = [];

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("venues")
      .select("prefecture, city")
      .eq("category", category)
      .not("prefecture", "is", null)
      .not("city", "is", null)
      .range(from, from + pageSize - 1);

    if (error || !data) break;

    for (const row of data) {
      const prefecture = row.prefecture as string;
      const city = row.city as string;
      const key = `${prefecture}|${city}`;
      if (seen.has(key)) continue;
      seen.add(key);
      areas.push({ prefecture, city });
    }

    if (data.length < pageSize) break;
  }

  // 北海道→沖縄の地方順（REGION_ORDER）に並べ、同じ地方内は都道府県・市区町村名の五十音順にする。
  areas.sort((a, b) => {
    const regionDiff =
      REGION_ORDER.indexOf(regionForPrefecture(a.prefecture) as (typeof REGION_ORDER)[number]) -
      REGION_ORDER.indexOf(regionForPrefecture(b.prefecture) as (typeof REGION_ORDER)[number]);
    if (regionDiff !== 0) return regionDiff;
    return (a.prefecture + a.city).localeCompare(b.prefecture + b.city, "ja");
  });
  return areas;
}

export default async function Home() {
  const [smokingAreas, workspaceAreas] = await Promise.all([
    fetchAreas("smoking"),
    fetchAreas("workspace"),
  ]);
  return (
    <HomeClient
      smokingAreas={smokingAreas}
      workspaceAreas={workspaceAreas}
      apiKey={process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY}
    />
  );
}
