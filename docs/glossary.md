# Vocabulary

So nobody sounds lost talking to a mentor or a judge.

| Term | Meaning |
|---|---|
| **Active fire / hotspot** | A satellite detection of a *currently burning* fire, as opposed to a burn scar. |
| **FRP** (Fire Radiative Power) | Radiated energy output of a fire, in megawatts. Our harmonization currency, because energy means the same thing to both sensors and a count does not. |
| **FIRMS** | NASA's Fire Information for Resource Management System. Source of both the archival CSVs and the live API. |
| **MODIS** | The older sensor family, 1 km fire detection, flying since 2000. |
| **VIIRS** | The newer sensor family, 375 m fire detection, flying since 2012. |
| **Terra, Aqua** | The two satellites carrying MODIS. Terra crosses ~10:30 local, Aqua ~13:30. |
| **Suomi-NPP, NOAA-20, NOAA-21** | The satellites carrying VIIRS. All cross ~13:30 local. |
| **Overpass time** | The local solar time a satellite crosses a given point. Matters because fires have a strong daily cycle. |
| **Censoring** | Deliberately discarding low-FRP detections so a sensitive sensor is degraded to match a less sensitive one. |
| **Biome / land cover class** | Forest, savanna, cropland and so on. Corrections are fitted per class. |
| **MCD14ML** | The MODIS monthly active fire archive product. |
| **VNP14IMGML / VJ114IMGML** | The VIIRS 375 m monthly active fire products, Suomi-NPP and NOAA-20. |
| **MCD12Q1** | The land cover product we join against, for the per-biome fits. |
| **MCD64A1** | Burned-area product. Independent validation: it finds the scar, not the flame. |
| **H3** | Uber's hexagonal global grid, used for spatial aggregation. Hexagons because square cells shrink toward the poles. |
| **DBSCAN** | The clustering algorithm used to collapse duplicate detections into single fire events. |
| **AOI** (Area of Interest) | The region the user selects. |
| **Climatology** | The historical typical value for a given day of year — the baseline an anomaly is measured against. |
| **`type` field** | FIRMS source classification: 0 vegetation fire, 1 volcano, 2 other static land source (gas flares, industry), 3 offshore. |
