import type { DatasetSummary, DatasetUploadMetadata } from "../api/client";

export function parseTagInput(value: string): string[] {
  const tags = value
    .split(/[,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  return Array.from(new Set(tags));
}

export function UploadDatasetDialog({
  onUpload,
  onUploaded,
}: {
  onUpload?: (metadata: DatasetUploadMetadata, file: File) => Promise<DatasetSummary>;
  onUploaded?: (dataset: DatasetSummary) => void;
}) {
  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const file = data.get("file");
    if (!(file instanceof File)) return;

    const dataset = await onUpload?.(
      {
        name: String(data.get("name") ?? ""),
        project: String(data.get("project") ?? ""),
        tags: parseTagInput(String(data.get("tags") ?? "")),
        description: String(data.get("description") ?? ""),
      },
      file,
    );
    if (dataset) onUploaded?.(dataset);
  }

  return (
    <form className="upload-form" onSubmit={handleSubmit}>
      <label>
        数据名称
        <input name="name" required />
      </label>
      <label>
        所属项目/主题
        <input name="project" />
      </label>
      <label>
        标签
        <input name="tags" placeholder="韧性, 交通, 道路" />
      </label>
      <label>
        简短说明
        <textarea name="description" />
      </label>
      <label>
        原始文件
        <input name="file" type="file" required />
      </label>
      <button type="submit">上传入库</button>
    </form>
  );
}
