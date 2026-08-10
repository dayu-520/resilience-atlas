from pathlib import Path

RASTER_SUFFIXES = {".tif", ".tiff"}
VECTOR_SUFFIXES = {".geojson", ".json", ".gpkg", ".kml", ".kmz"}
TIFF_SIDECAR_SUFFIXES = {".tfw", ".ovr", ".prj", ".xml"}


def classify_upload(filename: str) -> str:
    suffix = Path(filename.lower()).suffix
    if suffix in RASTER_SUFFIXES:
        return "raster"
    if suffix == ".zip":
        return "archive"
    if suffix in VECTOR_SUFFIXES:
        return "vector"
    if suffix == ".csv":
        return "table"
    return "unknown"


def member_name(member: str) -> str:
    return Path(member.replace("\\", "/").lower()).name


def classify_zip_members(members: list[str]) -> str:
    names = {member_name(member) for member in members}
    suffixes = {Path(name).suffix for name in names}

    if suffixes & RASTER_SUFFIXES:
        return "raster"
    if any(name.endswith(".tif.aux.xml") for name in names):
        return "raster"
    if {".shp", ".shx", ".dbf"}.issubset(suffixes):
        return "vector"
    if suffixes & VECTOR_SUFFIXES:
        return "vector"
    if ".csv" in suffixes:
        return "table"
    return "unknown"


def validate_shapefile_zip_members(members: list[str]) -> list[str]:
    lower_members = {member_name(member) for member in members}
    stems = {Path(member).stem for member in lower_members if member.endswith(".shp")}
    if not stems:
        return ["*.shp", "*.shx", "*.dbf"]
    stem = sorted(stems)[0]
    required = [f"{stem}.shp", f"{stem}.shx", f"{stem}.dbf"]
    return [member for member in required if member not in lower_members]
