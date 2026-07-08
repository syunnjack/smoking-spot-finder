"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import type { Venue, VenueCategory } from "@/lib/types";
import {
  isSmokingMetadata,
  isWorkspaceMetadata,
  isLaundryMetadata,
  isGymMetadata,
  isUnknownProof,
  looksLikeConvenienceStore,
} from "@/lib/types";
import { loadGoogleMapsScript } from "@/lib/loadGoogleMapsScript";
import { useFavorites } from "@/lib/useFavorites";
import type { StreetSmokingOrdinance } from "@/lib/streetSmokingOrdinances";
import {
  RAKUTEN_ASHTRAY_SEARCH_URL,
  VAPE_SEARCH_URL,
  WIFIGO_URL,
  WIFIGO_PIXEL,
  ONSUKU_URL,
  ONSUKU_PIXEL,
} from "@/lib/affiliateLinks";

// アフィリエイト導線。
// 「PR」表記は景品表示法のステルスマーケティング規制（2023年10月施行）対応のため、
// リンク差し替え後も必ず残すこと。
// WiFiGO!（ポケットWiFiレンタル）はWi-Fiなしと判定された店舗に、オンスク.JP（資格学習サブスク）は
// 図書館・自習室系の店舗に、それぞれ文脈が合う場合だけ表示する。

// バリューコマース経由の飲食店予約導線は食べログを採用（ホットペッパーグルメは提携申請の承認待ちのため、
// 即時提携できる食べログのMyLinkを先行して使う）。MyLinkは店舗ごとの個別リンクのため、
// 店名で完全一致した店舗にだけ表示する（未掲載店舗にはリンク切れ防止のため出さない）。
// 今後MyLinkが増え次第、このマップに追記していく。
interface RestaurantMyLink {
  href: string;
  pixelSrc: string;
}

// バリューコマースの食べログプログラム（sid/pidは全店共通、vc_urlだけ店舗ごとに変わる）。
const VALUECOMMERCE_SID = 3771711;
const VALUECOMMERCE_TABELOG_PID = 892653767;

function tabelogMyLink(tabelogUrl: string): RestaurantMyLink {
  return {
    href: `https://ck.jp.ap.valuecommerce.com/servlet/referral?sid=${VALUECOMMERCE_SID}&pid=${VALUECOMMERCE_TABELOG_PID}&vc_url=${encodeURIComponent(tabelogUrl)}`,
    pixelSrc: `https://ad.jp.ap.valuecommerce.com/servlet/gifbanner?sid=${VALUECOMMERCE_SID}&pid=${VALUECOMMERCE_TABELOG_PID}`,
  };
}

const TABELOG_MYLINKS: Record<string, RestaurantMyLink> = {
  "やよい軒 静岡ＳＢＳ通り店": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22045016/"),
  "サイゼリヤ 静岡アスティ店": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22022000/"),
  "おにおん": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22009673/"),
  "こもれび食堂": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22029031/"),
  "ジョニーとスミス": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22027709/"),
  "チョンマゲ食堂（自家製手打ち蕎麦・ 天ぷら・ 炭火焼・ 居酒屋）": tabelogMyLink(
    "https://tabelog.com/shizuoka/A2201/A220101/22033679/"
  ),
  "ハル": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22030720/"),
  "ひとつぼし食堂": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22035269/"),
  "ひょうたんや": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22001641/"),
  "ファミリー食堂さいとう": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22000764/"),
  "むらこし食堂": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22011513/"),
  "ゆで太郎 静岡インター通り店": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22032574/"),
  "十千花前": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22001861/"),
  "大衆食堂 定食のまる大 静岡北口店": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22038814/"),
  "家康食堂": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220102/22040674/"),
  "旬魚菜 海どん": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22029069/"),
  "朝までダイニング SHIRUSHI": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22033623/"),
  "清水港みなみ": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22016103/"),
  "食堂 一二三 ヒフミ": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22027482/"),
  "どん": tabelogMyLink("https://tabelog.com/shizuoka/A2201/A220101/22011273/"),
};

