# HTML demo 功能复用与后续开发指南

日期：2026-05-10

## 1. 结论

`京津冀城市韧性_cloud_supabase_版本.html` 仍然应作为一期前端体验基准。它不应被整体搬进新项目，也不应继续沿用 Supabase、本地浏览器缓存和单文件全局脚本架构；但它对“城市韧性 GIS 工作台”的界面气质、交互密度、图层控制、数据入库、行政区发现和样式预览已经表达得比较完整。

后续开发要遵循一个原则：工程架构按设计文档重构，产品体验按 demo 对齐。

也就是说：

- 后端继续使用当前设计文档确定的 FastAPI + PostgreSQL/PostGIS + 对象存储 + Worker。
- 前端不要做成普通后台列表页，而要保留 demo 的 GIS 工作台感。
- demo 中可复用的是交互模型、样式语言和部分纯前端 GIS 处理算法。
- demo 中不能复用的是 Supabase 连接、浏览器本地目录存储、IndexedDB 作为主库、前端解析大文件作为正式入库链路。

## 2. 与设计文档的对应关系

设计文档中的一期目标是“企业内部 GIS 数据资源库”，核心页面包括登录、数据资源库、上传、详情、地图预览工作台、行政区成果发现。demo 对应关系如下。

| 设计文档功能 | demo 中对应能力 | 后续开发要求 |
| --- | --- | --- |
| 登录页 | Supabase 邮箱密码登录面板 | 只保留“登录后进入平台”的体验，不保留 Supabase 配置表单；对接 `/auth/login`。 |
| 数据资源库 | 右侧控制台“数据”页、已存数据列表、加载/删除/下载 | 保留在地图工作台内的轻量列表，同时也可有独立资源库页；数据来自 `/datasets`。 |
| 数据上传 | 拖拽上传、批量确认、重命名、EPSG 输入 | 必须补回这个流程；上传到后端，不在浏览器中作为正式解析主链路。 |
| 数据详情 | demo 通过图层卡片和 popup 展示字段、类型、加载状态 | 新项目需要独立详情页，展示元信息、字段、范围、处理状态、下载入口。 |
| 地图预览工作台 | Leaflet 地图、底图切换、左侧 TOC、右侧控制台、图层样式 | 这是 demo 最应保留的部分，当前实现需要继续往 demo 靠拢。 |
| 行政区成果发现 | 双击地图识别行政区，弹出覆盖数据列表 | 后续改为点击/双击行政区后请求 `/admin-regions/{id}/datasets`；不再前端遍历所有数据。 |
| 原始文件下载 | `downloadLayerSource(id)` 优先下载上传原始文件 | 保留“下载原始文件”的产品承诺；实现走后端预签名下载 URL。 |
| 处理状态 | demo 主要靠本地解析成功/失败提示 | 新项目必须展示 pending/processing/ready/failed/needs_spatial_reference。 |

## 3. 应保留的界面风格

demo 的地图页是深色专业 GIS 工作台，不是普通 SaaS 仪表盘。后续前端需要保留这些特征：

- 顶部品牌栏：项目名“韧性城市与城市未来”、数据管理入口、系统状态提示。
- 主区域三栏感：左侧浮动图层控制、中央地图、右侧可收起控制台。
- 右侧控制台 tab：符号、图层、数据、设置。当前代码中的 `layers/data/discover/settings` 可以继续，但应补回“符号”作为核心 tab。
- 深色半透明面板：`#0f172a/#1e293b` 体系、蓝色强调、绿色成功、黄色提示、红色危险操作。
- 地图优先：地图必须占据第一屏主体，不要被大标题、说明文字或普通卡片稀释。
- 专业控件密度：按钮、选择框、滑杆、色带、图例、状态 pill 都应紧凑，避免营销式大卡片。

当前 `apps/web/src/styles/global.css` 已部分吸收 demo 风格，但地图容器被做成带圆角阴影的大卡片，且页面仍有普通标题区。后续地图工作台应更接近 demo：全屏地图，控制面板覆盖其上，右侧控制台固定高度或可拖拽宽度。

## 4. 可复用代码与迁移方式

下面这些 demo 代码值得继续使用，但要改写成 React/TypeScript 模块，而不是复制全局函数。

