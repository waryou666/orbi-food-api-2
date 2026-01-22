-- zones: เก็บแบบ hierarchical ได้ (province/district/village)
create table if not exists zones (
  id text primary key,
  data jsonb not null
);

create table if not exists categories (
  id text primary key,
  name text not null,
  icon text
);

create table if not exists shops (
  id text primary key,
  name text not null,
  currency text default 'THB',
  category_id text references categories(id),
  province_id text,
  district_id text,
  village_id text,
  has_delivery boolean default false,
  pickup boolean default true,
  delivery_fee numeric default 0,
  min_order numeric default 0,
  eta_min int default 0,
  hours text,
  rating numeric default 0,
  orders int default 0,
  created_at date,
  cover text,
  messenger_url text,
  tags jsonb default '[]'::jsonb,
  featured boolean default false,
  active boolean default true,
  map_url text,
  lat numeric,
  lng numeric,
  menu_image text
);

create table if not exists menu_items (
  id text primary key,
  shop_id text not null references shops(id) on delete cascade,
  name text not null,
  price numeric not null,
  currency text,
  image text,
  available boolean default true,
  sort int default 0
);
