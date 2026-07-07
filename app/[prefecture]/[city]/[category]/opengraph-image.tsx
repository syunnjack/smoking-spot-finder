import { ImageResponse } from "next/og";
import { getSupabaseServerClient } from "@/lib/supabaseClient";
import { CATEGORY_LABELS, isVenueCategory, type VenueCategory } from "@/lib/types";
import { OgCard, OG_CONTENT_TYPE, OG_SIZE } from "@/app/ogImageCard";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

function decodeParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

async function countVenues(prefecture: string, city: string, category: string): Promise<number> {
  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch {
    return 0;
  }

  const { count } = await supabase
    .from("venues")
    .select("*", { count: "exact", head: true })
    .eq("prefecture", prefecture)
    .eq("city", city)
    .eq("category", category);

  return count ?? 0;
}

export default async function Image({
  params,
}: {
  params: Promise<{ prefecture: string; city: string; category: string }>;
}) {
  const raw = await params;
  const prefecture = decodeParam(raw.prefecture);
  const city = decodeParam(raw.city);
  const category = decodeParam(raw.category);
  const label = isVenueCategory(category) ? CATEGORY_LABELS[category as VenueCategory] : category;
  const count = await countVenues(prefecture, city, category);

  return new ImageResponse(
    (
      <OgCard
        eyebrow="喫煙所ファインダー"
        heading={`${prefecture}${city}`}
        subheading={`${label}を${count}件掲載`}
      />
    ),
    { ...size }
  );
}
