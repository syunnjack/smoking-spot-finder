-- 緯度・経度に対する位置情報検索を高速化するGiSTインデックス
-- cube/earthdistance は緯度経度をそのまま球面座標として扱えるため、
-- geometry型カラムを新設せずに既存の latitude/longitude 列だけで近傍検索が可能になる。
create extension if not exists cube;
create extension if not exists earthdistance;

create index if not exists venues_location_gist_idx
  on public.venues
  using gist (ll_to_earth(latitude, longitude));

-- 使用例: 中心地点から半径3000m以内の店舗を取得する場合
-- select * from public.venues
-- where earth_box(ll_to_earth(:center_lat, :center_lng), 3000) @> ll_to_earth(latitude, longitude)
--   and earth_distance(ll_to_earth(:center_lat, :center_lng), ll_to_earth(latitude, longitude)) <= 3000;