// TABELOG_MYLINKSに個別登録が無い店舗向けのフォールバック。
// 食べログの実際の検索フォーム（sa=エリア, sk=キーワード, https://tabelog.com/rst/rstsearch/）から
// 決定的にURLを組み立てる。店名+市区町村さえあれば追加の検索・手動登録なしで全国どの店にも
// 機械的にリンクを張れるため、TABELOG_MYLINKSのような個別対応をスケールさせずに済む。
// 検索結果ページへの遷移になるため、個別ページへ直接飛ぶMyLinkよりは精度が落ちる。
function tabelogSearchMyLink(venueName: string, city: string | null): RestaurantMyLink {
  const searchUrl = `https://tabelog.com/rst/rstsearch/?sa=${encodeURIComponent(
    city ?? ""
  )}&sk=${encodeURIComponent(venueName)}`;
  return tabelogMyLink(searchUrl);
}

function AffiliateSlot({
  href,
  label,
  note,
  pixelSrc,
}: {
  href: string;
  label: string;
  note?: string;
  pixelSrc?: string;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow sponsored"
      onClick={(event) => event.stopPropagation()}
      className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 transition hover:bg-amber-100"
    >
      <span className="mt-0.5 shrink-0 rounded bg-amber-200 px-1 py-0.5 text-[10px] font-bold tracking-wide text-amber-800">
        PR
      </span>
      <span>
        {label}
        {note && <span className="mt-0.5 block text-[10px] font-normal text-amber-700">{note}</span>}
      </span>
      {/* ASP側のインプレッション計測用ピクセル（成果測定用、クリック計測はhref自体で行われる） */}
      {pixelSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={pixelSrc} width={0} height={1} alt="" className="hidden" />
      )}
    </a>
  );
}

const DEFAULT_CENTER = { lat: 35.681236, lng: 139.767125 }; // 東京駅（フォールバック用）

const MARKER_COLORS = {
  paper: "#22c55e",
  electronic: "#3b82f6",
  ashtray: "#eab308",
  none: "#9ca3af",
} as const;

type SmokingFilterKey = "paper" | "electronic" | "ashtray";

const SMOKING_FILTERS: Array<{
  key: SmokingFilterKey;
  label: string;
  matches: (metadata: Record<string, unknown>) => boolean;
}> = [
  {
    key: "paper",
    label: "紙タバコOK",
    matches: (m) => isSmokingMetadata(m) && m.allows_paper_cigarettes,
  },
  {
    key: "electronic",
    label: "電子タバコ限定",
    matches: (m) => isSmokingMetadata(m) && m.allows_electronic_cigarettes_only,
  },
  {
    key: "ashtray",
    label: "コンビニ店外灰皿あり",
    matches: (m) => isSmokingMetadata(m) && m.has_outdoor_ashtray,
  },
];

type WorkspaceFilterKey = "power" | "wifi" | "wired_lan" | "free";

const WORKSPACE_FILTERS: Array<{
  key: WorkspaceFilterKey;
  label: string;
  matches: (metadata: Record<string, unknown>) => boolean;
}> = [
  {
    key: "power",
    label: "電源あり",
    matches: (m) => isWorkspaceMetadata(m) && m.has_power_outlet,
  },
  {
    key: "wifi",
    label: "WIFIあり",
    matches: (m) => isWorkspaceMetadata(m) && m.has_wifi,
  },
  {
    key: "wired_lan",
    label: "有線LANあり",
    matches: (m) => isWorkspaceMetadata(m) && m.has_wired_lan,
  },
  {
    key: "free",
    label: "利用料不要",
    matches: (m) => isWorkspaceMetadata(m) && !m.has_usage_fee,
  },
];

type LaundryFilterKey = "24h" | "large_machine" | "cashless" | "laundry_wifi";

const LAUNDRY_FILTERS: Array<{
  key: LaundryFilterKey;
  label: string;
  matches: (metadata: Record<string, unknown>) => boolean;
}> = [
  {
    key: "24h",
    label: "24時間営業",
    matches: (m) => isLaundryMetadata(m) && m.has_24h,
  },
  {
    key: "large_machine",
    label: "大型機あり",
    matches: (m) => isLaundryMetadata(m) && m.has_large_machine,
  },
  {
    key: "cashless",
    label: "キャッシュレス対応",
    matches: (m) => isLaundryMetadata(m) && m.has_cashless_payment,
  },
  {
    key: "laundry_wifi",
    label: "WIFIあり",
    matches: (m) => isLaundryMetadata(m) && m.has_wifi,
  },
];

