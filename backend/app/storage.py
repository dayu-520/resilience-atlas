from functools import lru_cache
from pathlib import Path

import boto3
from botocore.client import BaseClient
from botocore.exceptions import ClientError

from .config import settings


class ObjectStorage:
    def __init__(self) -> None:
        self.bucket = settings.s3_bucket
        self.client: BaseClient = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint,
            aws_access_key_id=settings.s3_access_key,
            aws_secret_access_key=settings.s3_secret_key,
            region_name="us-east-1",
        )

    def ensure_bucket(self) -> None:
        try:
            self.client.head_bucket(Bucket=self.bucket)
        except ClientError:
            self.client.create_bucket(Bucket=self.bucket)

    def put_bytes(self, key: str, content: bytes, content_type: str) -> None:
        self.ensure_bucket()
        self.client.put_object(Bucket=self.bucket, Key=key, Body=content, ContentType=content_type)

    def get_bytes(self, key: str) -> bytes:
        response = self.client.get_object(Bucket=self.bucket, Key=key)
        return response["Body"].read()

    def download_file(self, key: str, path: Path) -> None:
        self.client.download_file(self.bucket, key, str(path))

    def object_size(self, key: str) -> int:
        return int(self.client.head_object(Bucket=self.bucket, Key=key)["ContentLength"])

    def stream(self, key: str):
        response = self.client.get_object(Bucket=self.bucket, Key=key)
        return response["Body"]

    def delete_many(self, keys: list[str]) -> None:
        clean = [key for key in keys if key]
        if clean:
            self.client.delete_objects(
                Bucket=self.bucket,
                Delete={"Objects": [{"Key": key} for key in clean], "Quiet": True},
            )


@lru_cache
def get_storage() -> ObjectStorage:
    return ObjectStorage()

