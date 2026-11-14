-- Fire Record Harmonization -- initial schema.
--
-- Design rule: the application never queries raw detections for a wide area.
-- The offline pipeline reduces hundreds of millions of point records to a
-- cell x day x sensor table, and everything the UI draws comes from that or
-- from the precomputed climatology. Raw points are loaded only for a handful
-- of demo AOIs, so the map can zoom to individual hotspots on stage without
-- the table ever approaching the size of the full archive.

create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- Reference tables
-- ---------------------------------------------------------------------------

-- MCD12Q1 IGBP land cover classes. Correction factors are fitted per class
-- because a fire in boreal forest and a fire in cropland differ in both the
-- energy they release and the size at which they become detectable.
create table if not exists landcover_class (
  id          smallint primary key,
  name        text not null,
  description text
);

insert into landcover_class (id, name) values
  (0,  'Water'),
  (1,  'Evergreen Needleleaf Forest'),
  (2,  'Evergreen Broadleaf Forest'),
  (3,  'Deciduous Needleleaf Forest'),
  (4,  'Deciduous Broadleaf Forest'),
  (5,  'Mixed Forest'),
  (6,  'Closed Shrubland'),
  (7,  'Open Shrubland'),
  (8,  'Woody Savanna'),
  (9,  'Savanna'),
  (10, 'Grassland'),
  (11, 'Permanent Wetland'),
  (12, 'Cropland'),
  (13, 'Urban and Built-up'),
  (14, 'Cropland/Natural Vegetation Mosaic'),
  (15, 'Snow and Ice'),
  (16, 'Barren')
on conflict (id) do nothing;

-- The dominant land cover of each H3 cell, joined once offline so that
-- queries never touch the raster.
create table if not exists cell_landcover (
  h3               text primary key,
  h3_resolution    smallint not null,
  landcover_class  smallint not null references landcover_class (id),
  centroid         geography(point, 4326) not null
);

create index if not exists cell_landcover_class_idx
  on cell_landcover (landcover_class);
create index if not exists cell_landcover_centroid_idx
  on cell_landcover using gist (centroid);

-- ---------------------------------------------------------------------------
-- The record itself
-- ---------------------------------------------------------------------------

-- One row per H3 cell, per day, per sensor family.
--
-- Both the raw and the censored aggregates are stored. The raw columns are
-- what an unharmonized plot shows -- including the false 2012 step change --
-- and keeping them lets the UI offer an honest raw/harmonized toggle rather
-- than quietly hiding the uncorrected series.
--
-- The censored columns hold the same aggregate computed only over detections
-- above the per-biome FRP threshold, which is what makes VIIRS comparable to
-- MODIS. Censoring must happen before aggregation, so it is applied by the
-- offline pipeline once the thresholds have been fitted.
create table if not exists fire_cell_day (
  h3                    text     not null,
  acq_date              date     not null,
  sensor                text     not null check (sensor in ('MODIS', 'VIIRS')),

  n_detections          integer  not null,
  frp_sum_mw            double precision,
  frp_mean_mw           double precision,
  frp_max_mw            double precision,
  observed_area_km2     double precision,
  n_platforms           smallint,

  n_detections_censored integer,
  frp_sum_censored_mw   double precision,

  n_events              integer,

  h3_resolution         smallint not null,
  year                  smallint not null,
  doy                   smallint not null check (doy between 1 and 366),

  primary key (h3, acq_date, sensor)
);

-- The dominant access pattern is "one AOI (a set of cells), one date range",
-- so the cell must lead the index.
create index if not exists fire_cell_day_cell_date_idx
  on fire_cell_day (h3, acq_date);
create index if not exists fire_cell_day_date_idx
  on fire_cell_day (acq_date);
create index if not exists fire_cell_day_year_doy_idx
  on fire_cell_day (year, doy);

-- ---------------------------------------------------------------------------
-- Harmonization
-- ---------------------------------------------------------------------------

-- The fitted correction, one row per land cover class per fit run.
--
-- Nothing in this table is asserted by the schema: it is filled by the
-- analysis, and every row carries the validation statistics that justify it.
-- A factor without an r2, a bias and an RMSE is not a result, so those columns
-- are not nullable.
create table if not exists harmonization_factor (
  fit_version        text     not null,
  landcover_class    smallint not null references landcover_class (id),

  -- Detections below this FRP are discarded from VIIRS to degrade it to
  -- MODIS-equivalent sensitivity.
  frp_threshold_mw   double precision not null check (frp_threshold_mw >= 0),

  -- Applied to the MODIS-era record: harmonized = slope * frp_sum + intercept
  slope              double precision not null,
  intercept          double precision not null default 0,

  -- Validation, on spatially aggregated cells over the overlap period.
  r2                 double precision not null,
  bias               double precision not null,
  rmse               double precision not null,
  n_cells            integer          not null,
  fit_years          int4range        not null,
  holdout_years      smallint[]       not null default '{}',
  holdout_r2         double precision,

  notes              text,
  created_at         timestamptz not null default now(),

  primary key (fit_version, landcover_class)
);

