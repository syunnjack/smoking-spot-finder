-- Google Places Details の regularOpeningHours（periods配列）をそのまま保存し、
-- LocalBusiness構造化データの openingHoursSpecification に反映するための列。
-- 未取得（旧データ・営業時間非公開の施設）はnullのまま許容する。
alter table public.venues add column if not exists opening_hours jsonb;

comment on column public.venues.opening_hours is
  'Google Places regularOpeningHours（{"periods": [{"open": {"day","hour","minute"}, "close": {...}}]}）をそのまま格納。nullable。';
