# Data Format Policy

The platform accepts files in the form users export from ArcMap or ArcGIS. Users should not need to understand internal preview formats such as COG, vector tiles, or web map caches.

## Supported in Phase One

- Shapefile zip packages containing `.shp`, `.shx`, and `.dbf`; `.prj` and `.cpg` are strongly recommended.
- ArcGIS TIFF raster outputs using `.tif` or `.tiff`.
- TIFF sidecar packages containing files such as `.tfw`, `.tif.aux.xml`, `.ovr`, `.prj`, or `.xml`.
- GeoJSON or JSON.
- GeoPackage.
- KML or KMZ.
- CSV point tables.

## Rules

Original uploads are preserved as the source of truth. Preview files are generated artifacts and can be rebuilt.

If spatial reference cannot be detected, the dataset is marked as `needs_spatial_reference` and remains downloadable.

If a Shapefile zip is missing `.shx` or `.dbf`, the platform marks the upload as failed because the geometry and attribute table cannot be reliably reconstructed.

If a TIFF lacks spatial reference and no sidecar file can resolve it, the platform keeps the original file but asks the user to provide coordinate system information before map preview.
