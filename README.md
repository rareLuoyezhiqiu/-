# 灵感清单

基于 Vue 3、TypeScript、Vite、Dexie / IndexedDB 的手机优先灵感记录应用。无账号、后端、跨设备同步，不初始化演示数据。

## 本地运行

需要 Node.js 22.12+（验证环境为 26.13.1）。

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
