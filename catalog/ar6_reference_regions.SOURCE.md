# ar6_reference_regions.geojson

- What: IPCC AR6 WGI reference regions, version 4 (58 polygons: 43 Land, 3 Land-Ocean, 12 Ocean; properties `Acronym`, `Name`, `Type`, `Continent`). Regions that cross the 180 degree meridian are already merged into one shape.
- Where from: https://github.com/IPCC-WG1/Atlas, folder `reference-regions`, file `IPCC-WGI-reference-regions-v4.geojson`, fetched from
  https://raw.githubusercontent.com/IPCC-WG1/Atlas/main/reference-regions/IPCC-WGI-reference-regions-v4.geojson on 2026-11-15. File unchanged (695 765 bytes).
- Cite as: Iturbide, M., et al. (2020), An update of IPCC climate reference regions for subcontinental analysis of climate model data: definition and aggregated datasets, Earth System Science Data 12, 2959-2985. https://doi.org/10.5194/essd-12-2959-2020
- Licence: the GitHub repository carries no LICENSE file (GitHub reports "other / not asserted"). The paper that defines the regions is open access under CC BY 4.0 (Copernicus). We redistribute the polygons unmodified with attribution to the IPCC-WG1 Atlas repository and Iturbide et al. (2020). Someone should confirm this before the submission if the licence matters to the judges.
- Used by: `backend/src/trend_detective/place.py` (pure-Python point-in-polygon at the region centre; "Land" regions first, then "Land-Ocean").