-- Which fit the application should read. Kept as a one-row table so that
-- publishing a new fit is a single update rather than a redeploy.
create table if not exists harmonization_active (
  singleton   boolean primary key default true check (singleton),
  fit_version text not null,
  updated_at  timestamptz not null default now()
);

-- The harmonized series. MODIS-era values are corrected; VIIRS-era values are
-- censored. Cells with no fitted factor fall back to the raw sum and are
-- flagged, so an unharmonized cell is visible rather than silently wrong.
create or replace view fire_cell_day_harmonized as
select
  d.h3,
  d.acq_date,
  d.sensor,
  d.year,
  d.doy,
  d.n_detections,
  d.frp_sum_mw as frp_sum_raw_mw,
  case
    when d.sensor = 'VIIRS' then coalesce(d.frp_sum_censored_mw, d.frp_sum_mw)
    when f.slope is not null then f.slope * d.frp_sum_mw + f.intercept
    else d.frp_sum_mw
  end as frp_sum_harmonized_mw,
  (d.sensor = 'MODIS' and f.slope is null) as uncorrected,
  c.landcover_class,
  f.fit_version
from fire_cell_day d
left join cell_landcover c on c.h3 = d.h3
left join harmonization_active a on true
left join harmonization_factor f
  on f.landcover_class = c.landcover_class
 and f.fit_version = a.fit_version;

-- ---------------------------------------------------------------------------
-- Climatology -- the baseline for "unusual conditions"
-- ---------------------------------------------------------------------------

create table if not exists fire_climatology (
  h3          text     not null,
  doy         smallint not null check (doy between 1 and 366),
  p50         double precision,
  p75         double precision,
  p90         double precision,
  p95         double precision,
  mean        double precision,
  n_samples   integer not null,
  fit_version text    not null,
  primary key (h3, doy, fit_version)
);

-- ---------------------------------------------------------------------------
-- Raw detections -- demo AOIs only
-- ---------------------------------------------------------------------------

create table if not exists fire_detection (
  id              bigint generated always as identity primary key,
  geom            geography(point, 4326) not null,
  acq_ts          timestamptz not null,
  sensor          text not null check (sensor in ('MODIS', 'VIIRS')),
  platform        text not null,
  frp_mw          double precision,
  frp_density_mw_km2 double precision,
  brightness_k    double precision,
  confidence_class text check (confidence_class in ('low', 'nominal', 'high')),
  daynight        char(1),
  source_type     smallint,
  event_id        bigint,
  h3              text
);

create index if not exists fire_detection_geom_idx
  on fire_detection using gist (geom);
create index if not exists fire_detection_ts_idx
  on fire_detection (acq_ts);
create index if not exists fire_detection_event_idx
  on fire_detection (event_id);

-- ---------------------------------------------------------------------------
-- Saved areas of interest
-- ---------------------------------------------------------------------------

create table if not exists aoi (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  geom       geography(polygon, 4326) not null,
  h3_cells   text[] not null,
  is_demo    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists aoi_geom_idx on aoi using gist (geom);

-- ---------------------------------------------------------------------------
-- Row level security
--
-- Everything here is public NASA-derived data, so anonymous read is correct.
-- Writes go through the service role from the offline pipeline, which bypasses
-- RLS -- so no write policy is granted to anon, and the absence is deliberate.
-- ---------------------------------------------------------------------------

alter table landcover_class      enable row level security;
alter table cell_landcover       enable row level security;
alter table fire_cell_day        enable row level security;
alter table harmonization_factor enable row level security;
alter table harmonization_active enable row level security;
alter table fire_climatology     enable row level security;
alter table fire_detection       enable row level security;
alter table aoi                  enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'landcover_class', 'cell_landcover', 'fire_cell_day', 'harmonization_factor',
    'harmonization_active', 'fire_climatology', 'fire_detection', 'aoi'
  ]
  loop
    execute format(
      'create policy %I on public.%I for select to anon, authenticated using (true)',
      t || '_read', t
    );
  exception
    when duplicate_object then null;
  end loop;
end $$;
