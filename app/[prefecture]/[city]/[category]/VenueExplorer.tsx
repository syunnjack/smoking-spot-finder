"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Venue, VenueCategory } from "@/lib/types";
import { isSmokingMetadata } from "@/lib/types";
import { loadGoogleMapsScript } from "@/lib/loadGoogleMapsScript";

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

function markerColorFor(venue: Venue): string {
  const metadata = venue.metadata;
  if (!isSmokingMetadata(metadata)) return MARKER_COLORS.none;
  if (metadata.allows_paper_cigarettes) return MARKER_COLORS.paper;
  if (metadata.allows_electronic_cigarettes_only) return MARKER_COLORS.electronic;
  if (metadata.has_outdoor_ashtray) return MARKER_COLORS.ashtray;
  return MARKER_COLORS.none;
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
}

export default function VenueExplorer({
  venues,
  category,
  areaLabel,
  googleMapsApiKey,
}: VenueExplorerProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Record<string, google.maps.Marker>>({});
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(
    googleMapsApiKey ? null : "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY が設定されていません。"
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeFilters, setActiveFilters] = useState<Set<SmokingFilterKey>>(new Set());

  useEffect(() => {
    if (!googleMapsApiKey || !mapDivRef.current) return;
    loadGoogleMapsScript(googleMapsApiKey)
      .then(() => {
        if (!mapDivRef.current) return;
        mapRef.current = new google.maps.Map(mapDivRef.current, {
          center: computeCenter(venues),
          zoom: venues.length > 0 ? 15 : 12,
        });
        infoWindowRef.current = new google.maps.InfoWindow();
        setMapReady(true);
      })
      .catch((err: Error) => setMapError(err.message));
    // 初回マウント時のみ地図を初期化する（venuesは初期表示の中心座標計算にのみ使う）。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleMapsApiKey]);

  const toggleFilter = useCallback((key: SmokingFilterKey) => {
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
    if (category !== "smoking" || activeFilters.size === 0) return venues;
    const activeMatchers = SMOKING_FILTERS.filter((f) => activeFilters.has(f.key));
    return venues.filter((venue) =>
      activeMatchers.some((f) => f.matches(venue.metadata))
    );
  }, [venues, category, activeFilters]);

  const focusVenue = useCallback((venue: Venue) => {
    setSelectedId(venue.id);
    const map = mapRef.current;
    const marker = markersRef.current[venue.id];
    if (!map || !marker) return;
    map.panTo({ lat: venue.latitude, lng: venue.longitude });
    map.setZoom(18);
    const metadata = venue.metadata;
    const proof = isSmokingMetadata(metadata) ? metadata.text_proof : null;
    infoWindowRef.current?.setContent(
      `<div style="font-family: sans-serif; max-width: 220px;">
        <p style="font-weight: 600; margin-bottom: 4px;">${venue.name}</p>
        ${proof ? `<p style="font-size: 12px; color: #374151;">${proof}</p>` : ""}
      </div>`
    );
    infoWindowRef.current?.open({ map, anchor: marker });
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    Object.values(markersRef.current).forEach((marker) => marker.setMap(null));
    markersRef.current = {};

    filteredVenues.forEach((venue) => {
      const marker = new google.maps.Marker({
        position: { lat: venue.latitude, lng: venue.longitude },
        map: mapRef.current!,
        title: venue.name,
        icon: markerIcon(markerColorFor(venue)),
      });
      marker.addListener("click", () => focusVenue(venue));
      markersRef.current[venue.id] = marker;
    });
  }, [mapReady, filteredVenues, focusVenue]);

  return (
    <div className="flex h-screen w-full flex-col bg-gray-50">
      {category === "smoking" && (
        <div className="flex flex-wrap gap-2 border-b border-gray-200 bg-white px-4 py-3">
          {SMOKING_FILTERS.map((filter) => {
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
          })}
        </div>
      )}

      <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
        <aside className="order-2 flex h-1/2 w-full flex-col overflow-y-auto border-t border-gray-200 bg-white md:order-1 md:h-full md:w-96 md:border-r md:border-t-0">
          <div className="border-b border-gray-200 px-5 py-4">
            <h1 className="text-lg font-bold text-gray-900">{areaLabel}</h1>
            <p className="mt-1 text-xs text-gray-500">{filteredVenues.length}件の店舗・施設</p>
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
              const proof = isSmokingMetadata(metadata) ? metadata.text_proof : null;
              return (
                <li key={venue.id}>
                  <button
                    type="button"
                    onClick={() => focusVenue(venue)}
                    className={`w-full px-5 py-3 text-left transition hover:bg-gray-50 ${
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
                    </div>
                    {venue.address && (
                      <p className="mt-0.5 truncate text-xs text-gray-500">{venue.address}</p>
                    )}
                    {proof && (
                      <blockquote className="mt-2 rounded border-l-4 border-indigo-300 bg-gray-50 p-2 text-xs italic text-gray-700">
                        “{proof}”
                        <span className="mt-1 block not-italic text-[10px] font-medium text-gray-400">
                          — AIによる口コミ解析結果
                        </span>
                      </blockquote>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        <main className="order-1 h-1/2 w-full md:order-2 md:h-full md:flex-1">
          <div ref={mapDivRef} className="h-full w-full" />
        </main>
      </div>
    </div>
  );
}