| demo 能力 | demo 函数/结构 | 建议迁移位置 |
| --- | --- | --- |
| 地图初始化与边界限制 | `initMap()` 中的京津冀 bounds、Leaflet 配置、底图切换 | `apps/web/src/map/mapSetup.ts` 或 `MapWorkspacePage.tsx` hook。 |
| 左侧 TOC 图层模型 | `layers`、`activeLayerId`、`renderLayerList()`、`toggleLayerVisibility()`、`zoomToLayer()` | `apps/web/src/map/layerStore.ts` + React state。 |
| 右侧控制台 tab | HTML 中 `tabbar`、`tabpane`、`setTab()` | React 组件 `WorkbenchSidebar`。 |
| 拖拽上传体验 | `dropzone`、`handleFileSelect()`、`processBatchUpload()` 的确认弹窗思路 | `UploadDatasetDialog.tsx`，但上传走后端 API。 |
| 字段识别 | `detectNumericFields(geojson)` | 可作为预览辅助函数；正式字段识别仍以 worker 为准。 |
| 栅格统计 | `calculateRasterStats(georaster)` | 仅用于前端临时样式预览；正式元数据以 worker 为准。 |
| 矢量样式 | `_vectorGeomKind()`、`updateVectorStyle()` | 改成纯函数：输入 layer/config/theme，输出 Leaflet style。 |
| 栅格分级 | `_parseNumberList()`、`_rasterGetSampleSorted()`、`_rasterComputeBreaks()`、`updateRasterStyle()` | 可迁移为 `rasterStyling.ts`，保留分位数/等距/手动分段。 |
| 色带与图例 | `RAMPS`、`renderVisualRamp()`、`updateLegend()` | `legendUtils.ts` + React `LegendPanel`。 |
| 点线命中容差 | `_distPointToSeg()`、`_pxToMeters()`、`_featureHitsPointOrLine()` | 可用于地图预览的要素点击识别。 |
| 行政区选中高亮 | `handleIdentifyLocal()` 中父级/叶子行政区高亮样式 | 只保留高亮视觉；查询逻辑改用后端 PostGIS。 |
| 原始文件下载体验 | `downloadLayerSource(id)` 的“优先源文件”原则 | 前端按钮调用 `/datasets/{id}/download`，打开预签名 URL。 |

## 5. 不应复用或必须替换的部分

以下代码不要带入正式项目：

- Supabase 适配层：`CLOUD`、`_initSupabaseClient()`、`cloudSetDataset()`、`cloudGetDataset()`、`cloudListMetas()`、云端配置表单全部废弃。
- 本地存储主链路：`localforage`、IndexedDB、File System Access API、`storageSetDataset()` 作为正式数据存储都不要继续使用。
- 前端正式解析入库：`shp()`、`parseGeoraster()`、`proj4` 可用于小文件临时预览，但不能作为正式入库、字段识别、坐标系识别的唯一来源。
- 外部行政区下载：demo 从 `geo.datav.aliyun.com` 动态拉行政区边界。正式项目应由管理员导入行政区到 PostGIS，前端只请求后端。
- EPSG 在线查询：demo 调 `https://epsg.io/{code}.proj4`。正式项目应在后端/worker 处理坐标系，前端只提供“用户补充坐标系”的输入。
- 全局变量和 inline onclick：`map`、`layers`、`activeLayerId`、`window.__loadDatasetById`、大量 `onclick` 都要改成 React state 和事件处理。
- 删除数据的 demo 语义：demo 删除本地数据即可。正式平台删除涉及审计、权限、对象存储和元数据状态，一期如果没有设计删除权限，前端不要暴露随意删除。

## 6. 当前实现的偏离点

当前项目已经搭出了架构，但前端效果和 demo 还有明显距离：

- `MapWorkspacePage.tsx` 现在用的是示意矩形行政区，不是正式京津冀边界，也没有保留 demo 的真实识别体验。
- 地图页把“发现”作为单独 tab，但 demo 的核心是双击/点击地图后在 popup 中直接列出覆盖数据，并支持一键加载。
- `UploadDatasetDialog.tsx` 只有普通表单，没有 demo 的拖拽上传、批量确认、文件重命名、坐标系补充提示。
- 数据资源库页是普通 card grid，缺少 demo 里“已存数据列表 + 加载到地图 + 下载源文件”的工作流。
- 样式面板基本缺失，当前图层卡片只有显示隐藏和定位壳，未实现字段渲染、色带、分级、透明度和图例。
- 当前 CSS 已经有深色控制台雏形，但整体仍偏普通后台页面；地图页应进一步全屏化和工具化。

