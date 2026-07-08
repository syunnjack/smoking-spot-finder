import Link from "next/link";
import type { VenueCategory } from "@/lib/types";

const RANKING_PAGES: Record<VenueCategory, { href: string; label: string }> = {
  smoking: { href: "/ranking", label: "🚬 喫煙所充実度ランキング" },
  workspace: { href: "/ranking/workspace", label: "💻 電源・WIFI充実度ランキング" },
  laundry: { href: "/ranking/laundry", label: "🧺 コインランドリー充実度ランキング" },
  gym: { href: "/ranking/gym", label: "💪 ジム充実度ランキング" },
  sauna: { href: "/ranking/sauna", label: "🧖 サウナ充実度ランキング" },
  arcade: { href: "/ranking/arcade", label: "🕹️ プリクラ・クレーンゲーム充実度ランキング" },
};

// 各ランキングページの上部に置き、他4ジャンルのランキングへ相互に飛べるようにする。
export default function RankingCrossLinks({ current }: { current: VenueCategory }) {
  const others = (Object.keys(RANKING_PAGES) as VenueCategory[]).filter((c) => c !== current);
  return (
    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
      {others.map((c) => (
        <Link key={c} href={RANKING_PAGES[c].href} className="text-indigo-600 hover:underline">
          {RANKING_PAGES[c].label}
        </Link>
      ))}
    </div>
  );
}