type GymFilterKey = "gym_24h" | "dropin" | "shower" | "parking";

const GYM_FILTERS: Array<{
  key: GymFilterKey;
  label: string;
  matches: (metadata: Record<string, unknown>) => boolean;
}> = [
  {
    key: "gym_24h",
    label: "24時間営業",
    matches: (m) => isGymMetadata(m) && m.has_24h,
  },
  {
    key: "dropin",
    label: "都度利用可",
    matches: (m) => isGymMetadata(m) && m.has_dropin,
  },
  {
    key: "shower",
    label: "シャワーあり",
    matches: (m) => isGymMetadata(m) && m.has_shower,
  },
  {
    key: "parking",
    label: "駐車場あり",
    matches: (m) => isGymMetadata(m) && m.has_parking,
  },
];

type FilterKey = SmokingFilterKey | WorkspaceFilterKey | LaundryFilterKey | GymFilterKey;

const CATEGORY_FILTERS: Partial<
  Record<
    VenueCategory,
    Array<{ key: FilterKey; label: string; matches: (metadata: Record<string, unknown>) => boolean }>
  >
> = {
  smoking: SMOKING_FILTERS,
  workspace: WORKSPACE_FILTERS,
  laundry: LAUNDRY_FILTERS,
  gym: GYM_FILTERS,
};

// Claudeが口コミから根拠を見つけられなかった場合に "<UNKNOWN>" 等のプレースホルダーを
// text_proof にそのまま返すことがあるため、UI表示前にその状態を判定する。
function markerColorFor(venue: Venue): string {
  const metadata = venue.metadata;
  if (venue.category === "workspace") {
    if (!isWorkspaceMetadata(metadata)) return MARKER_COLORS.none;
    if (metadata.has_power_outlet && metadata.has_wifi) return MARKER_COLORS.paper;
    if (metadata.has_wifi) return MARKER_COLORS.electronic;
    if (metadata.has_power_outlet || metadata.has_wired_lan) return MARKER_COLORS.ashtray;
    return MARKER_COLORS.none;
  }
  if (venue.category === "laundry") {
    if (!isLaundryMetadata(metadata)) return MARKER_COLORS.none;
    if (metadata.has_24h && metadata.has_large_machine) return MARKER_COLORS.paper;
    if (metadata.has_24h) return MARKER_COLORS.electronic;
    if (metadata.has_large_machine || metadata.has_cashless_payment) return MARKER_COLORS.ashtray;
    return MARKER_COLORS.none;
  }
  if (venue.category === "gym") {
    if (!isGymMetadata(metadata)) return MARKER_COLORS.none;
    if (metadata.has_24h && metadata.has_dropin) return MARKER_COLORS.paper;
    if (metadata.has_dropin) return MARKER_COLORS.electronic;
    if (metadata.has_24h || metadata.has_shower) return MARKER_COLORS.ashtray;
    return MARKER_COLORS.none;
  }
  if (!isSmokingMetadata(metadata)) return MARKER_COLORS.none;
  if (metadata.allows_paper_cigarettes) return MARKER_COLORS.paper;
  if (metadata.allows_electronic_cigarettes_only) return MARKER_COLORS.electronic;
  if (metadata.has_outdoor_ashtray) return MARKER_COLORS.ashtray;
  return MARKER_COLORS.none;
}

// smoking/workspace/laundry/gymいずれのmetadataもtext_proofフィールドを持つため、
// カテゴリを問わず取り出せる。
function textProofOf(metadata: Record<string, unknown>): string | null {
  if (isSmokingMetadata(metadata)) return metadata.text_proof;
  if (isWorkspaceMetadata(metadata)) return metadata.text_proof;
  if (isLaundryMetadata(metadata)) return metadata.text_proof;
  if (isGymMetadata(metadata)) return metadata.text_proof;
  return null;
}

function markerIcon(color: string): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
    scale: 10,
  };
}

const RECENT_UPDATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

