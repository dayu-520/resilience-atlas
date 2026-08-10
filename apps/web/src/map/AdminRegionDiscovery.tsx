import type { RegionDatasetsResponse } from "../api/client";
import { getRegionDatasets } from "../api/client";

type RegionDataset = { id: string; name: string; type?: string };

export function normalizeRegionResult(result: RegionDatasetsResponse): {
  regionName: string;
  datasets: RegionDataset[];
} {
  return {
    regionName: result.region.name,
    datasets: result.datasets.map((dataset) => ({ id: dataset.id, name: dataset.name })),
  };
}

export function summarizeRegionDatasets(regionName: string, datasets: RegionDataset[]): string {
  if (datasets.length === 0) return `${regionName}暂无已入库数据`;
  return `${regionName}已有 ${datasets.length} 个数据成果`;
}

export async function loadRegionDatasets(
  token: string,
  regionId: string,
  fetcher = getRegionDatasets,
): Promise<{ regionName: string; datasets: RegionDataset[] }> {
  return normalizeRegionResult(await fetcher(token, regionId));
}

export function AdminRegionDiscovery({
  regionName,
  datasets,
  onLoadDataset,
}: {
  regionName: string;
  datasets: RegionDataset[];
  onLoadDataset?: (dataset: RegionDataset) => void;
}) {
  return (
    <aside className="admin-region-discovery">
      <h2>{summarizeRegionDatasets(regionName, datasets)}</h2>
      <ul>
        {datasets.map((dataset) => (
          <li key={dataset.id}>
            <span>{dataset.name}</span>
            {onLoadDataset && (
              <button onClick={() => onLoadDataset(dataset)} type="button">加载</button>
            )}
          </li>
        ))}
      </ul>
    </aside>
  );
}
