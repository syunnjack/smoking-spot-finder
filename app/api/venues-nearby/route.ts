import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseClient";
import { haversineMeters, isVenueCategory, parseVenueMetadata, type Venue } from "@/lib/types";

// /api/smoking-spots と違い、ライブのGoogle Places+Claude取得へはフォールバックしない
// （カテゴリごとに検索type・解析プロンプトを持つscripts/sync-places.tsのロジックをAPI層に
// 複製しないための割り切り）。sync-places.tsで事前収集済みのキャッシュのみを距離順に返す。
const DEFAULT_RADIUS_METERS: Record<string, number> = {
  smoking: 1000,
  workspace: 3000,
  laundry: 2000,
  gym: 3000,
  sauna: 5000,
  arcade: 3000,
};

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function boundingBox(lat: number, lng: number, radiusMeters: number) {
  const latDelta = radiusMeters / 111320;
  const lngDelta = radiusMeters / (111320 * Math.cos(toRad(lat)) || 1);
  return {
    minLat: lat - latDelta,
    maxLat: lat + latDelta,
    minLng: lng - lngDelta,
    maxLng: lng + lngDelta,
  };
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const lat = parseFloat(searchParams.get("latitude") ?? "");
  const lng = parseFloat(searchParams.get("longitude") ?? "");
  const category = searchParams.get("category") ?? "";

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json(
      { error: "latitude/longitudeを指定してください。" },
      { status: 400 }
    );
  }
  if (!isVenueCategory(category)) {
    return NextResponse.json({ error: "categoryが不正です。" }, { status: 400 });
  }

  const radiusMeters = DEFAULT_RADIUS_METERS[category] ?? 2000;

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (error) {
    console.error("[venues-nearby] supabase client init failed", error);
    return NextResponse.json(
      { error: "サーバー側の設定不備によりリクエストを処理できません。" },
      { status: 500 }
    );
  }

  const { minLat, maxLat, minLng, maxLng } = boundingBox(lat, lng, radiusMeters);

  const { data, error } = await supabase
    .from("venues")
    .select("*")
    .eq("category", category)
    .gte("latitude", minLat)
    .lte("latitude", maxLat)
    .gte("longitude", minLng)
    .lte("longitude", maxLng);

  if (error) {
    console.error("[venues-nearby] supabase query failed", error);
    return NextResponse.json({ error: "取得に失敗しました。" }, { status: 502 });
  }

  const venues: Venue[] = (data ?? [])
    .map(
      (row): Venue => ({
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
        opening_hours: row.opening_hours ?? null,
        created_at: row.created_at,
        updated_at: row.updated_at,
      })
    )
    .filter((v) => haversineMeters(lat, lng, v.latitude, v.longitude) <= radiusMeters)
    .sort(
      (a, b) =>
        haversineMeters(lat, lng, a.latitude, a.longitude) -
        haversineMeters(lat, lng, b.latitude, b.longitude)
    );

  return NextResponse.json({ center: { lat, lng }, venues, radiusMeters });
}
