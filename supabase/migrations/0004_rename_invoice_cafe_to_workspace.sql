-- invoice-cafeカテゴリ（データ0件・未実装のまま）を、電源・WIFI・有線LAN・利用料を軸にした
-- 「作業・勉強できる場所」（カフェ・自習室・コワーキングスペース）を表すworkspaceに置き換える。
alter table public.venues drop constraint if exists venues_category_check;
alter table public.venues
  add constraint venues_category_check check (category in ('smoking', 'workspace', 'laundry', 'gym'));

comment on column public.venues.category is '施設カテゴリ: smoking / workspace / laundry / gym';