// クチコミ提供・再取得で更新された店舗を「更新」バッジで可視化し、情報提供のモチベーションにつなげる。
function isRecentlyUpdated(venue: Venue): boolean {
  if (!venue.updated_at) return false;
  return Date.now() - new Date(venue.updated_at).getTime() <= RECENT_UPDATE_WINDOW_MS;
}

function computeCenter(venues: Venue[]): { lat: number; lng: number } {
  if (venues.length === 0) return DEFAULT_CENTER;
  const sum = venues.reduce(
    (acc, v) => ({ lat: acc.lat + v.latitude, lng: acc.lng + v.longitude }),
    { lat: 0, lng: 0 }
  );
  return { lat: sum.lat / venues.length, lng: sum.lng / venues.length };
}

interface VenueExplorerProps {
  venues: Venue[];
  category: VenueCategory;
  areaLabel: string;
  googleMapsApiKey: string | undefined;
  ordinance?: StreetSmokingOrdinance | null;
  // HomeClientの「現在地から探す」結果表示など、呼び出し側が既に独自の戻る導線を
  // 持っている場合はfalseにして二重表示を防ぐ。
  showBackLink?: boolean;
}

export default function VenueExplorer({
  venues,
  category,
  areaLabel,
  googleMapsApiKey,
  ordinance,
  showBackLink = true,
}: VenueExplorerProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Record<string, google.maps.Marker>>({});
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(
    googleMapsApiKey ? null : "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY が設定されていません。"
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<FilterKey>>(new Set());
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { toggleFavorite, isFavorite } = useFavorites();

  useEffect(() => {
    if (!googleMapsApiKey || !mapDivRef.current) return;
    loadGoogleMapsScript(googleMapsApiKey)
      .then(() => {
        if (!mapDivRef.current) return;
        mapRef.current = new google.maps.Map(mapDivRef.current, {
          center: computeCenter(venues),
          zoom: venues.length > 0 ? 15 : 12,
          // greedy: PCはマウスホイールでそのままズーム、スマホは指1本でパン・2本指ピンチでズーム
          // （地図はページスクロールと競合しない専有レイアウトのため、cooperativeのCtrl+ホイール
          // 要求は不要な手間になる）。
          gestureHandling: "greedy",
        });
        infoWindowRef.current = new google.maps.InfoWindow();
        setMapReady(true);
      })
      .catch((err: Error) => setMapError(err.message));
    // 初回マウント時のみ地図を初期化する（venuesは初期表示の中心座標計算にのみ使う）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleMapsApiKey]);

  const toggleFilter = useCallback((key: FilterKey) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const filteredVenues = useMemo(() => {
    let result = venues;
    const categoryFilters = CATEGORY_FILTERS[category] ?? [];
    if (categoryFilters.length > 0 && activeFilters.size > 0) {
      const activeMatchers = categoryFilters.filter((f) => activeFilters.has(f.key));
      result = result.filter((venue) => activeMatchers.some((f) => f.matches(venue.metadata)));
    }
    if (favoritesOnly) {
      result = result.filter((venue) => isFavorite(venue.id));
    }
    return result;
  }, [venues, category, activeFilters, favoritesOnly, isFavorite]);

  const recentlyUpdatedCount = useMemo(
    () => venues.filter(isRecentlyUpdated).length,
    [venues]
  );

  const focusVenue = useCallback((venue: Venue) => {
    setSelectedId(venue.id);
    const map = mapRef.current;
    const marker = markersRef.current[venue.id];
    if (!map || !marker) return;
    map.panTo({ lat: venue.latitude, lng: venue.longitude });
    map.setZoom(18);
    const proof = textProofOf(venue.metadata);
    const proofUnknown = proof !== null && isUnknownProof(proof);
    const unknownLabel =
      venue.category === "workspace"
        ? "作業環境: 不明"
        : venue.category === "laundry" || venue.category === "gym"
          ? "設備情報: 不明"
          : "喫煙可否: 不明";
    const reviewUrl = `https://search.google.com/local/writereview?placeid=${venue.google_place_id}`;
    infoWindowRef.current?.setContent(
      `<div style="font-family: sans-serif; max-width: 220px;">
        <p style="font-weight: 600; margin-bottom: 4px;">${venue.name}</p>
        ${
          proofUnknown
            ? `<p style="font-size: 12px; color: #6b7280;">${unknownLabel}<br /><a href="${reviewUrl}" target="_blank" rel="noopener noreferrer" style="color: #4f46e5;">Googleマップのクチコミで教える →</a></p>`
            : proof
              ? `<p style="font-size: 12px; color: #374151;">${proof}</p>`
              : ""
        }
      </div>`
    );
    infoWindowRef.current?.open({ map, anchor: marker });
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    clustererRef.current?.clearMarkers();
    Object.values(markersRef.current).forEach((marker) => marker.setMap(null));
    markersRef.current = {};

    const markers = filteredVenues.map((venue) => {
      const marker = new google.maps.Marker({
        position: { lat: venue.latitude, lng: venue.longitude },
        title: venue.name,
        icon: markerIcon(markerColorFor(venue)),
      });
      marker.addListener("click", () => focusVenue(venue));
      markersRef.current[venue.id] = marker;
      return marker;
    });

    if (!clustererRef.current) {
      clustererRef.current = new MarkerClusterer({ map: mapRef.current });
    }
    clustererRef.current.addMarkers(markers);
  }, [mapReady, filteredVenues, focusVenue]);

  return (
    <div className="flex h-[calc(100vh-3.5rem)] w-full flex-col bg-gray-50">
      {showBackLink && (
        <div className="flex shrink-0 items-center border-b border-gray-200 bg-white px-4 py-2">
          <Link
            href="/"
            className="rounded-full px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            ← トップに戻る
          </Link>
        </div>
      )}
      {ordinance && (
        <a
          href="#ordinance-details"
          className="flex shrink-0 items-center gap-2 border-b border-amber-300 bg-amber-100 px-4 py-2 text-xs font-medium text-amber-900 hover:bg-amber-200 sm:text-sm"
        >
          <span aria-hidden className="text-base">⚠️</span>
          <span>
            このエリアには<strong>路上喫煙防止条例</strong>があります(違反で{ordinance.fine})。詳しく見る ↓
          </span>
        </a>
      )}
      <div className="flex flex-wrap gap-2 border-b border-gray-200 bg-white px-4 py-3">
        {(CATEGORY_FILTERS[category] ?? []).map(
          (filter) => {
            const active = activeFilters.has(filter.key);
            return (
              <button
                key={filter.key}
                type="button"
                onClick={() => toggleFilter(filter.key)}
                aria-pressed={active}
                className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  active
                    ? "border-indigo-600 bg-indigo-600 text-white"
                    : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
                }`}
              >
                {filter.label}
              </button>
            );
          }
        )}
        <button
          type="button"
          onClick={() => setFavoritesOnly((prev) => !prev)}
          aria-pressed={favoritesOnly}
          className={`rounded-full border px-4 py-1.5 text-sm font-medium transition ${
            favoritesOnly
              ? "border-rose-500 bg-rose-500 text-white"
              : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
          }`}
        >
          ♥ お気に入りのみ
        </button>
      </div>

      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="order-2 flex h-1/2 w-full flex-col overflow-y-auto border-t border-gray-200 bg-white md:order-1 md:h-full md:w-96 md:border-r md:border-t-0">
          <div className="border-b border-gray-200 px-5 py-4">
            <h1 className="text-lg font-bold text-gray-900">{areaLabel}</h1>
            <p className="mt-1 text-xs text-gray-500">
              {filteredVenues.length}件の店舗・施設
              {recentlyUpdatedCount > 0 && (
                <span className="ml-2 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
                  直近7日で{recentlyUpdatedCount}件更新
                </span>
              )}
            </p>
          </div>

          {mapError && <p className="px-5 py-4 text-sm text-red-600">{mapError}</p>}
          {filteredVenues.length === 0 && (
            <p className="px-5 py-4 text-sm text-gray-500">
              条件に一致する店舗・施設が見つかりませんでした。
            </p>
          )}

          <ul className="flex-1 divide-y divide-gray-100">
            {filteredVenues.map((venue) => {
              const metadata = venue.metadata;
              const isSmoking = isSmokingMetadata(metadata);
              const isWorkspace = isWorkspaceMetadata(metadata);
              const isLaundry = isLaundryMetadata(metadata);
              const isGym = isGymMetadata(metadata);
              const proof = textProofOf(metadata);
              const proofUnknown = proof !== null && isUnknownProof(proof);
              const showAshtrayAffiliate = isSmoking && metadata.has_outdoor_ashtray;
              // venuesテーブルは店舗種別を持たないため名称から簡易推定。公園はどちらの導線にも該当しない。
              const isPark = venue.name.includes("公園");
              const isRestaurantLike = isSmoking && !isPark && !looksLikeConvenienceStore(venue.name);
              const curatedTabelogLink = TABELOG_MYLINKS[venue.name];
              const tabelogLink = isRestaurantLike
                ? (curatedTabelogLink ?? tabelogSearchMyLink(venue.name, venue.city))
                : undefined;
              const showVapeAffiliate = isSmoking && metadata.allows_electronic_cigarettes_only;
              const showWifiGoAffiliate = isWorkspace && metadata.has_wifi === false;
              const isStudyVenue =
                venue.category === "workspace" &&
                (venue.name.includes("図書館") || venue.name.includes("自習室"));
              return (
                <li key={venue.id} className="relative">
                  <button
                    type="button"
                    onClick={() => toggleFavorite(venue.id)}
                    aria-pressed={isFavorite(venue.id)}
                    aria-label="お気に入りに登録"
                    className={`absolute right-1 top-1 p-2.5 text-lg leading-none transition hover:scale-110 ${
                      isFavorite(venue.id) ? "text-rose-500" : "text-gray-300"
                    }`}
                  >
                    {isFavorite(venue.id) ? "♥" : "♡"}
                  </button>
                  <button
                    type="button"
                    onClick={() => focusVenue(venue)}
                    className={`w-full px-5 py-3 pr-10 text-left transition hover:bg-gray-50 ${
                      selectedId === venue.id ? "bg-indigo-50" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ backgroundColor: markerColorFor(venue) }}
                      />
                      <span className="truncate text-sm font-medium text-gray-900">
                        {venue.name}
                      </span>
                      {isRecentlyUpdated(venue) && (
                        <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">
                          更新
                        </span>
                      )}
                    </div>
                    {venue.address && (
                      <p className="mt-0.5 truncate text-xs text-gray-500">{venue.address}</p>
                    )}
                    {isWorkspace && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {metadata.has_power_outlet && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            ⚡電源
                          </span>
                        )}
                        {metadata.has_wifi && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            📶WIFI
                          </span>
                        )}
                        {metadata.has_wired_lan && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            🖧有線LAN
                          </span>
                        )}
                        <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                          {metadata.has_usage_fee ? "💰利用料あり" : "利用料なし"}
                        </span>
                      </div>
                    )}
                    {isLaundry && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {metadata.has_24h && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            🕐24時間
                          </span>
                        )}
                        {metadata.has_large_machine && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            🧺大型機
                          </span>
                        )}
                        {metadata.has_cashless_payment && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            💳キャッシュレス
                          </span>
                        )}
                        {metadata.has_wifi && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            📶WIFI
                          </span>
                        )}
                      </div>
                    )}
                    {isGym && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {metadata.has_24h && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            🕐24時間
                          </span>
                        )}
                        {metadata.has_dropin && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            🎫都度利用可
                          </span>
                        )}
                        {metadata.has_shower && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            🚿シャワー
                          </span>
                        )}
                        {metadata.has_parking && (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">
                            🅿️駐車場
                          </span>
                        )}
                      </div>
                    )}
                    {proof && !proofUnknown && (
                      <blockquote className="mt-2 rounded border-l-4 border-indigo-300 bg-gray-50 p-2 text-xs italic text-gray-700">
                        “{proof}”
                        <span className="mt-1 block not-italic text-[10px] font-medium text-gray-600">
                          — AIによる口コミ解析結果
                        </span>
                      </blockquote>
                    )}
                  </button>
                  {proofUnknown && (
                    <div className="-mt-1 px-5 pb-3">
                      <div className="rounded border-l-4 border-gray-300 bg-gray-50 p-2 text-xs text-gray-600">
                        <span className="font-medium">
                          {isWorkspace
                            ? "作業環境: 不明"
                            : isLaundry || isGym
                              ? "設備情報: 不明"
                              : "喫煙可否: 不明"}
                        </span>
                        <p className="mt-1">
                          口コミからは確認できませんでした。ご存知の方は
                          <a
                            href={`https://search.google.com/local/writereview?placeid=${venue.google_place_id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="font-medium text-indigo-600 underline"
                          >
                            Googleマップのクチコミ
                          </a>
                          で教えてください。
                        </p>
                      </div>
                    </div>
                  )}
                  {(showAshtrayAffiliate ||
                    tabelogLink ||
                    showVapeAffiliate ||
                    showWifiGoAffiliate ||
                    isStudyVenue) && (
                    <div className="-mt-1 flex flex-col gap-2 px-5 pb-3">
                      {showAshtrayAffiliate && (
                        <AffiliateSlot
                          href={RAKUTEN_ASHTRAY_SEARCH_URL}
                          label="灰こぼれ・火の不始末、大丈夫？消臭・飛散防止設計の携帯灰皿はコレ"
                        />
                      )}
                      {tabelogLink && (
                        <AffiliateSlot
                          href={tabelogLink.href}
                          pixelSrc={tabelogLink.pixelSrc}
                          label={
                            curatedTabelogLink
                              ? "【喫煙席を確保】食べログでこのお店の口コミ・空席情報を確認する"
                              : "食べログでこのお店を検索する"
                          }
                        />
                      )}
                      {showVapeAffiliate && (
                        <AffiliateSlot
                          href={VAPE_SEARCH_URL}
                          label="TEREAが吸えるIQOS互換機「Fasoul Q1」。USB Type-C充電・1100mAhをチェック"
                          note="20歳未満の方の喫煙・購入はできません"
                        />
                      )}
                      {showWifiGoAffiliate && (
                        <AffiliateSlot
                          href={WIFIGO_URL}
                          pixelSrc={WIFIGO_PIXEL}
                          label="この店舗はWi-Fiなし。1日180円〜のポケットWiFiレンタル「WiFiGO!」を持ち込もう"
                        />
                      )}
                      {isStudyVenue && (
                        <AffiliateSlot
                          href={ONSUKU_URL}
                          pixelSrc={ONSUKU_PIXEL}
                          label="ここでの勉強、資格取得にもつなげてみる？スキマ時間で70講座以上が学び放題「オンスク.JP」"
                        />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </aside>

        <main className="relative order-1 h-1/2 w-full md:order-2 md:h-full md:flex-1">
          <div ref={mapDivRef} className="h-full w-full" />
          {category === "smoking" && (
            <div className="absolute bottom-4 left-4 z-10 rounded-lg bg-white/95 px-3 py-2 text-xs text-gray-700 shadow-md backdrop-blur">
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500" />紙タバコOK
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />電子タバコ限定
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />店外灰皿あり
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />情報なし
                </span>
              </div>
            </div>
          )}
          {category === "workspace" && (
            <div className="absolute bottom-4 left-4 z-10 rounded-lg bg-white/95 px-3 py-2 text-xs text-gray-700 shadow-md backdrop-blur">
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500" />電源+WIFIあり
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />WIFIのみ
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />電源/有線LANのみ
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />情報なし
                </span>
              </div>
            </div>
          )}
          {category === "laundry" && (
            <div className="absolute bottom-4 left-4 z-10 rounded-lg bg-white/95 px-3 py-2 text-xs text-gray-700 shadow-md backdrop-blur">
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500" />24時間+大型機
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />24時間のみ
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />大型機/決済のみ
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />情報なし
                </span>
              </div>
            </div>
          )}
          {category === "gym" && (
            <div className="absolute bottom-4 left-4 z-10 rounded-lg bg-white/95 px-3 py-2 text-xs text-gray-700 shadow-md backdrop-blur">
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-green-500" />24時間+都度利用可
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-blue-500" />都度利用可のみ
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-yellow-500" />24時間/シャワーのみ
                </span>
                <span className="flex items-center gap-1">
                  <span className="h-2.5 w-2.5 rounded-full bg-gray-400" />情報なし
                </span>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
