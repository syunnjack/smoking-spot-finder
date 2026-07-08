import Link from "next/link";

// 全ページ共通のブランドヘッダー。high-fixed(h-14)なのは、地図全画面表示のページ側で
// `h-[calc(100vh-3.5rem)]`として高さを逆算しているため、変更する場合はそちらも合わせて直すこと。
export default function Header() {
  return (
    <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between border-b border-gray-200 bg-white/90 px-4 backdrop-blur">
      <Link href="/" className="flex items-center gap-2 text-sm font-bold text-gray-900">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-600 to-violet-700 text-xs text-white">
          📍
        </span>
        近くナビ
      </Link>
      <nav className="flex items-center gap-1 overflow-x-auto text-xs font-medium">
        <Link
          href="/"
          className="shrink-0 rounded-full px-2.5 py-1.5 text-gray-600 hover:bg-gray-100"
        >
          🚬 喫煙
        </Link>
        <Link
          href="/?genre=workspace"
          className="shrink-0 rounded-full px-2.5 py-1.5 text-gray-600 hover:bg-gray-100"
        >
          💻 作業・勉強
        </Link>
        <Link
          href="/?genre=laundry"
          className="shrink-0 rounded-full px-2.5 py-1.5 text-gray-600 hover:bg-gray-100"
        >
          🧺 洗濯
        </Link>
        <Link
          href="/?genre=gym"
          className="shrink-0 rounded-full px-2.5 py-1.5 text-gray-600 hover:bg-gray-100"
        >
          💪 ジム
        </Link>
      </nav>
    </header>
  );
}
