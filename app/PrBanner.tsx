// ランキングページ等、個別店舗に紐づかない一覧ページ向けのアフィリエイト導線。
// VenueExplorer.tsxのAffiliateSlotと違いクリックのstopPropagationが不要な文脈（ボタンに
// ネストされない）でのみ使うため、Server Componentのままレンダリングできる軽量版。
interface PrBannerItem {
  href: string;
  label: string;
  note?: string;
  pixelSrc?: string;
}

export default function PrBanner({ items }: { items: PrBannerItem[] }) {
  return (
    <div className="mt-8 flex flex-col gap-2">
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          target="_blank"
          rel="noopener noreferrer nofollow sponsored"
          className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900 transition hover:bg-amber-100"
        >
          <span className="mt-0.5 shrink-0 rounded bg-amber-200 px-1 py-0.5 text-[10px] font-bold tracking-wide text-amber-800">
            PR
          </span>
          <span>
            {item.label}
            {item.note && <span className="mt-0.5 block text-[10px] font-normal text-amber-700">{item.note}</span>}
          </span>
          {item.pixelSrc && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.pixelSrc} width={0} height={1} alt="" className="hidden" />
          )}
        </a>
      ))}
    </div>
  );
}
