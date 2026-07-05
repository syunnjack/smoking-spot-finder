import { NextRequest, NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseClient";
import { VENUE_CATEGORIES, type Venue, type VenueCategory } from "@/lib/types";

function isVenueCategory(value: string): value is VenueCategory {
  return (VENUE_CATEGORIES as readonly string[]).includes(value);
}

// Supabaseはjsonb列を通常オブジェクトとして返すが、文字列で返るドライバ/経路にも耐えられるようにする。
function parseMetadata(raw: unknown): Record<string, unknown> {
  if (raw && typeof raw === "object") return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return {};
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const city = searchParams.get("city")?.trim() || null;
  const categoryParam = searchParams.get("category")?.trim() || null;

  if (categoryParam && !isVenueCategory(categoryParam)) {
    return NextResponse.json(
      {
        error: `category は次のいずれかを指定してください: ${VENUE_CATEGORIES.join(", ")}`,
      },
      { status: 400 }
    );
  }

  let supabase;
  try {
    supabase = getSupabaseServerClient();
  } catch (error) {
    console.error("[locations] supabase client init failed", error);
    return NextResponse.json(
      { error: "サーバー側の設定不備によりリクエストを処理できません。" },
      { status: 500 }
    );
  }

  try {
    let query = supabase.from("venues").select("*");

    if (city) {
      query = query.eq("city", city);
    }
    if (categoryParam) {
      query = query.eq("category", categoryParam);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      console.error("[locations] supabase query failed", error);
      return NextResponse.json(
        { error: "店舗・施設情報の取得に失敗しました。" },
        { status: 502 }
      );
    }

    const venues: Venue[] = (data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      latitude: row.latitude,
      longitude: row.longitude,
      address: row.address,
      google_place_id: row.google_place_id,
      city: row.city,
      prefecture: row.prefecture,
      category: row.category,
      metadata: parseMetadata(row.metadata),
      created_at: row.created_at,
    }));

    return NextResponse.json({ venues });
  } catch (error) {
    console.error("[locations] unexpected error", error);
    return NextResponse.json(
      { error: "予期しないエラーが発生しました。" },
      { status: 500 }
    );
  }
}
