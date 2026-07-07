"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import type { SmokingSpot } from "@/lib/types";
import { isUnknownProof } from "@/lib/types";
import { loadGoogleMapsScript } from "@/lib/loadGoogleMapsScript";

const MARKER_COLORS = {
  paper: "#22c55e", // 紙タバコOK
  electronic: "#3b82f6", // 電子タバコ限定
  ashtray: "#eab308", // コンビニ店外灰皿あり
  none: "#9ca3af", // 情報なし
} as const;

function getMarkerColor(spot: SmokingSpot): string {
  if (spot.smoking.allows_paper) return MARKER_COLORS.paper;
  if (spot.smoking.allows_electronic) return MARKER_COLORS.electronic;
  if (spot.category === "convenience_store" && spot.smoking.has_outside_ashtray) {
    return MARKER_COLORS.ashtray;
  }
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

// 現在地マーカー。店舗マーカー（緑/青/黄/グレー）と混同しないよう濃紺+太い白縁+大きめサイズで強調する。
function currentLocationIcon(): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: "#1e3a8a",
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 4,
    scale: 12,
  };
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters / 10) * 10}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

interface SmokingSpotsExplorerProps {
  spots: SmokingSpot[];
  center: { lat: number; lng: number };
  apiKey: string | undefined;
  title: string;
  subtitle: string;
  loading?: boolean;
  error?: string | null;
  // place_id -> ユーザー現在地からの距離(m)。渡された場合は近い順に並び替えて表示する。
  distances?: Record<string, number>;
}

