"""Download and import Beijing/Tianjin/Hebei administrative boundaries.

Run inside the API container:
    docker compose exec api python3 scripts/seed_admin_regions.py
"""

import asyncio

import httpx
from geoalchemy2.shape import from_shape
from shapely.geometry import MultiPolygon, shape
from sqlalchemy.dialects.postgresql import insert

from app.database import SessionLocal
from app.models import AdminRegion

BASE = "https://geo.datav.aliyun.com/areas_v3/bound/geojson?code={}"
PROVINCES = ["110000", "120000", "130000"]
HEBEI_CITIES = ["130100", "130200", "130300", "130400", "130500", "130600", "130700", "130800", "130900", "131000", "131100"]


def level_for(adcode: str) -> str:
    if adcode.endswith("0000"):
        return "province"
    if adcode.endswith("00"):
        return "city"
    return "district"


async def main() -> None:
    urls = [BASE.format(code) for code in PROVINCES] + [BASE.format(f"{code}_full") for code in PROVINCES + HEBEI_CITIES]
    features: dict[str, dict] = {}
    async with httpx.AsyncClient(timeout=60) as client:
        for url in urls:
            response = await client.get(url)
            response.raise_for_status()
            for feature in response.json().get("features", []):
                features[str(feature["properties"]["adcode"])] = feature
    async with SessionLocal() as db:
        for adcode, feature in features.items():
            geometry = shape(feature["geometry"])
            if geometry.geom_type == "Polygon":
                geometry = MultiPolygon([geometry])
            props = feature["properties"]
            parent = props.get("parent", {}) or {}
            statement = insert(AdminRegion).values(
                adcode=adcode,
                name=props.get("name", adcode),
                level=props.get("level") or level_for(adcode),
                parent_adcode=str(parent.get("adcode")) if parent.get("adcode") else None,
                center={"coordinates": props.get("center")} if props.get("center") else None,
                geom=from_shape(geometry, srid=4326),
            ).on_conflict_do_update(
                index_elements=[AdminRegion.adcode],
                set_={"name": props.get("name", adcode), "geom": from_shape(geometry, srid=4326)},
            )
            await db.execute(statement)
        await db.commit()
    print(f"Imported {len(features)} administrative regions")


if __name__ == "__main__":
    asyncio.run(main())

