"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { SmokingSpot } from "@/lib/types";

const SHIZUOKA_STATION = { lat: 34.9715, lng: 138.3891 };

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

function loadGoogleMapsScript(apiKey: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.maps) {
      resolve();
      return;
    }
    const existing = document.getElementById("google-maps-script");
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () =>
        reject(new Error("Google Maps の読み込みに失敗しました"))
      );
      return;
    }
    const script = document.createElement("script");
    script.id = "google-maps-script";
    script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}`;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Google Maps の読み込みに失敗しました"));
    document.head.appendChild(script);
  });
}

export default function SmokingSpotsPage() {
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<Record<string, google.maps.Marker>>({});
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const [spots, setSpots] = useState<SmokingSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(
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
          center: SHIZUOKA_STATION,
          zoom: 16,
        });
        infoWindowRef.current = new google.maps.InfoWindow();
        setMapReady(true);
      })
      .catch((err: Error) => setError(err.message));
  }, [apiKey]);

  useEffect(() => {
    fetch("/api/smoking-spots")
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error ?? "データの取得に失敗しました");
        }
        return res.json();
      })
      .then((data: { spots: SmokingSpot[] }) => setSpots(data.spots))
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const focusSpot = useCallback((spot: SmokingSpot) => {
    setSelectedId(spot.place_id);
    const map = mapRef.current;
    const marker = markersRef.current[spot.place_id];
    if (!map || !marker) return;
    map.panTo({ lat: spot.lat, lng: spot.lng });
    map.setZoom(18);
    infoWindowRef.current?.setContent(
      `<div style="font-family: sans-serif; max-width: 220px;">
        <p style="font-weight: 600; margin-bottom: 4px;">${spot.name}</p>
        <p style="font-size: 12px; color: #374151;">${spot.smoking.proof_text}</p>
      </div>`
    );
    infoWindowRef.current?.open({ map, anchor: marker });
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current) return;

    Object.values(markersRef.current).forEach((marker) => marker.setMap(null));
    markersRef.current = {};

    spots.forEach((spot) => {
      const marker = new google.maps.Marker({
        position: { lat: spot.lat, lng: spot.lng },
        map: mapRef.current!,
        title: spot.name,
        icon: markerIcon(getMarkerColor(spot)),
      });
      marker.addListener("click", () => focusSpot(spot));
      markersRef.current[spot.place_id] = marker;
    });
  }, [mapReady, spots, focusSpot]);

  return (
    <div className="flex h-screen w-full flex-col bg-gray-50 md:flex-row">
      <aside className="order-2 flex h-1/2 w-full flex-col overflow-y-auto border-t border-gray-200 bg-white md:order-1 md:h-full md:w-96 md:border-r md:border-t-0">
        <div className="border-b border-gray-200 px-5 py-4">
          <h1 className="text-lg font-bold text-gray-900">静岡駅 喫煙所マップ</h1>
          <p className="mt-1 text-xs text-gray-500">
            半径1000m以内のコンビニ・飲食店の口コミをAIが解析
          </p>
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
        {error && <p className="px-5 py-4 text-sm text-red-600">{error}</p>}

        <ul className="flex-1 divide-y divide-gray-100">
          {spots.map((spot) => (
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
                </div>
                <p className="mt-0.5 truncate text-xs text-gray-500">{spot.address}</p>
                {selectedId === spot.place_id && (
                  <p className="mt-2 rounded bg-gray-100 p-2 text-xs text-gray-700">
                    {spot.smoking.proof_text}
                  </p>
                )}
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="order-1 h-1/2 w-full md:order-2 md:h-full md:flex-1">
        <div ref={mapDivRef} className="h-full w-full" />
      </main>
    </div>
  );
}
