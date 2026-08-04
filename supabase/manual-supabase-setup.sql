-- 0001_create_venues_table.sql
create extension if not exists pgcrypto;

create table if not exists public.venues (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  address text,
  google_place_id text unique,
  city text,
  prefecture text,
  category text not null check (category in ('smoking', 'invoice-cafe', 'laundry', 'gym')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table public.venues is 'ローカル向け便利マップに掲載する店舗・施設';
comment on column public.venues.category is '施設カテゴリ: smoking / invoice-cafe / laundry / gym';
comment on column public.venues.metadata is 'カテゴリ固有のフラグ等を動的に保存するjsonb';

create index if not exists venues_city_category_idx on public.venues (city, category);

-- 0002_add_location_gist_index.sql
create extension if not exists cube;
create extension if not exists earthdistance;

create index if not exists venues_location_gist_idx
  on public.venues
  using gist (ll_to_earth(latitude, longitude));

-- 0003_add_updated_at_to_venues.sql
alter table public.venues
  add column if not exists updated_at timestamptz not null default now();

comment on column public.venues.updated_at is 'このレコードを最後にGoogle Places+Claudeで解析した日時。キャッシュの鮮度判定に使用(7日超で再取得)';

-- 0004_rename_invoice_cafe_to_workspace.sql
alter table public.venues drop constraint if exists venues_category_check;
alter table public.venues
  add constraint venues_category_check check (category in ('smoking', 'workspace', 'laundry', 'gym'));

comment on column public.venues.category is '施設カテゴリ: smoking / workspace / laundry / gym';

-- 0005_add_opening_hours_to_venues.sql
alter table public.venues add column if not exists opening_hours jsonb;

comment on column public.venues.opening_hours is
  'Google Places regularOpeningHours({"periods": [{"open": {"day","hour","minute"}, "close": {...}}]})をそのまま格納。nullable。';

-- 0006_add_sauna_category.sql
alter table public.venues drop constraint if exists venues_category_check;
alter table public.venues
  add constraint venues_category_check check (category in ('smoking', 'workspace', 'laundry', 'gym', 'sauna'));

comment on column public.venues.category is '施設カテゴリ: smoking / workspace / laundry / gym / sauna';

-- 0007_add_arcade_category.sql
alter table public.venues drop constraint if exists venues_category_check;
alter table public.venues
  add constraint venues_category_check check (category in ('smoking', 'workspace', 'laundry', 'gym', 'sauna', 'arcade'));

comment on column public.venues.category is '施設カテゴリ: smoking / workspace / laundry / gym / sauna / arcade';

alter table public.venues enable row level security;
