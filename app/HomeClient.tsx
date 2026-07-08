"use client";

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { SmokingSpot, Venue } from "@/lib/types";
import { haversineMeters, regionForPrefecture } from "@/lib/types";
import SmokingSpotsExplorer from "./SmokingSpotsExplorer";
import VenueExplorer from "./[prefecture]/[city]/[category]/VenueExplorer";

interface Area {
  prefecture: string;
  city: string;
}

type Genre = "smoking" | "workspace" | "laundry" | "gym" | "sauna";
type Status = "idle" | "locating" | "loading" | "ready" | "error";

const GENRES: Genre[] = ["smoking", "workspace", "laundry", "gym", "sauna"];

const GENRE_COPY: Record<
  Genre,
  {
    label: string;
    heading: string;
    sub: string;
    buttonIdle: string;
    buttonLoading: string;
    rankingHref: string;
    rankingLabel: string;
  }
> = {
  smoking: {
    label: "🚬 喫煙できる場所",
    heading: "今いる場所から、一番近い喫煙所へ",
    sub: "コンビニ・飲食店の口コミをAIが解析し、紙タバコ・電子タバコ・店外灰皿の有無を色分けして地図に表示します。",
    buttonIdle: "📍 現在地から一番近い喫煙所を探す",
    buttonLoading: "周辺の喫煙所を検索中...",
    rankingHref: "/ranking",
    rankingLabel: "🏆 喫煙所充実度ランキングを見る",
  },
  workspace: {
    label: "💻 作業・勉強できる場所",
    heading: "今いる場所から、作業・勉強できる場所へ",
    sub: "カフェ・コワーキングスペース・図書館の口コミをAIが解析し、電源・WIFI・有線LAN・利用料の有無を地図に表示します。",
    buttonIdle: "📍 現在地から一番近い作業スポットを探す",
    buttonLoading: "周辺の作業スポットを検索中...",
    rankingHref: "/ranking/workspace",
    rankingLabel: "🏆 電源・WIFI充実度ランキングを見る",
  },
  laundry: {
    label: "🧺 コインランドリー",
    heading: "今いる場所から、一番近いコインランドリーへ",
    sub: "口コミをAIが解析し、24時間営業・大型洗濯機/乾燥機・キャッシュレス対応・WIFIの有無を地図に表示します。",
    buttonIdle: "📍 現在地から一番近いコインランドリーを探す",
    buttonLoading: "周辺のコインランドリーを検索中...",
    rankingHref: "/ranking/laundry",
    rankingLabel: "🏆 コインランドリー充実度ランキングを見る",
  },
  gym: {
    label: "💪 ジム",
    heading: "今いる場所から、一番近いジムへ",
    sub: "口コミをAIが解析し、24時間営業・都度利用可・シャワー・駐車場の有無を地図に表示します。",
    buttonIdle: "📍 現在地から一番近いジムを探す",
    buttonLoading: "周辺のジムを検索中...",
    rankingHref: "/ranking/gym",
    rankingLabel: "🏆 ジム充実度ランキングを見る",
  },
  sauna: {
    label: "🧖 サウナ・温浴施設",
    heading: "今いる場所から、一番近いサウナへ",
    sub: "口コミをAIが解析し、サウナ・水風呂・岩盤浴・露天風呂の有無を地図に表示します。",
    buttonIdle: "📍 現在地から一番近いサウナを探す",
    buttonLoading: "周辺のサウナを検索中...",
    rankingHref: "/ranking/sauna",
    rankingLabel: "🏆 サウナ充実度ランキングを見る",
  },
};

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
  smokingAreas,
  workspaceAreas,
  laundryAreas,
  gymAreas,
  saunaAreas,
  apiKey,
}: {
  smokingAreas: Area[];
  workspaceAreas: Area[];
  laundryAreas: Area[];
  gymAreas: Area[];
  saunaAreas: Area[];
  apiKey: string | undefined;
}) {
  // ヘッダーの各ジャンルリンク（/?genre=workspace 等）から来た場合に初期選択を合わせる。
  const searchParams = useSearchParams();
  const [genre, setGenre] = useState<Genre>(() => {
    const requested = searchParams.get("genre");
    return GENRES.includes(requested as Genre) ? (requested as Genre) : "smoking";
  });
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [spots, setSpots] = useState<SmokingSpot[]>([]);
  const [genericVenues, setGenericVenues] = useState<Venue[]>([]);
  const [center, setCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [distances, setDistances] = useState<Record<string, number>>({});

  const switchGenre = useCallback((next: Genre) => {
    setGenre(next);
    setStatus("idle");
    setErrorMessage(null);
  }, []);

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

        if (genre === "smoking") {
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
          return;
        }

        fetch(`/api/venues-nearby?category=${genre}&latitude=${latitude}&longitude=${longitude}`)
          .then(async (res) => {
            if (!res.ok) {
              const body = await res.json().catch(() => null);
              throw new Error(body?.error ?? "情報の取得に失敗しました。");
            }
            return res.json();
          })
          .then((data: { venues: Venue[] }) => {
            if (data.venues.length === 0) {
              setStatus("error");
              setErrorMessage(
                "現在地周辺にはまだデータがありません。下のエリア一覧から探してください。"
              );
              return;
            }
            setGenericVenues(data.venues);
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
  }, [genre]);

  const AREAS_BY_GENRE: Record<Genre, Area[]> = {
    smoking: smokingAreas,
    workspace: workspaceAreas,
    laundry: laundryAreas,
    gym: gymAreas,
    sauna: saunaAreas,
  };
  const areas = AREAS_BY_GENRE[genre];

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
      <div className="flex h-[calc(100vh-3.5rem)] w-full flex-col">
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
          {genre === "smoking" ? (
            <SmokingSpotsExplorer
              spots={spots}
              center={center}
              apiKey={apiKey}
              title="現在地周辺の喫煙所"
              subtitle={`半径1000m以内で${spots.length}件見つかりました（近い順）`}
              distances={distances}
            />
          ) : (
            <VenueExplorer
              venues={genericVenues}
              category={genre}
              areaLabel={`現在地周辺の${GENRE_COPY[genre].label.replace(/^\S+\s/, "")}`}
              googleMapsApiKey={apiKey}
              showBackLink={false}
            />
          )}
        </div>
      </div>
    );
  }

  const isBusy = status === "locating" || status === "loading";
  const copy = GENRE_COPY[genre];

  return (
    <div className="min-h-screen bg-gray-50">
      <section className="relative overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-violet-800 px-6 py-20 text-center text-white">
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-[220px] opacity-10">
          📍
        </div>
        <div className="relative">
          <div className="inline-flex flex-wrap justify-center gap-1 rounded-2xl bg-white/10 p-1 backdrop-blur">
            {(Object.keys(GENRE_COPY) as Genre[]).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => switchGenre(key)}
                aria-pressed={genre === key}
                className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                  genre === key ? "bg-white text-indigo-700" : "text-white/80 hover:text-white"
                }`}
              >
                {GENRE_COPY[key].label}
              </button>
            ))}
          </div>
          <div>
            <span className="mt-6 inline-flex animate-pulse items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-medium backdrop-blur">
              📍 現在地からすぐ探せます
            </span>
          </div>
          <h1 className="mx-auto mt-5 max-w-2xl text-3xl font-bold sm:text-4xl">
            {copy.heading}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-sm text-indigo-100">{copy.sub}</p>
          <button
            type="button"
            onClick={findNearest}
            disabled={isBusy}
            className="mt-8 inline-flex items-center gap-2 rounded-full bg-white px-10 py-5 text-lg font-bold text-indigo-700 shadow-xl transition hover:scale-105 hover:shadow-2xl disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:scale-100"
          >
            {status === "locating"
              ? "現在地を取得中..."
              : status === "loading"
                ? copy.buttonLoading
                : copy.buttonIdle}
          </button>
          <p className="mt-5">
            <Link href={copy.rankingHref} className="text-sm text-indigo-100 underline hover:text-white">
              {copy.rankingLabel}
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
                      href={`/${encodeURIComponent(area.prefecture)}/${encodeURIComponent(area.city)}/${genre}`}
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
