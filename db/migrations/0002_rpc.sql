-- Query surface exposed to the web app through Supabase RPC.
--
-- Every function is SECURITY INVOKER, so the row level security policies in
-- 0001 still apply and a function cannot be used to read past them. Each also
-- pins search_path, which is what stops a mutable search_path from resolving
-- these names to something else.
--
-- There is no separate API server: these functions are the API.

-- ---------------------------------------------------------------------------
-- View A -- the burning activity calendar
-- ---------------------------------------------------------------------------

-- One row per day for the selected AOI, carrying both series so the UI can
-- animate between them. `uncorrected_cells` is surfaced rather than hidden:
-- if part of an AOI has no fitted factor, the chart should be able to say so.
create or replace function calendar_for_aoi(
  p_cells text[],
  p_from  date default '2000-11-01',
  p_to    date default current_date
)
returns table (
  acq_date          date,
  year              smallint,
  doy               smallint,
  sensor_mix        text,
  n_detections      bigint,
  frp_raw_mw        double precision,
  frp_harmonized_mw double precision,
  uncorrected_cells bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    h.acq_date,
    h.year,
    h.doy,
    string_agg(distinct h.sensor, '+' order by h.sensor)      as sensor_mix,
    sum(h.n_detections)::bigint                               as n_detections,
    sum(h.frp_sum_raw_mw)                                     as frp_raw_mw,
    sum(h.frp_sum_harmonized_mw)                              as frp_harmonized_mw,
    count(*) filter (where h.uncorrected)::bigint             as uncorrected_cells
  from fire_cell_day_harmonized h
  where h.h3 = any (p_cells)
    and h.acq_date between p_from and p_to
  group by h.acq_date, h.year, h.doy
  order by h.acq_date;
$$;

comment on function calendar_for_aoi is
  'Daily harmonized and raw burning activity for a set of H3 cells. Backs the calendar heatmap and its raw/harmonized toggle.';

-- ---------------------------------------------------------------------------
-- View B -- anomalies and critical periods
-- ---------------------------------------------------------------------------

-- Observed activity against the day-of-year climatology for the same cells.
--
-- The percentile bands are summed across the AOI's cells to match the summed
-- observation. That is an approximation -- the sum of per-cell 90th
-- percentiles is not the 90th percentile of the AOI total, and it runs high
-- because it assumes every cell peaks together. It is the honest cheap option
-- for an AOI the user draws at query time; an AOI-level climatology would have
-- to be precomputed per AOI, which is not possible for arbitrary shapes.
create or replace function anomaly_for_aoi(
  p_cells text[],
  p_from  date default (current_date - interval '1 year')::date,
  p_to    date default current_date
)
returns table (
  acq_date     date,
  doy          smallint,
  observed_mw  double precision,
  p50_mw       double precision,
  p75_mw       double precision,
  p90_mw       double precision,
  p95_mw       double precision,
  exceeds_p90  boolean,
  exceeds_p95  boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with active_fit as (
    select fit_version from harmonization_active limit 1
  ),
  observed as (
    select
      h.acq_date,
      h.doy,
      sum(h.frp_sum_harmonized_mw) as observed_mw
    from fire_cell_day_harmonized h
    where h.h3 = any (p_cells)
      and h.acq_date between p_from and p_to
    group by h.acq_date, h.doy
  ),
  bands as (
    select
      c.doy,
      sum(c.p50) as p50_mw,
      sum(c.p75) as p75_mw,
      sum(c.p90) as p90_mw,
      sum(c.p95) as p95_mw
    from fire_climatology c
    join active_fit a on a.fit_version = c.fit_version
    where c.h3 = any (p_cells)
    group by c.doy
  )
  select
    o.acq_date,
    o.doy,
    o.observed_mw,
    b.p50_mw,
    b.p75_mw,
    b.p90_mw,
    b.p95_mw,
    o.observed_mw > b.p90_mw as exceeds_p90,
    o.observed_mw > b.p95_mw as exceeds_p95
  from observed o
  left join bands b on b.doy = o.doy
  order by o.acq_date;
$$;

comment on function anomaly_for_aoi is
  'Observed activity against day-of-year climatology bands for an AOI. Backs the anomaly view.';

-- ---------------------------------------------------------------------------
-- Map layer -- raw detections, demo AOIs only
-- ---------------------------------------------------------------------------

create or replace function detections_in_bbox(
  p_west   double precision,
  p_south  double precision,
  p_east   double precision,
  p_north  double precision,
  p_from   timestamptz,
  p_to     timestamptz,
  p_limit  integer default 5000
)
returns table (
  lat              double precision,
  lon              double precision,
  acq_ts           timestamptz,
  sensor           text,
  platform         text,
  frp_mw           double precision,
  confidence_class text,
  event_id         bigint
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    st_y(d.geom::geometry),
    st_x(d.geom::geometry),
    d.acq_ts,
    d.sensor,
    d.platform,
    d.frp_mw,
    d.confidence_class,
    d.event_id
  from fire_detection d
  where d.acq_ts between p_from and p_to
    and st_intersects(
          d.geom,
          st_makeenvelope(p_west, p_south, p_east, p_north, 4326)::geography
        )
  order by d.frp_mw desc nulls last
  limit least(greatest(p_limit, 1), 50000);
$$;

comment on function detections_in_bbox is
  'Individual hotspots inside a bounding box. Only demo AOIs are loaded at point level.';

-- ---------------------------------------------------------------------------
-- The validation table -- shown in the UI, not just in the write-up
-- ---------------------------------------------------------------------------

-- Putting the fit statistics on screen next to the chart is the difference
-- between claiming the record is harmonized and showing that it is.
create or replace function harmonization_report()
returns table (
  fit_version     text,
  landcover_class smallint,
  landcover_name  text,
  frp_threshold_mw double precision,
  slope           double precision,
  intercept       double precision,
  r2              double precision,
  bias            double precision,
  rmse            double precision,
  n_cells         integer,
  holdout_r2      double precision,
  is_active       boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    f.fit_version,
    f.landcover_class,
    l.name,
    f.frp_threshold_mw,
    f.slope,
    f.intercept,
    f.r2,
    f.bias,
    f.rmse,
    f.n_cells,
    f.holdout_r2,
    (a.fit_version is not null) as is_active
  from harmonization_factor f
  join landcover_class l on l.id = f.landcover_class
  left join harmonization_active a on a.fit_version = f.fit_version
  order by (a.fit_version is not null) desc, f.fit_version, f.landcover_class;
$$;

comment on function harmonization_report is
  'Per-biome censoring thresholds, correction factors and validation statistics.';

-- ---------------------------------------------------------------------------
-- Demo AOIs
-- ---------------------------------------------------------------------------

create or replace function list_aois(p_demo_only boolean default false)
returns table (
  id       uuid,
  name     text,
  h3_cells text[],
  bbox     double precision[],
  is_demo  boolean
)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select
    a.id,
    a.name,
    a.h3_cells,
    array[
      st_xmin(a.geom::geometry), st_ymin(a.geom::geometry),
      st_xmax(a.geom::geometry), st_ymax(a.geom::geometry)
    ]::double precision[],
    a.is_demo
  from aoi a
  where not p_demo_only or a.is_demo
  order by a.is_demo desc, a.name;
$$;

comment on function list_aois is 'Saved areas of interest, demo AOIs first.';
