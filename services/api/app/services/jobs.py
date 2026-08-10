from redis import Redis
from rq import Queue

from app.core.config import settings


def dataset_queue() -> Queue:
    return Queue("datasets", connection=Redis.from_url(settings.redis_url))


def enqueue_dataset_inspection(dataset_id: str) -> None:
    dataset_queue().enqueue("worker.main.inspect_dataset", dataset_id)