这些偏离不是后端问题，而是开发时没有把 demo 当成体验基准。

## 7. 后续开发优先级

建议按下面顺序修正，不要先扩展新功能。

1. 地图工作台外观回归 demo：顶部栏、全屏地图、左侧 TOC、右侧控制台、暗色面板。
2. 数据 tab 回归 demo：拖拽上传、批量入库确认、已存数据列表、加载、下载原始文件。
3. 图层 tab 回归 demo：图层卡片、显示隐藏、定位、移除、当前加载状态。
4. 符号 tab 回归 demo：透明度、字段选择、矢量单色/分级、栅格连续/分段、色带、图例。
5. 行政区发现改造：前端点击真实行政区，后端 PostGIS 返回覆盖数据，popup 和侧栏都能展示结果。
6. 数据详情页补齐：字段、空间范围、处理状态、上传人、时间、标签、下载入口。
7. 移除所有 Supabase/本地目录入口和文案，避免用户误解正式平台仍依赖浏览器存储。

## 8. 新后端下的功能映射

| demo 中用户看到的功能 | 新后端实现方式 |
| --- | --- |
| 启用云端数据 | 不再出现；平台默认就是后端集中存储。 |
| 选择本地目录保存 | 不再出现；原始文件进对象存储。 |
| 已存数据列表 | `GET /datasets?q=&type=&status=&uploader_id=` |
| 上传入库 | `POST /datasets`，表单包含 file/name/project/tags/description。 |
| 数据状态 | `Dataset.status`，由 worker 更新。 |
| 加载到地图 | 前端请求 dataset 详情和预览派生文件；后端应提供预览 GeoJSON/栅格 URL。 |
| 下载源文件 | `GET /datasets/{id}/download` 返回预签名 URL。 |
| 双击识别区域内数据 | `GET /admin-regions/{region_id}/datasets`。 |
| 本地字段/范围解析 | Worker 基于 GDAL/OGR 写入 `fields`、`footprint`、`srid`、`processing_message`。 |

当前后端已有 `/datasets`、`/datasets/{id}/download` 和 `/admin-regions/{id}/datasets` 的基础，但还缺一个明确的“预览派生文件”接口。后续地图加载不应下载原始大文件到浏览器再解析，而应加载后端生成的轻量预览成果。

## 9. 前端组件建议

建议把 demo 拆成以下组件和工具模块：

```text
apps/web/src/map/
  MapWorkspacePage.tsx
  MapCanvas.tsx
  WorkbenchTopbar.tsx
  LayerToc.tsx
  WorkbenchSidebar.tsx
  SymbologyPanel.tsx
  LayerPanel.tsx
  DataPanel.tsx
  DiscoverPanel.tsx
  LegendPanel.tsx
  layerTypes.ts
  layerStore.ts
  vectorStyling.ts
  rasterStyling.ts
  identifyUtils.ts
```

`DatasetLibraryPage` 可以保留独立资源库入口，但地图页里的 `DataPanel` 必须能完成 demo 的主要工作流：上传、刷新、筛选、加载到地图、下载原始文件。

## 10. 验收标准

后续前端开发完成后，至少要满足这些视觉和功能标准：

- 打开地图工作台第一眼应像 demo 的专业 GIS 工作台，而不是普通管理后台。
- 用户能在右侧数据 tab 上传 GIS 文件，看到处理状态，处理成功后加载到地图。
- 用户能在左侧 TOC 看到已加载图层，并能显示隐藏、定位、移除。
- 用户能打开符号 tab 调整透明度、字段、色带和分级，并看到图例变化。
- 用户点击或双击京津冀行政区后，能看到该区域覆盖的数据列表，并能一键加载。
- 用户始终能下载上传者的原始文件。
- 页面上不再出现 Supabase URL、anon key、本地目录保存、浏览器缓存作为正式存储等内容。

这份文档应作为后续开发的体验约束：开发可以改技术实现，但不能再偏离 demo 已验证的产品形态。
