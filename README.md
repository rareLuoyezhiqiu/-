# 灵感清单

基于 Vue 3、TypeScript、Vite、Dexie / IndexedDB 的手机优先灵感记录应用。无账号、云端记录库、跨设备同步；AI 由独立的服务端代理调用，不初始化演示数据。

## 本地运行

需要 Node.js 22.18+（运行 TypeScript 服务端）（验证环境为 26.13.1）。

```sh
npm ci
npm run dev -- --port 5173
```

打开 http://localhost:5173 。开发模式不注册 Service Worker。验证生产版本与离线能力：

```sh
npm run build
npm run preview -- --port 4183
```

打开 http://localhost:4183 。首次联网缓存完成后可断网重开。Service Worker 要求 HTTPS 或 localhost；手机通过普通局域网 HTTP 访问可检查页面，但不能验收完整 PWA，真机应使用固定 HTTPS 地址。

## 功能

- 纯文字新增、编辑、取消、确认删除；保留换行，空白禁止保存，编辑不改变创建时间排序。
- IndexedDB 保存记录；草稿独立暂存，恢复、放弃、切换前确认。输入后 180ms 防抖写入，收起、切后台尽力立即写入；突然杀进程可能丢失未完成写入的内容。
- 正式保存与草稿清除为单一事务，防重复提交，失败保留输入；读取、删除、草稿失败分别提示。
- Manifest、本地图标、离线资源缓存与新版本更新提示，不在输入时强制刷新。
- JSON 备份（格式版本、导出时间、正式记录，不含草稿）、本机存储说明和持久化存储申请。暂不支持导入。

## 验证

```sh
npx playwright install chromium
npm test
npm audit
```

`npm test` 先执行类型检查与生产构建，再用独立的 4183 端口运行真实 Chromium 流程。失败截图和包含操作截图的 trace 在 `test-results/`；交付截图在 `artifacts/`。

依赖 overrides：deepmerge 4.1.1 避开已披露的 4.2–4.3.1 原型污染范围，glob / minimatch 使用修复版本。升级 PWA 构建链时应复查这些约束并运行构建、离线和更新测试。

## 数据和部署

数据库 `inspiration-list`：v1 定义 notes/drafts，v2 增加更新时间索引并为旧数据补齐更新时间。通过版本迁移升级，不清库。原 `demo/` 是 localStorage 原型，已从当前工程移除，可在 Git 历史查阅；原型数据不会自动导入正式数据库。

把 `dist/` 部署到固定 HTTPS 站点根目录。资源全部同源，无运行时 CDN。为 `sw.js` 和 `index.html` 设置 `Cache-Control: no-cache`，带哈希的 assets 可长期缓存。不同协议、域名、端口具有独立存储空间。

托管商和域名尚未确定，本次未发布线上服务。安卓真机桌面启动、真实软键盘、切后台、断网启动和一周试用尚未执行；缩小视口不等同于真机验收。见 [验证记录](docs/verification.md)。

## V0.2：AI 拓写与 API 设置

已实现流式预览、收起继续、取消/重试、手动保留/确认替换、拓写编辑草稿、关联删除、原文变化保护。基础记录仍不依赖 AI。数据库 v3 新增 expansions 并迁移草稿 kind；备份格式 v2 仅含正式 notes/expansions。

### 本机启动 AI

1. 复制 `.env.example` 为 `.env`，将 `APP_ACCESS_TOKEN` 换成自己的随机口令（建议至少 32 字符）。`APP_ORIGIN` 要与浏览器地址完全一致，例如 `http://localhost:4173`，包括端口。
2. 一个终端运行 `npm run server`（监听本机 4174），另一个运行 `npm run dev`（4173）。Vite 已代理 `/api/`；生产预览也支持同一代理。
3. 页面底部打开「API 设置」，填写个人访问口令，选择服务商，填写完整接口地址、模型 ID、API Key 及服务商数据处理政策地址，点击「保存 API 设置」。没有预算配置项。
4. 进入新增或原文编辑面板，点击「帮我展开」或「保存并展开」，确认数据发送告知。未点击「保留拓写」的结果不会保存或导出。

访问口令只在页面内存中使用，刷新后在设置中重新输入并点「连接已配置的服务」。UI 提交的 API Key 只存在服务进程内存，重启服务后重填。希望服务重启后保持配置时，可由部署者在 `.env` 填写 `AI_*` 环境变量；该文件已被 Git 忽略。更换接口/服务商/模型/政策后，确认版本会失效。

预设含 DeepSeek、OpenAI、Anthropic、Google Gemini、阿里云百炼、Kimi、智谱、MiniMax，模型 ID 可编辑。官方资料与核对日期见 [模型预设来源](docs/ai-providers.md)。预设代表文档中的模型名称，不表示已用你的账户实测可调用。

### 部署

采用单进程 Node.js 服务，静态 `dist/` 与 `/api/` 通过同一 HTTPS 域名提供。反向代理 `/api/` 到本机 4174；禁用响应缓存/缓冲，超时设为大于 45 秒，不回退成 index.html。设置准确的 `APP_ORIGIN` 和私人 `APP_ACCESS_TOKEN`。不要开启请求正文、响应正文或 Authorization 采集。

服务默认每分钟最多 10 次生成、同时 1 次，是防误触/滥用保护，不统计费用、不设置预算上限。当前是单用户单进程实现；多实例需在网关统一限流。输出限 16 KiB、原文限 4,000 Unicode 字符、请求体限 32 KiB，总超时 45 秒。只收到完整成功事件才允许保留。

自定义上游必须为 HTTPS 完整请求地址，并由部署者将可信域名加入 `AI_ALLOWED_HOSTS`（逗号分隔）。界面不能随意让代理访问内网地址；禁止重定向。允许列表只添加你信任的供应商域名。API Key 不进入前端构建、IndexedDB、localStorage 或备份。

未配置或服务故障时，仅 AI 不可用。数据库升级不可通过删除数据回滚；若需回滚，使用能打开 v3 的兼容应用版本，不直接换回 v2 旧前端。

`npm test` 包含类型检查、构建、12 项服务端测试及 22 项浏览器测试。当前没有真实 API Key，真实服务生成质量、中国大陆网络和安卓真机仍待联调；见 [验证记录](docs/verification.md)。
