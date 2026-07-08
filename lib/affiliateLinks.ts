// アフィリエイトリンクの一元管理。
// VenueExplorer.tsx（個別店舗カード）と ranking系ページ（一覧バナー）の両方から参照するため、
// URLはここに1箇所だけ持たせ、表示条件・コピーは呼び出し側に委ねる。
// 「PR」表記は景品表示法のステルスマーケティング規制（2023年10月施行）対応のため、
// リンク差し替え後も呼び出し側で必ず残すこと。

// 楽天アフィリエイト（使い捨て携帯灰皿, pandainterior/pan-yhg01）
export const RAKUTEN_ASHTRAY_SEARCH_URL =
  "https://hb.afl.rakuten.co.jp/ichiba/558fbb4b.d3ca1d3b.558fbb4c.404f01bf/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fpandainterior%2Fpan-yhg01%2F&link_type=hybrid_url&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJoeWJyaWRfdXJsIiwic2l6ZSI6IjEwMHgxMDAiLCJuYW0iOjEsIm5hbXAiOiJyaWdodCIsImNvbSI6MSwiY29tcCI6ImRvd24iLCJwcmljZSI6MSwiYm9yIjoxLCJjb2wiOjEsImJidG4iOjEsInByb2QiOjAsImFtcCI6ZmFsc2V9";

// たばこ事業法上、加熱式・電子タバコ機器も20歳未満への広告訴求は禁止されているため、
// 「臭い・煙が完全になくなる」等の効果効能を示唆する表現は使わず、年齢表記も必須で残すこと。
// 楽天アフィリエイト（IQOS互換の加熱式タバコデバイス「Fasoul Q1」, flavor-kitchen/4023101）
export const VAPE_SEARCH_URL =
  "https://hb.afl.rakuten.co.jp/ichiba/558fb5f7.73737464.558fb5f8.036a5b1b/?pc=https%3A%2F%2Fitem.rakuten.co.jp%2Fflavor-kitchen%2F4023101%2F&link_type=hybrid_url&ut=eyJwYWdlIjoiaXRlbSIsInR5cGUiOiJoeWJyaWRfdXJsIiwic2l6ZSI6IjI0MHgyNDAiLCJuYW0iOjEsIm5hbXAiOiJyaWdodCIsImNvbSI6MSwiY29tcCI6ImRvd24iLCJwcmljZSI6MSwiYm9yIjoxLCJjb2wiOjEsImJidG4iOjEsInByb2QiOjAsImFtcCI6ZmFsc2V9";

// A8.net経由のアフィリエイト（workspaceカテゴリ向け）。
export const WIFIGO_URL = "https://px.a8.net/svt/ejp?a8mat=4B7VL2+47VSAA+2W74+HVFKY";
export const WIFIGO_PIXEL = "https://www18.a8.net/0.gif?a8mat=4B7VL2+47VSAA+2W74+HVFKY";
export const ONSUKU_URL = "https://px.a8.net/svt/ejp?a8mat=3NGUTC+EZGW0I+408S+60H7M";
export const ONSUKU_PIXEL = "https://www19.a8.net/0.gif?a8mat=3NGUTC+EZGW0I+408S+60H7M";

// A8.net経由のアフィリエイト（gymカテゴリ向け。BROOKS公式オンラインストア）。
export const BROOKS_URL = "https://px.a8.net/svt/ejp?a8mat=4B7VL7+16C0Z6+5GZE+BWVTE";
export const BROOKS_PIXEL = "https://www16.a8.net/0.gif?a8mat=4B7VL7+16C0Z6+5GZE+BWVTE";

// A8.net経由のアフィリエイト（laundryカテゴリ向け。詰め込み放題型の宅配クリーニング「Loop Laundry」）。
export const LOOP_LAUNDRY_URL = "https://px.a8.net/svt/ejp?a8mat=4B7VL7+1FUYNM+5L4A+5YJRM";
export const LOOP_LAUNDRY_PIXEL = "https://www16.a8.net/0.gif?a8mat=4B7VL7+1FUYNM+5L4A+5YJRM";

// A8.net経由のアフィリエイト（saunaカテゴリ向け。プライベートサウナ付き施設も探せる
// グランピング予約サイト「リゾートグランピングドットコム」）。
export const GLAMPING_URL = "https://px.a8.net/svt/ejp?a8mat=4B7VL7+1TJXKI+5Q4K+5YJRM";
export const GLAMPING_PIXEL = "https://www13.a8.net/0.gif?a8mat=4B7VL7+1TJXKI+5Q4K+5YJRM";
