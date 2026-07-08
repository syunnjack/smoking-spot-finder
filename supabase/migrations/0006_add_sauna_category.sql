-- 5つ目のジャンル「サウナ・温浴施設」を追加する（サウナ専門店・スーパー銭湯・岩盤浴施設を統合）。
-- サウナ・水風呂・岩盤浴・露天風呂の有無を軸にする。
alter table public.venues drop constraint if exists venues_category_check;
alter table public.venues
  add constraint venues_category_check check (category in ('smoking', 'workspace', 'laundry', 'gym', 'sauna'));

comment on column public.venues.category is '施設カテゴリ: smoking / workspace / laundry / gym / sauna';
