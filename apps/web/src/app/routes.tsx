import { useEffect, useMemo, useState } from "react";
import {
  getDataset,
  getDatasetDownload,
  listDatasets,
  login,
  uploadDataset,
  type DatasetSummary,
  type DatasetUploadMetadata,
} from "../api/client";
import { LoginPage } from "../auth/LoginPage";
import { DatasetDetailPage } from "../datasets/DatasetDetailPage";
import { DatasetLibraryPage } from "../datasets/DatasetLibraryPage";
import { UploadDatasetDialog } from "../datasets/UploadDatasetDialog";
import { MapWorkspacePage } from "../map/MapWorkspacePage";

export type AppRoute =
  | { name: "login" }
  | { name: "datasets" }
  | { name: "dataset-upload" }
  | { name: "dataset-detail"; datasetId: string }
  | { name: "map"; datasetId?: string }
  | { name: "map-demo" };

export function resolveRoute(hash: string): AppRoute {
  const path = hash.replace(/^#/, "") || "/datasets";
  const [pathname, query = ""] = path.split("?");
  const parts = pathname.split("/").filter(Boolean);
  const params = new URLSearchParams(query);

  if (parts[0] === "login") return { name: "login" };
  if (parts[0] === "map-demo") return { name: "map-demo" };
  if (parts[0] === "map") return { name: "map", datasetId: params.get("dataset") ?? undefined };
  if (parts[0] === "datasets" && parts[1] === "upload") return { name: "dataset-upload" };
  if (parts[0] === "datasets" && parts[1]) return { name: "dataset-detail", datasetId: parts[1] };
  return { name: "datasets" };
}

export function datasetNeedsStatusRefresh(dataset?: Pick<DatasetSummary, "status">): boolean {
  return dataset?.status === "pending" || dataset?.status === "processing";
}

function useRoute(): AppRoute {
  const [route, setRoute] = useState(() => resolveRoute(window.location.hash));

  useEffect(() => {
    const handleHashChange = () => setRoute(resolveRoute(window.location.hash));
    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  return route;
}

export function App() {
  const route = useRoute();
  const [token, setToken] = useState(() => window.localStorage.getItem("platform_token") ?? "");
  const [query, setQuery] = useState("");
  const [datasets, setDatasets] = useState<DatasetSummary[]>([]);
  const [message, setMessage] = useState("");
  const [downloadUrl, setDownloadUrl] = useState("");

  useEffect(() => {
    if (!token) return;
    listDatasets(token, query ? { q: query } : {})
      .then(setDatasets)
      .catch((error: Error) => setMessage(error.message));
  }, [query, token]);

  const activeDataset = useMemo(() => {
    if (route.name !== "dataset-detail") return undefined;
    return datasets.find((dataset) => dataset.id === route.datasetId);
  }, [datasets, route]);

  useEffect(() => {
    if (!token || route.name !== "dataset-detail" || activeDataset) return;
    getDataset(token, route.datasetId)
      .then((dataset) => {
        setDatasets((current) => [dataset, ...current.filter((item) => item.id !== dataset.id)]);
        setMessage("");
      })
      .catch((error: Error) => setMessage(error.message));
  }, [activeDataset, route, token]);

  useEffect(() => {
    if (!token || route.name !== "dataset-detail" || !activeDataset || !datasetNeedsStatusRefresh(activeDataset)) return;

    const timer = window.setInterval(() => {
      getDataset(token, activeDataset.id)
        .then((dataset) => {
          setDatasets((current) => [dataset, ...current.filter((item) => item.id !== dataset.id)]);
          setMessage("");
        })
        .catch((error: Error) => setMessage(error.message));
    }, 5000);

    return () => window.clearInterval(timer);
  }, [activeDataset, route, token]);

  function handleTokenChange(value: string) {
    setToken(value);
    window.localStorage.setItem("platform_token", value);
  }

  async function handleLogin(email: string, password: string) {
    const response = await login(email, password);
    handleTokenChange(response.access_token);
    setMessage("");
    window.location.hash = "#/datasets";
  }

  function handleLogout() {
    setToken("");
    window.localStorage.removeItem("platform_token");
    window.location.hash = "#/login";
  }

  async function handleUpload(metadata: DatasetUploadMetadata, file: File) {
    const created = await uploadDataset(token, metadata, file);
    setDatasets((current) => [created, ...current.filter((dataset) => dataset.id !== created.id)]);
    window.location.hash = `#/datasets/${created.id}`;
    return created;
  }

  async function handleDownload(datasetId: string) {
    const result = await getDatasetDownload(token, datasetId);
    setDownloadUrl(result.download_url);
    window.location.href = result.download_url;
  }

  if (route.name === "map-demo") {
    return <MapWorkspacePage token="" />;
  }

  if (!token || route.name === "login") {
    return <LoginPage message={message} onLogin={handleLogin} />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <a className="brand" href="#/datasets">科研资产平台</a>
        <nav className="nav-links" aria-label="Primary">
          <a href="#/datasets">数据资源库</a>
          <a href="#/datasets/upload">上传入库</a>
          <a href="#/map">地图工作台</a>
        </nav>
        <button className="secondary-button" onClick={handleLogout} type="button">退出登录</button>
      </header>

      {message && <p className="system-message">{message}</p>}

      {route.name === "datasets" && (
        <DatasetLibraryPage
          datasets={datasets}
          onQueryChange={setQuery}
          onSelectDataset={(datasetId) => {
            window.location.hash = `#/datasets/${datasetId}`;
          }}
          onUploadClick={() => {
            window.location.hash = "#/datasets/upload";
          }}
          query={query}
        />
      )}
      {route.name === "dataset-upload" && (
        <UploadDatasetDialog
          onUpload={handleUpload}
          onUploaded={(dataset) => setMessage(`${dataset.name} 已提交后台识别`)}
        />
      )}
      {route.name === "dataset-detail" && activeDataset && (
        <DatasetDetailPage dataset={activeDataset} downloadUrl={downloadUrl} onDownload={handleDownload} />
      )}
      {route.name === "dataset-detail" && !activeDataset && (
        <section className="empty-state">
          <h1>未找到数据集</h1>
          <a href="#/datasets">返回数据资源库</a>
        </section>
      )}
      {route.name === "map" && <MapWorkspacePage initialDatasetId={route.datasetId} token={token} />}
    </main>
  );
}
