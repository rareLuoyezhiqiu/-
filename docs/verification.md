# Android MVP 发布验证（2026-11-17）

本次环境：Windows、Node 26.13.1、JDK 21.0.13、Gradle 8.14.3、SDK 36、Capacitor 8.6.2。

- `npm test`：类型检查与构建成功，19 项服务端/协议测试、24 项 Chromium 浏览器测试通过，失败 0。
- `npm run android:build`：正式签名 APK 与 `lintRelease` 通过（0 errors；模板资源及依赖更新提示为非阻断 warnings）。
- `:app:connectedDebugAndroidTest`：Android 15 ATD / WebView 124 的 3 项 instrumentation 测试通过，失败 0：真实 Keystore 加密与进程内重读；WebView 新增、返回键草稿与重开；原生 HTTPS 连接受控上游、凭据附加、中文/emoji SSE 完整响应。
- 正式 Release APK：安装启动、输入保存、关闭 Wi-Fi/移动网络后强制关闭重开、同签名 APK 覆盖安装后原记录保留、API 设置界面、系统文件保存对话框保存并读取真实格式 v2 JSON 均已检查。
- `apksigner verify --verbose --print-certs`：APK Signature Scheme v2 验证成功，RSA 3072 位正式签名，证书 SHA-256 `041c9319cfe56ee0e97b7154a1ca18dc7feb9c0523c79fcb6b6f21c0cf127fa1`。
- Android 无需运行 Node 服务；直连 UI 使用受控原生桥接覆盖保留、取消、密钥不进入浏览器存储或备份；原生加密及 HTTPS 已另用真实 Android 测试验证。

实际 APK 截图：`artifacts/android-release-home.png`、`android-release-editor.png`、`android-release-settings.png`、`android-release-offline.png`、`android-release-updated.png`、`android-release-export.png`。已查看实际界面，沿用现有设计，删除重复密钥说明，Android 隐藏网页安装和持久化授权入口。

测试范围限制：覆盖安装本次使用同版本同签名包，尚未与未来数据库版本联测；没有真实付费 API Key，未评估实际模型质量和中国大陆网络。实体手机、厂商后台策略、Android 7～14/16 兼容性、一周试用仍待执行。Android 9 旧镜像 WebView 66 不满足 107 下限，已验证会显示「请更新系统 WebView」提示，未声称支持该旧 WebView。

受控 HTTPS 测试信任覆盖仅在 androidTest 进程，测试 PKCS12 夹具不进入 Release APK。正式签名密钥仅本机 `.signing/` 保管，未提交。

---

# V0.2 验证记录

日期：2026-11-16。Windows / Node.js 26.13.1 / Playwright Chromium。

`npm test`：类型检查和生产构建通过；服务端 12 项、浏览器 22 项通过，失败 0。

## 本次覆盖

- AI-01/03/04/05：告知取消无生成请求、仅正文和 requestId、单任务与收起、候选不导出、保留持久化、纯文本展示。
- AI-06/07/08/10：替换失败与取消保留旧内容、本机 put 故障后重试、拓写编辑草稿恢复和取消、单独删除及原文关联删除。
- AI-09/11/12：断流/空白/流内错误不可保留；真实 HTTP 上游超时、限流、取消；原文变化禁用保留，强行触发保留仍被数据库事务拒绝；删除后晚到结果无效；跨标签页变更提示。
- AI-13：原生 IndexedDB 创建 v1/v2 数据，迁移到 v3 保留正文、时间和草稿；真实数据库故障回滚；离线编辑已保留拓写；格式 v2 备份排除草稿和候选。
- 更新：真实 Service Worker 版本切换，存在未保留候选时可取消更新；确认更新后正式原文、拓写与编辑草稿保留，候选消失且不自动生成。
- AI-14 自动化部分：390×844、1440×1050、320×360，面板滚动和保留按钮可达；孤立编辑草稿只能复制或放弃，不会重建原记录。
- AI-15：授权、来源、超长/非法输入及过期告知在调用上游前拒绝；配置修改使告知失效；设置完成清空 API Key，公开配置不回传密钥。
- SSE：中文 UTF-8 逐字节分块、CRLF、事件跨块、多事件、完成标记、截断/空白/超长；OpenAI 兼容和 Anthropic Messages 两条适配路径。

浏览器用受控 AI 响应测试确定性的 UI 行为；数据库为真实 IndexedDB；服务端使用本地真实 HTTP 上游覆盖流生命周期。未以这些测试代替真实模型联调。

