# 韧性云图（Resilience Atlas）

面向城市规划工作室的空间数据共享、发现与可视化平台。项目将原单页 Supabase Demo 重构为可独立部署的 React + FastAPI + PostGIS + MinIO 系统，同时保留无需服务器的浏览器本地工作台。

## 在线作品演示

**[立即体验韧性云图](https://dayu-520.github.io/resilience-atlas/)**

GitHub Pages 提供无需注册的纯前端展示版。可上传 GeoJSON、Shapefile ZIP 或 GeoTIFF，体验数据管理、地图可视化与样式配置；数据仅保存在访客当前浏览器中。完整多人协作版的部署方式见下文。

## 已实现功能

- 工作室账号、工作空间以及所有者 / 编辑者 / 查看者三级权限
- 团队共享数据与浏览器本地数据两种模式
- Shapefile ZIP、GeoJSON、GeoTIFF 单个或批量入库
- 上传前批量修改数据名称，缺失或错误投影时指定 EPSG
- PostGIS 空间索引和京津冀行政区识别；双击地图检索覆盖当前区域的数据
- 高德路网、ArcGIS 卫星、CARTO 深色与浅色底图
- 图层加载、显隐、排序、定位、移除与源文件下载
- 点、线、面单一符号和数值字段分级渲染
- GeoTIFF 连续 / 分段渲染、分位数 / 等距 / 手动阈值、色带、范围和实时图例
- 团队样式保存、本地 IndexedDB 持久化、主题切换、侧栏缩放和快捷键
- 示例数据：[examples/sample-points.geojson](examples/sample-points.geojson)

## 平台管理与数据存储

- `PLATFORM_ADMIN_USERNAME` 指定的平台管理员登录后会进入独立的“平台管理中心”，普通账号不会看到该入口。
- 管理中心包含平台概览、账号管理、工作室管理和全平台数据清单；支持停用/恢复/删除账号、移除工作室成员和转移工作室管理员权限。
- 账号、工作室、成员关系、权限、数据元信息和统计信息保存在 PostgreSQL；空间范围与行政区几何由 PostGIS 保存并建立空间索引。
- 上传的 Shapefile、GeoJSON、GeoTIFF 源文件及地图预览保存在 MinIO。数据库仅保存对象键、文件大小、类型、字段和空间范围等元信息。
- 浏览器“本地工作台”的数据只保存在当前浏览器 IndexedDB（LocalForage）中，不会上传到服务端，也不会出现在平台管理中心。
- 每次云端数据读取、下载和修改都会在 FastAPI 层校验工作室成员关系和角色。工作室所有者只能管理自己的工作室；只有平台管理员可调用 `/api/admin/*` 全平台接口。

删除账号前必须先转移其工作室管理员权限。删除后共享数据不会丢失：数据上传者和工作室创建记录会转交给当前工作室管理员；停用账号则只禁止登录，不删除任何数据。
## 项目结构

```text
frontend/       React 19 + TypeScript + Vite + Leaflet
backend/        FastAPI + SQLAlchemy Async + GeoAlchemy2
infra/          PostGIS 初始化脚本
examples/       可直接上传的验收数据
docker-compose.yml
```

## 一键启动

需要 Docker Desktop 或 Docker Engine（含 Compose）。

```bash
cp .env.example .env
docker compose up --build -d
docker compose exec api python3 scripts/seed_admin_regions.py
```

打开：

- 平台：http://localhost:8080
- API 文档：http://localhost:8000/docs
- MinIO 控制台：http://localhost:9001

首次使用在登录页选择“创建工作空间”。行政区脚本只需在首次部署后或边界数据需要更新时执行。

## 本地前端开发

```bash
cd frontend
pnpm install
pnpm dev
```

默认请求 `http://localhost:8000/api`。也可以不启动服务端，直接在登录页进入“本地工作台”；数据将保存在当前浏览器的 IndexedDB 中。

## 生产部署要点

1. 从 `.env.example` 复制配置并更换数据库、MinIO 和 JWT 密钥。
2. 通过 HTTPS 反向代理暴露 Web 与 API；只在内网暴露 Postgres 和 MinIO。
3. 将 Postgres 与 MinIO 数据卷纳入备份。
4. 正式域名部署时同步调整 `VITE_API_URL` 和后端 `CORS_ORIGINS`。
5. 大规模矢量数据可在下一阶段接入矢量瓦片服务；当前版本使用 GeoJSON 预览，优先保证与原型一致的直接交互和制图能力。

更完整的组件、数据流和接口说明见 [docs/architecture.md](docs/architecture.md)。

## 验证

```bash
cd frontend
pnpm run build

cd ..
python -m compileall -q backend/app backend/scripts backend/tests
```

前端还可以使用 `examples/sample-points.geojson` 验证“上传 → 入库 → 加载 → 数值分级制图”全流程。
