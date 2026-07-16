import Link from "next/link";

export default function Header() {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white/90 px-4 backdrop-blur">
      <Link href="/" className="flex items-center gap-2 text-sm font-bold text-gray-900">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-700 text-xs text-white">
          近
        </span>
        近くナビ
      </Link>
      <nav className="flex items-center gap-1 overflow-x-auto text-xs font-medium">
        <Link
          href="/nagoya"
          className="shrink-0 rounded-full bg-indigo-600 px-2.5 py-1.5 text-white hover:bg-indigo-700"
        >
          名古屋駅MVP
        </Link>
        <Link href="/?genre=workspace" className="shrink-0 rounded-full px-2.5 py-1.5 text-gray-600 hover:bg-gray-100">
          作業・勉強
        </Link>
        <Link href="/?genre=arcade" className="shrink-0 rounded-full px-2.5 py-1.5 text-gray-600 hover:bg-gray-100">
          ゲーセン
        </Link>
        <Link href="/?genre=smoking" className="shrink-0 rounded-full px-2.5 py-1.5 text-gray-600 hover:bg-gray-100">
          喫煙
        </Link>
        <Link href="/?genre=laundry" className="shrink-0 rounded-full px-2.5 py-1.5 text-gray-600 hover:bg-gray-100">
          洗濯
        </Link>
        <Link href="/?genre=gym" className="shrink-0 rounded-full px-2.5 py-1.5 text-gray-600 hover:bg-gray-100">
          ジム
        </Link>
        <Link href="/?genre=sauna" className="shrink-0 rounded-full px-2.5 py-1.5 text-gray-600 hover:bg-gray-100">
          サウナ
        </Link>
      </nav>
    </header>
  );
}
