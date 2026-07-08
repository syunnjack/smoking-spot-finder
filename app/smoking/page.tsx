"use client";

import { useEffect, useState } from "react";
import type { SmokingSpot } from "@/lib/types";
import SmokingSpotsExplorer from "../SmokingSpotsExplorer";

const SHIZUOKA_STATION = { lat: 34.9715, lng: 138.3891 };

export default function SmokingSpotsPage() {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;

  const [spots, setSpots] = useState<SmokingSpot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="h-[calc(100vh-3.5rem)] w-full">
      <SmokingSpotsExplorer
        spots={spots}
        center={SHIZUOKA_STATION}
        apiKey={apiKey}
        title="静岡駅 喫煙所マップ"
        subtitle="半径1000m以内のコンビニ・飲食店の口コミをAIが解析"
        loading={loading}
        error={error}
      />
    </div>
  );
}
