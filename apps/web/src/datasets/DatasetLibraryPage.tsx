import type { DatasetSummary } from "../api/client";

const STATUS_LABELS: Record<string, string> = {
  failed: "处理失败",
  needs_spatial_reference: "待补充坐标系",
  pending: "待处理",
  processing: "后台识别中",
  ready: "可预览下载",
};

export function datasetStatusLabel(status?: string): string {
  return STATUS_LABELS[status ?? "pending"] ?? "状态未知";
}

export function emptyDatasetMessage(query: string): string {
  const trimmed = query.trim();
  if (!trimmed) return "暂无已入库 GIS 数据";
  return `没有匹配“${trimmed}”的数据集`;
}

export function filterDatasets(datasets: DatasetSummary[], query: string): DatasetSummary[] {
  const q = query.trim().toLowerCase();
  if (!q) return datasets;

  return datasets.filter((dataset) => {
    const haystack = [
      dataset.name,
      dataset.project ?? "",
      dataset.type,
      dataset.status ?? "",
      ...(dataset.tags ?? []),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(q);
  });
}

type DatasetLibraryPageProps = {
  datasets?: DatasetSummary[];
  query?: string;
  onQueryChange?: (query: string) => void;
  onSelectDataset?: (datasetId: string) => void;
  onUploadClick?: () => void;
};

export function DatasetLibraryPage({
  datasets = [],
  query = "",
  onQueryChange,
  onSelectDataset,
  onUploadClick,
}: DatasetLibraryPageProps) {
  const visibleDatasets = filterDatasets(datasets, query);

  return (
    <section className="dataset-library">
      <div className="section-heading">
        <p className="eyebrow">GIS Data Library</p>
        <h1>数据资源库</h1>
        <p>搜索、上传、预览和下载团队 GIS 原始数据。</p>
      </div>
      <div className="toolbar">
        <input
          aria-label="搜索数据集"
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder="名称、项目、标签、类型"
          value={query}
        />
        <button onClick={onUploadClick} type="button">上传入库</button>
      </div>
      <div className="dataset-grid">
        {visibleDatasets.map((dataset) => (
          <article className="dataset-card" key={dataset.id}>
            <h2>{dataset.name}</h2>
            <p>{dataset.project || "未填写项目"}</p>
            <p className={`status-pill status-${dataset.status ?? "pending"}`}>
              {datasetStatusLabel(dataset.status)}
            </p>
            <div className="tag-row">
              {dataset.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            <button onClick={() => onSelectDataset?.(dataset.id)} type="button">查看详情</button>
          </article>
        ))}
      </div>
      {visibleDatasets.length === 0 && (
        <section className="empty-state">
          <h2>{emptyDatasetMessage(query)}</h2>
          <button onClick={onUploadClick} type="button">上传第一份数据</button>
        </section>
      )}
    </section>
  );
}
