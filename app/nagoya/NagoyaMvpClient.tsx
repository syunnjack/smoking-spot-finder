"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { loadGoogleMapsScript } from "@/lib/loadGoogleMapsScript";
import {
  haversineMeters,
  isArcadeMetadata,
  isGymMetadata,
  isLaundryMetadata,
  isSaunaMetadata,
  isSmokingMetadata,
  isWorkspaceMetadata,
  type Venue,
  type VenueCategory,
} from "@/lib/types";

const NAGOYA_STATION = { lat: 35.170915, lng: 136.881537 };
const CATEGORIES: VenueCategory[] = ["smoking", "workspace", "laundry", "gym", "sauna", "arcade"];

const CATEGORY_COPY: Record<VenueCategory, { label: string; short: string; empty: string }> = {
  smoking: { label: "喫煙できる場所", short: "喫煙", empty: "喫煙できる場所" },
  workspace: { label: "作業・勉強できる場所", short: "作業", empty: "作業できる場所" },
  laundry: { label: "コインランドリー", short: "洗濯", empty: "コインランドリー" },
  gym: { label: "ジム", short: "ジム", empty: "ジム" },
  sauna: { label: "サウナ・温浴施設", short: "サウナ", empty: "サウナ・温浴施設" },
  arcade: { label: "ゲームセンター", short: "ゲーセン", empty: "ゲームセンター" },
};

type SmokingFilter = "paper" | "electronic" | "ashtray";

const SMOKING_FILTERS: Array<{
  key: SmokingFilter;
  label: string;
  matches: (venue: Venue) => boolean;
}> = [
  {
    key: "paper",
    label: "紙タバコOK",
    matches: (venue) => isSmokingMetadata(venue.metadata) && venue.metadata.allows_paper_cigarettes,
  },
  {
    key: "electronic",
    label: "電子タバコ限定",
    matches: (venue) =>
      isSmokingMetadata(venue.metadata) && venue.metadata.allows_electronic_cigarettes_only,
  },
  {
    key: "ashtray",
    label: "店外灰皿あり",
    matches: (venue) => isSmokingMetadata(venue.metadata) && venue.metadata.has_outdoor_ashtray,
  },
];

function proofOf(venue: Venue): string | null {
  const metadata = venue.metadata;
  if (isSmokingMetadata(metadata)) return metadata.text_proof;
  if (isWorkspaceMetadata(metadata)) return metadata.text_proof;
  if (isLaundryMetadata(metadata)) return metadata.text_proof;
  if (isGymMetadata(metadata)) return metadata.text_proof;
  if (isSaunaMetadata(metadata)) return metadata.text_proof;
  if (isArcadeMetadata(metadata)) return metadata.text_proof;
  return null;
}

function markerColor(venue: Venue): string {
  const metadata = venue.metadata;
  if (venue.category === "smoking" && isSmokingMetadata(metadata)) {
    if (metadata.allows_paper_cigarettes) return "#16a34a";
    if (metadata.allows_electronic_cigarettes_only) return "#2563eb";
    if (metadata.has_outdoor_ashtray) return "#ca8a04";
  }
  if (venue.category === "workspace" && isWorkspaceMetadata(metadata)) {
    if (metadata.has_power_outlet && metadata.has_wifi) return "#4f46e5";
    if (metadata.has_wifi) return "#0891b2";
  }
  if (venue.category === "laundry" && isLaundryMetadata(metadata) && metadata.has_24h) return "#0284c7";
  if (venue.category === "gym" && isGymMetadata(metadata) && metadata.has_24h) return "#dc2626";
  if (venue.category === "sauna" && isSaunaMetadata(metadata) && metadata.has_sauna) return "#059669";
  if (venue.category === "arcade" && isArcadeMetadata(metadata) && metadata.has_crane_game) return "#9333ea";
  return "#64748b";
}

function markerIcon(color: string): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
    scale: 9,
  };
}

function distanceLabel(venue: Venue): string {
  const meters = haversineMeters(NAGOYA_STATION.lat, NAGOYA_STATION.lng, venue.latitude, venue.longitude);
  return meters >= 1000 ? `${(meters / 1000).toFixed(1)}km` : `${Math.round(meters)}m`;
}