export default function SmokingSpotsExplorer({
  spots,
  center,
  apiKey,
  title,
  subtitle,
  loading = false,
  error = null,
  distances,
}: SmokingSpotsExplorerProps) {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Record<string, google.maps.Marker>>({});
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const currentLocationMarkerRef = useRef<google.maps.Marker | null>(null);
  const clustererRef = useRef<MarkerClusterer | null>(null);

  const [mapError, setMapError] = useState<string | null>(
    apiKey ? null : "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY が設定されていません。"
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);

  useEffect(() => {
    if (!apiKey) return;
    loadGoogleMapsScript(apiKey)
      .then(() => {
        if (!mapDivRef.current) return;
        mapRef.current = new google.maps.Map(mapDivRef.current, {
          center,
          zoom: 16,
          // greedy: PCはマウスホイールでそのままズーム、スマホは指1本でパン・2本指ピンチでズーム
          // （地図はページスクロールと競合しない専有レイアウトのため、cooperativeのCtrl+ホイール
          // 要求は不要な手間になる）。
          gestureHandling: "greedy",
        });
        infoWindowRef.current = new google.maps.InfoWindow();
        setMapReady(true);
      })
      .catch((err: Error) => setMapError(err.message));
    // 地図の初期化は1回のみ。中心地点の更新はmapReady後の別effectでpanToする。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    mapRef.current.panTo(center);
  }, [mapReady, center]);

  // distancesが渡されている＝centerがユーザーの実際の現在地（/smokingの固定地点ではない）ときだけ
  // 「現在地」マーカーを表示する。
  useEffect(() => {
    if (!mapReady || !mapRef.current || !distances) return;

    if (!currentLocationMarkerRef.current) {
      currentLocationMarkerRef.current = new google.maps.Marker({
        position: center,
        map: mapRef.current,
        title: "現在地",
        icon: currentLocationIcon(),
        zIndex: 999,
      });
    } else {
      currentLocationMarkerRef.current.setPosition(center);
    }
  }, [mapReady, center, distances]);

  const sortedSpots = useMemo(() => {
    if (!distances) return spots;
    return [...spots].sort(
      (a, b) => (distances[a.place_id] ?? Infinity) - (distances[b.place_id] ?? Infinity)
    );
  }, [spots, distances]);

  const focusSpot = useCallback((spot: SmokingSpot) => {
    setSelectedId(spot.place_id);
    const map = mapRef.current;
    const marker = markersRef.current[spot.place_id];
    if (!map || !marker) return;
    map.panTo({ lat: spot.lat, lng: spot.lng });
    map.setZoom(18);
    const proofUnknown = isUnknownProof(spot.smoking.proof_text);
    const reviewUrl = `https://search.google.com/local/writereview?placeid=${spot.place_id}`;
    infoWindowRef.current?.setContent(
      `<div style="font-family: sans-serif; max-width: 220px;">
        <p style="font-weight: 600; margin-bottom: 4px;">${spot.name}</p>
        ${
          proofUnknown
            ? `<p style="font-size: 12px; color: #6b7280;">喫煙可否: 不明<br /><a href="${reviewUrl}" target="_blank" rel="noopener noreferrer" style="color: #4f46e5;">Googleマップのクチコミで教える →</a></p>`
            : `<p style="font-size: 12px; color: #374151;">${spot.smoking.proof_text}</p>`
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

    const markers = sortedSpots.map((spot) => {
      const marker = new google.maps.Marker({
        position: { lat: spot.lat, lng: spot.lng },
        title: spot.name,
        icon: markerIcon(getMarkerColor(spot)),
      });
      marker.addListener("click", () => focusSpot(spot));
      markersRef.current[spot.place_id] = marker;
      return marker;
    });

    if (!clustererRef.current) {
      clustererRef.current = new MarkerClusterer({ map: mapRef.current });
    }
    clustererRef.current.addMarkers(markers);
  }, [mapReady, sortedSpots, focusSpot]);

  return (
    <div className="flex h-full w-full flex-col bg-gray-50 md:flex-row">
      <aside className="order-2 flex h-1/2 w-full flex-col overflow-y-auto border-t border-gray-200 bg-white md:order-1 md:h-full md:w-96 md:border-r md:border-t-0">
        <div className="border-b border-gray-200 px-5 py-4">
          <h1 className="text-lg font-bold text-gray-900">{title}</h1>
          <p className="mt-1 text-xs text-gray-500">{subtitle}</p>
          <ul className="mt-3 flex flex-wrap gap-3 text-xs text-gray-600">
            <li className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full bg-green-500" /> 紙タバコOK
            </li>
            <li className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full bg-blue-500" /> 電子タバコ限定
            </li>
            <li className="flex items-center gap-1">
              <span className="h-3 w-3 rounded-full bg-yellow-500" /> 店外灰皿あり
            </li>
          </ul>
        </div>

        {loading && <p className="px-5 py-4 text-sm text-gray-500">読み込み中...</p>}
        {(error || mapError) && (
          <p className="px-5 py-4 text-sm text-red-600">{error ?? mapError}</p>
        )}
        {!loading && !error && sortedSpots.length === 0 && (
          <p className="px-5 py-4 text-sm text-gray-500">周辺で店舗が見つかりませんでした。</p>
        )}

        <ul className="flex-1 divide-y divide-gray-100">
          {sortedSpots.map((spot) => {
            const proofUnknown = isUnknownProof(spot.smoking.proof_text);
            const distance = distances?.[spot.place_id];
            return (
              <li key={spot.place_id}>
                <button
                  type="button"
                  onClick={() => focusSpot(spot)}
                  className={`w-full px-5 py-3 text-left transition hover:bg-gray-50 ${
                    selectedId === spot.place_id ? "bg-indigo-50" : ""
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="h-2.5 w-2.5 shrink-0 rounded-full"
                      style={{ backgroundColor: getMarkerColor(spot) }}
                    />
                    <span className="truncate text-sm font-medium text-gray-900">
                      {spot.name}
                    </span>
                    {distance !== undefined && (
                      <span className="ml-auto shrink-0 rounded-full bg-indigo-50 px-2 py-0.5 text-[10px] font-semibold text-indigo-700">
                        {formatDistance(distance)}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-gray-500">{spot.address}</p>
                  {selectedId === spot.place_id && !proofUnknown && (
                    <p className="mt-2 rounded bg-gray-100 p-2 text-xs text-gray-700">
                      {spot.smoking.proof_text}
                    </p>
                  )}
                </button>
                {selectedId === spot.place_id && proofUnknown && (
                  <div className="-mt-1 px-5 pb-3">
                    <div className="rounded border-l-4 border-gray-300 bg-gray-50 p-2 text-xs text-gray-600">
                      <span className="font-medium">喫煙可否: 不明</span>
                      <p className="mt-1">
                        口コミからは確認できませんでした。ご存知の方は
                        <a
                          href={`https://search.google.com/local/writereview?placeid=${spot.place_id}`}
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
              </li>
            );
          })}
        </ul>
      </aside>

      <main className="relative order-1 h-1/2 w-full md:order-2 md:h-full md:flex-1">
        <div ref={mapDivRef} className="h-full w-full" />
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
      </main>
    </div>
  );
}
