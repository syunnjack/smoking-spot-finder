"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import type { SmokingSpot } from "@/lib/types";
import { haversineMeters, regionForPrefecture } from "@/lib/types";
import SmokingSpotsExplorer from "./SmokingSpotsExplorer";

interface Area {
  prefecture: string;
  city: string;
}

type Status = "idle" | "locating" | "loading" | "ready" | "error";

// 位置情報が拒否された場合、端末ごとに許可を出し直す手順が異なるため具体的に案内する。
function permissionDeniedHelp(): string {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) {
    return "iPhoneの「設定」→「プライバシーとセキュリティ」→「位置情報サービス」→ご利用のブラウザを選び、「許可」に変更してから再度お試しください。";
  }
  if (/Android/.test(ua)) {
    return "ブラウザのアドレスバー左側のアイコンをタップ→「サイトの設定」→「位置情報」を「許可」に変更してから再度お試しください。";
  }
  return "ブラウザのアドレスバー付近にある位置情報アイコンから、このサイトの位置情報を「許可」に変更してから再度お試しください。";
}

export default function HomeClient({
  areas,
  apiKey,
}: {
  areas: Area[];
  apiKey: string | undefined;
}) {
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [spots, setSpots] = useState<SmokingSpot[]>([]);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [distances, setDistances] = useState<Record<string, number>>({});

  const findNearest = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setStatus("error");
      setErrorMessage("お使いの端末は現在地機能に対応していません。下のエリア一覧から探してください。");
      return;
    }

    setStatus("locating");
    setErrorMessage(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        setCenter({ lat: latitude, lng: longitude });
        setStatus("loading");

        fetch(`/api/smoking-spots?latitude=${latitude}&longitude=${longitude}`)
          .then(async (res) => {
            if (!res.ok) {
              const body = await res.json().catch(() => null);
              throw new Error(body?.error ?? "喫煙所情報の取得に失敗しました。");
            }
            return res.json();
          })
          .then((data: { spots: SmokingSpot[] }) => {
            const dist: Record<string, number> = {};
            for (const spot of data.spots) {
              dist[spot.place_id] = haversineMeters(latitude, longitude, spot.lat, spot.lng);
            }
            setDistances(dist);
            setSpots(data.spots);
            setStatus("ready");
          })
          .catch((err: Error) => {
            setStatus("error");
            setErrorMessage(err.message);
          });
      },
      (geoError) => {
        setStatus("error");
        setErrorMessage(
          geoError.code === geoError.PERMISSION_DENIED
            ? `位置情報の利用が許可されませんでした。${permissionDeniedHelp()}それでも使えない場合は、下のエリア一覧から探してください。`
            : "現在地を取得できませんでした。電波の良い場所で再度お試しいただくか、下のエリア一覧から探してください。"
        );
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);

  // サーバー側で既に地方順（北→南）にソート済みのため、出現順を保ったままグルーピングするだけでよい。
  const groupedAreas = useMemo(() => {
    const groups = new Map<string, Area[]>();
    for (const area of areas) {
      const region = regionForPrefecture(area.prefecture);
      const list = groups.get(region);
      if (list) {
        list.push(area);
      } else {
        groups.set(region, [area]);
      }
    }
    return [...groups.entries()];
  }, [areas]);

  if (status === "ready" && center) {
    return (
      <div className="flex h-screen w-full flex-col">
        <div className="flex shrink-0 items-center border-b border-gray-200 bg-white px-4 py-2">
          <button
            type="button"
            onClick={() => setStatus("idle")}
            className="rounded-full px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
          >
            ← トップに戻る
          </button>
        </div>
        <div className="min-h-0 flex-1">
          <SmokingSpotsExplorer
            spots={spots}
            center={center}
            apiKey={apiKey}
            title="現在地周辺の喫煙所"
            subtitle={`半径1000m以内で${spots.length}件見つかりました（近い順）`}
            distances={distances}
          />
        </div>
      </div>
    );
  }

  const isBusy = status === "locating" || status === "loading";

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 px-6 py-20 text-center text-white">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[220px] opacity-10">
          📍
        </div>
        <div className="relative">
          <span className="inline-flex animate-pulse items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur">
            📍 現在地からすぐ探せます
          </span>
          <h1 className="mx-auto mt-5 max-w-2xl text-3xl font-bold sm:text-4xl">
            今いる場所から、一番近い喫煙所へ
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-indigo-100">
            コンビニ・飲食店の口コミをAIが解析し、紙タバコ・電子タバコ・店外灰皿の有無を色分けして地図に表示します。
          </p>
          <button
            type="button"
            onClick={findNearest}
            disabled={isBusy}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-10 py-5 text-lg font-bold text-indigo-700 shadow-xl transition hover:scale-105 hover:shadow-2xl disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          >
            {status === "locating"
              ? "現在地を取得中..."
              : status === "loading"
                ? "周辺の喫煙所を検索中..."
                : "📍 現在地から一番近い喫煙所を探す"}
          </button>
          <p className="mt-5">
            <Link href="/ranking" className="text-sm text-indigo-100 underline hover:text-white">
              🏆 喫煙所充実度ランキングを見る
            </Link>
          </p>
          {status === "error" && errorMessage && (
            <p className="mx-auto mt-4 max-w-md rounded-lg bg-white/10 px-4 py-2 text-sm text-white">
              {errorMessage}
            </p>
          )}
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-6 py-12">
        <h2 className="text-lg font-bold text-gray-900">エリアから探す</h2>
        {areas.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">まだ登録されているエリアがありません。</p>
        ) : (
          <div className="mt-4 space-y-8">
            {groupedAreas.map(([region, regionAreas]) => (
              <div key={region}>
                <h3 className="mb-2 text-xs font-bold tracking-wide text-gray-400">{region}</h3>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-3 md:grid-cols-4">
                  {regionAreas.map((area) => (
                    <Link
                      key={`${area.prefecture}-${area.city}`}
                      href={`/${encodeURIComponent(area.prefecture)}/${encodeURIComponent(area.city)}/smoking`}
                      className="truncate text-sm text-indigo-600 hover:underline"
                    >
                      {area.city}
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