export default function NagoyaMvpClient({ apiKey }: { apiKey: string | undefined }) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Record<string, google.maps.Marker>>({});
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [category, setCategory] = useState<VenueCategory>("smoking");
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(apiKey ? null : "Google Maps APIキーが未設定です。");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeSmokingFilters, setActiveSmokingFilters] = useState<Set<SmokingFilter>>(new Set());

  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (!mapDivRef.current) return;
        mapRef.current = new google.maps.Map(mapDivRef.current, {
          center: NAGOYA_STATION,
          zoom: 16,
          gestureHandling: "greedy",
        });
        new google.maps.Marker({
          map: mapRef.current,
          position: NAGOYA_STATION,
          title: "名古屋駅",
          label: "名",
        });
        infoWindowRef.current = new google.maps.InfoWindow();
      })
      .catch((err: Error) => setError(err.message));
  }, [apiKey]);

  useEffect(() => {
    fetch(
      `/api/venues-nearby?category=${category}&latitude=${NAGOYA_STATION.lat}&longitude=${NAGOYA_STATION.lng}`
    )
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "施設データの取得に失敗しました。");
        }
        return res.json();
      })
      .then((data: { venues: Venue[] }) => setVenues(data.venues))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, [apiKey, category]);

  const filteredVenues = useMemo(() => {
    if (category !== "smoking" || activeSmokingFilters.size === 0) return venues;
    return venues.filter((venue) =>
      SMOKING_FILTERS.some((filter) => activeSmokingFilters.has(filter.key) && filter.matches(venue))
    );
  }, [activeSmokingFilters, category, venues]);

  const focusVenue = useCallback((venue: Venue) => {
    setSelectedId(venue.id);
    const map = mapRef.current;
    const marker = markersRef.current[venue.id];
    if (!map || !marker) return;
    map.panTo({ lat: venue.latitude, lng: venue.longitude });
    map.setZoom(18);
    const proof = proofOf(venue);
    infoWindowRef.current?.setContent(
      `<div style="font-family:sans-serif;max-width:240px"><strong>${venue.name}</strong><p style="font-size:12px;color:#555;margin:6px 0 0">${venue.address ?? "住所未登録"}</p>${proof ? `<p style="font-size:12px;color:#374151;margin:6px 0 0">${proof}</p>` : ""}</div>`
    );
    infoWindowRef.current?.open({ map, anchor: marker });
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    Object.values(markersRef.current).forEach((marker) => marker.setMap(null));
    markersRef.current = {};

    for (const venue of filteredVenues) {
      const marker = new google.maps.Marker({
        map,
        position: { lat: venue.latitude, lng: venue.longitude },
        title: venue.name,
        icon: markerIcon(markerColor(venue)),
      });
      marker.addListener("click", () => focusVenue(venue));
      markersRef.current[venue.id] = marker;
    }
  }, [filteredVenues, focusVenue]);

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">Nagoya Station MVP</p>
            <h1 className="text-xl font-bold sm:text-2xl">名古屋駅周辺の便利マップ</h1>
            <p className="mt-1 text-sm text-slate-600">名古屋駅から近い施設だけを、地図と実用フラグで確認できます。</p>
          </div>
          <Link href="/" className="w-fit rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-100">
            トップへ
          </Link>
        </div>
      </header>

      <nav className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
          {CATEGORIES.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => {
                setCategory(item);
                setLoading(true);
                setError(apiKey ? null : "Google Maps APIキーが未設定です。");
                setActiveSmokingFilters(new Set());
                mapRef.current?.panTo(NAGOYA_STATION);
                mapRef.current?.setZoom(16);
              }}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition ${
                category === item
                  ? "border-indigo-600 bg-indigo-600 text-white"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
              }`}
            >
              {CATEGORY_COPY[item].short}
            </button>
          ))}
        </div>
      </nav>

      {category === "smoking" && (
        <div className="border-b border-slate-200 bg-white px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-7xl gap-2 overflow-x-auto">
            {SMOKING_FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                aria-pressed={activeSmokingFilters.has(filter.key)}
                onClick={() =>
                  setActiveSmokingFilters((prev) => {
                    const next = new Set(prev);
                    if (next.has(filter.key)) next.delete(filter.key);
                    else next.add(filter.key);
                    return next;
                  })
                }
                className={`shrink-0 rounded-full border px-4 py-1.5 text-sm font-medium transition ${
                  activeSmokingFilters.has(filter.key)
                    ? "border-emerald-600 bg-emerald-50 text-emerald-700"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <main className="flex flex-1 flex-col md:flex-row">
        <section className="order-2 h-[46vh] overflow-y-auto border-t border-slate-200 bg-white md:order-1 md:h-auto md:w-[420px] md:border-r md:border-t-0">
          <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
            <h2 className="font-bold">{CATEGORY_COPY[category].label}</h2>
            <p className="mt-1 text-sm text-slate-500">名古屋駅から近い順: {filteredVenues.length}件</p>
          </div>

          {error && <p className="px-5 py-4 text-sm text-red-600">{error}</p>}
          {loading && <p className="px-5 py-4 text-sm text-slate-500">読み込み中...</p>}
          {!loading && filteredVenues.length === 0 && (
            <div className="px-5 py-8 text-sm text-slate-600">
              <p className="font-semibold text-slate-900">まだ名古屋駅周辺の{CATEGORY_COPY[category].empty}がありません。</p>
              <p className="mt-2">データ同期後、この画面に地図ピンと口コミ証拠が表示されます。</p>
            </div>
          )}

          <ul className="divide-y divide-slate-100">
            {filteredVenues.map((venue) => {
              const proof = proofOf(venue);
              return (
                <li key={venue.id}>
                  <button
                    type="button"
                    onClick={() => focusVenue(venue)}
                    className={`w-full px-5 py-4 text-left transition hover:bg-slate-50 ${
                      selectedId === venue.id ? "bg-indigo-50" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{venue.name}</p>
                        <p className="mt-1 text-xs text-slate-500">{venue.address ?? "住所未登録"}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
                        {distanceLabel(venue)}
                      </span>
                    </div>
                    {proof && (
                      <blockquote className="mt-3 rounded-md border-l-4 border-indigo-300 bg-slate-50 p-3 text-xs leading-relaxed text-slate-700">
                        {proof}
                        <span className="mt-1 block font-semibold text-slate-500">AIが抽出した口コミ証拠</span>
                      </blockquote>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="relative order-1 h-[48vh] flex-1 md:order-2 md:h-auto">
          <div ref={mapDivRef} className="h-full w-full" />
          <div className="absolute left-4 top-4 rounded-lg bg-white/95 px-3 py-2 text-xs text-slate-700 shadow-md backdrop-blur">
            中心: 名古屋駅 / 近い順に表示
          </div>
        </section>
      </main>
    </div>
  );
}


