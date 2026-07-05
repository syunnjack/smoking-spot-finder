-- venues: ローカル向けマイクロユーティリティ（便利マップ）に掲載する店舗・施設
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

-- 市町村・カテゴリでの絞り込みが多いため、複合インデックスを用意しておく
create index if not exists venues_city_category_idx on public.venues (city, category);
