from worker.gis_inspector import classify_upload, classify_zip_members, validate_shapefile_zip_members


def test_classify_arcgis_tiff_as_raster():
    assert classify_upload("population.tif") == "raster"
    assert classify_upload("population.tiff") == "raster"


def test_classify_common_vector_formats():
    assert classify_upload("exports/ROADS.ZIP") == "archive"
    assert classify_upload("boundaries.gpkg") == "vector"
    assert classify_upload("C:/exports/places.KML") == "vector"
    assert classify_upload("places.kmz") == "vector"
    assert classify_upload("points.csv") == "table"


def test_shapefile_zip_requires_core_members():
    members = ["roads.shp", "roads.shx", "roads.dbf", "roads.prj"]
    assert validate_shapefile_zip_members(members) == []


def test_shapefile_zip_reports_missing_members():
    members = ["roads.shp"]
    assert validate_shapefile_zip_members(members) == ["roads.shx", "roads.dbf"]


def test_classify_zip_members_detects_arcgis_tiff_sidecar_package():
    members = [
        "population/POPULATION.TIF",
        "population/population.tfw",
        "population/population.tif.aux.xml",
        "population/population.ovr",
        "population/population.prj",
    ]
    assert classify_zip_members(members) == "raster"


def test_classify_zip_members_detects_shapefile_package():
    members = ["roads/roads.shp", "roads/roads.shx", "roads/roads.dbf"]
    assert classify_zip_members(members) == "vector"