## 截图与视觉检查

- `artifacts/ai-preview-mobile.png`：手机候选预览，保留/重新生成/关闭。
- `artifacts/ai-saved-mobile.png`、`artifacts/ai-saved-desktop.png`：已保留的可折叠拓写。
- `artifacts/api-settings-mobile.png`：API 设置表单。
- `artifacts/ai-short-viewport.png`：小视口保留按钮。
- 原有 `mobile.png`、`desktop.png`、`mobile-editor.png` 等随回归更新。

已查看手机、桌面和 API 设置截图。沿用原有字体、颜色和层级；拓写通过分割线和折叠区分组，按钮仅主操作着色，无新增渐变、发光、图标或装饰卡片。截图中的脚本文字专用于验证纯文本显示。

## 尚未验证

没有用户真实 API Key，尚未完成真实厂商端到端调用、取消和输出质量评审（AI-02）。主流模型预设依据官方文档，账户授权、地域可用性和兼容性仍需实际联调。也未执行中国大陆目标网络、真实 HTTPS 部署、安卓安装/键盘/后台行为与一周个人试用。这些不计入已通过验收。

---

以下为 V0.1 历史验证记录（测试数量和数据版本以以上 V0.2 记录为准）：

# MVP 验证记录

日期：2026-11-16。环境：Windows、Node.js 26.13.1、Playwright Chromium。

## 自动化验证

`npm test` 包含 vue-tsc、Vite 生产构建和 9 项浏览器测试：

1. 新增、空白拦截、换行、编辑排序、取消编辑、删除确认与持久化。
2. 新增/编辑草稿恢复、切换取消保护、关闭页面重开、正式记录隔离。
3. 注入真实 IndexedDB put/delete 失败，检查错误提示、输入保留、原记录保留和重试。
4. 数据库打开失败提示和恢复权限后的重新读取。
5. 正式记录写入后草稿删除失败，触发整个事务回滚，恢复后不重复记录。
6. 原生 IndexedDB 创建 v1 数据，真实升级 v2 后正文、时间保留。
7. 首次缓存后浏览器断网重开和保存，JSON 导出准确且不含草稿。
8. 390px 手机、1440px 桌面、320×360 缩小视口；纯文本安全显示、保存按钮可见、无横向溢出。
9. HTTP 服务提供不同版本的真实 Service Worker，验证更新提示、不强制刷新、更新后记录与草稿保留。

测试监听未捕获异常与控制台错误；Playwright trace 保留操作过程截图。截图中的正文为测试输入，应用首次打开为空列表。

## 界面检查

保留原型灰白底色和绿色主按钮，移除无信息含义的品牌圆点，列表仍使用留白和分隔线。补齐本机存储说明、备份入口、取消编辑。已查看桌面、手机和编辑器截图。

对照截图：`artifacts/desktop-before.png`、`artifacts/mobile-before.png`。
当前截图：`artifacts/desktop.png`、`mobile.png`、`mobile-editor.png`、`mobile-empty.png`、`short-viewport.png`。

## 未完成的人工验收

未连接安卓真机，以下结果不能用桌面自动化替代：

| 项目 | 状态 | 实测需记录 |
| --- | --- | --- |
| HTTPS 安装到桌面与独立窗口启动 | 待验证 | 机型、安卓与浏览器版本 |
| 真实软键盘弹出后输入和保存 | 待验证 | 键盘、横竖屏、按钮可达性 |
| 切后台、系统关闭后的草稿恢复 | 待验证 | 最后输入与暂存提示 |
| 飞行模式桌面启动和保存 | 待验证 | 首次在线缓存完成情况 |
| 中国大陆网络与固定站点部署 | 待确定托管后验证 | 地址、网络、加载时间 |
| 个人试用一周 | 待用户执行 | 记录速度、回看频率、丢失或提示不清晰情况 |

最终执行结果：npm test 9 项通过、0 失败；类型检查和生产构建通过；npm audit 0 vulnerabilities。

## 编辑面板入口调整验证

新增两项浏览器测试：主列表无生成入口，新增/编辑面板先保存当前内容再生成；保存失败无 AI 请求且输入保留，恢复后可重试。回归测试改为从编辑面板进入。验证返回编辑再生成不产生重复记录。手机、桌面截图见 `artifacts/expand-editor-mobile.png`、`artifacts/expand-editor-desktop.png`。
