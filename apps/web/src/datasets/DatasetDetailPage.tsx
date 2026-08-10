import type { DatasetSummary } from "../api/client";
import { datasetStatusLabel } from "./DatasetLibraryPage";

export function datasetSupportsMapPreview(dataset: Pick<DatasetSummary, "status" | "type">): boolean {
  return dataset.status === "ready" && ["vector", "raster", "table"].includes(dataset.type);
}

export function datasetMapCtaLabel(status?: string): string {
  return status === "ready" ? "在地图工作台打开预览" : "后台识别完成后可加载到地图";
}

export function buildDatasetMapHref(datasetId: string): string {
  return `#/map?dataset=${encodeURIComponent(datasetId)}`;
}

export function DatasetDetailPage({
  dataset,
  downloadUrl,
  onDownload,
}: {
  dataset: DatasetSummary;
  downloadUrl?: string;
  onDownload?: (datasetId: string) => void;
}) {
  return (
    <article className="dataset-detail">
      <h1>{dataset.name}</h1>
      <dl>
        <dt>类型</dt>
        <dd>{dataset.type}</dd>
        <dt>项目/主题</dt>
        <dd>{dataset.project || "未填写"}</dd>
        <dt>标签</dt>
        <dd>{dataset.tags.join("、") || "未填写"}</dd>
        <dt>原始文件</dt>
        <dd>{dataset.original_filename || "等待后台同步"}</dd>
        <dt>处理状态</dt>
        <dd>{datasetStatusLabel(dataset.status)}</dd>
        {dataset.processing_message && (
          <>
            <dt>处理说明</dt>
            <dd>{dataset.processing_message}</dd>
          </>
        )}
      </dl>
      <div className="detail-actions">
        {datasetSupportsMapPreview(dataset) ? (
          <a className="primary-link-button" href={buildDatasetMapHref(dataset.id)}>
            {datasetMapCtaLabel(dataset.status)}
          </a>
        ) : (
          <span className="disabled-link-button">{datasetMapCtaLabel(dataset.status)}</span>
        )}
        <button onClick={() => onDownload?.(dataset.id)} type="button">下载原始文件</button>
      </div>
      {downloadUrl && <a href={downloadUrl}>下载链接已生成</a>}
    </article>
  );
}
