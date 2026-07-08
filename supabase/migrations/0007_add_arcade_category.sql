-- 6つ目のジャンル「ゲームセンター」を追加する。収益化目的ではなく、プリクラ・カプセルトイ・
-- クレーンゲームのトレンドに乗った話題性・拡散のきっかけとして導入する。
alter table public.venues drop constraint if exists venues_category_check;
alter table public.venues
  add constraint venues_category_check check (category in ('smoking', 'workspace', 'laundry', 'gym', 'sauna', 'arcade'));

comment on column public.venues.category is '施設カテゴリ: smoking / workspace / laundry / gym / sauna / arcade';
