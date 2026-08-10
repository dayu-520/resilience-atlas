import re
from typing import BinaryIO

import boto3

from app.core.config import settings

SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._\-\u4e00-\u9fa5]+")


def sanitize_filename(filename: str) -> str:
    name = filename.replace("\\", "/").split("/")[-1].strip()
    return SAFE_FILENAME.sub("_", name) or "upload.bin"


def build_original_storage_key(dataset_id: str, filename: str) -> str:
    return f"datasets/{dataset_id}/original/{sanitize_filename(filename)}"


class ObjectStorage:
    def __init__(self):
        self.client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url,
            aws_access_key_id=settings.s3_access_key_id,
            aws_secret_access_key=settings.s3_secret_access_key,
        )
        self.bucket = settings.s3_bucket

    def upload_fileobj(self, key: str, fileobj: BinaryIO, content_type: str) -> None:
        self.client.upload_fileobj(fileobj, self.bucket, key, ExtraArgs={"ContentType": content_type})

    def presigned_download_url(self, key: str, filename: str, expires_in: int = 900) -> str:
        return self.client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": self.bucket,
                "Key": key,
                "ResponseContentDisposition": f'attachment; filename="{sanitize_filename(filename)}"',
            },
            ExpiresIn=expires_in,
        )
