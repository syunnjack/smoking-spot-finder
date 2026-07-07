-- venues.updated_at: キャッシュファースト化のための鮮度判定に使う。
-- アプリ側（sync-places.ts / smoking-spots route）が書き込み時に明示的に更新する。
alter table public.venues
  add column if not exists updated_at timestamptz not null default now();

comment on column public.venues.updated_at is 'このレコードを最後にGoogle Places+Claudeで解析した日時。キャッシュの鮮度判定に使用（7日超で再取得）';
