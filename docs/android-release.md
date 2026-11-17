# Android 打包与发布

日期：2026-11-17。采用用户确认的 Capacitor + 手机直连 AI 方案。

## 使用

在 GitHub Releases 下载 APK。基础记录无需联网或账号；拓写需在应用内填写自备 API 设置。APK 不内置任何付费密钥。

Android 运行时为 Capacitor 8，最低 Android 7，当前前端要求 WebView 107+。固定包名 `io.github.rareluoyezhiqiu.inspiration`，固定本地源 `https://localhost`。升级期间不改变包名、签名、本地源和 IndexedDB 数据库名，以保持本机记录可读。只支持直接覆盖安装，不自动更新。

## 实现

`src/services/native.ts` 区分 APK 与网页。网页沿用已验证的同源 Node 代理；APK 通过 `InspirationPlugin` 的原生 HTTPS 连接避开 WebView CORS 限制，拒绝 HTTP/带用户信息/查询参数/重定向地址。API Key 留在 Android 端，JS 仅取得公开配置与 revision。请求只附固定指令和当前原文，不附其他记录、草稿、旧拓写。流式返回、取消和 45 秒总超时由原生桥接管理，完整性及 16 KiB 输出限制由共享解析器守住。输入仍限制 4,000 Unicode 字符。

API 设置用 `ConfigVault` 的 AES-GCM 加密后写入应用私有 preferences，AES 密钥由 Android Keystore 生成，不能经该接口导出。卸载后重新安装不保留。关闭应用备份及设备转移；JSON 导出仅含正式记录与拓写。关闭桥接日志和 Release WebView 调试。无请求正文、响应或密钥业务日志。

系统返回键收起编辑/生成面板，草稿沿用事务和暂存保护；无面板时退到后台。Android 不注册 Service Worker，静态资源随 APK 内置。导出用 Storage Access Framework 的系统文件保存界面，不需要广泛存储权限。

## 构建

需要 Node.js 22.18+、JDK 21、Android SDK 36（含 Build Tools）。在 Android Studio 设置 SDK 或填写本地 `android/local.properties`。当前机器已配置完成。

```powershell
npm ci
npm test
npm run android:build
```

`build-android.ps1` 在 `.tools/jdk21/` 或 JAVA_HOME 找 JDK，可用 `-JavaHome` 指定。首次构建在 `.signing/` 生成正式 RSA 3072 位签名材料，后续复用；发布标签已存在且签名材料缺失时拒绝重新生成。此目录被 Git 忽略。

**请把整个 `.signing/` 目录离线备份到安全位置**，其中包含 `inspiration-release.jks` 和 `credentials.json`。丢失后无法用相同签名发布覆盖更新。不要提交、公开或上传这些文件。仅保存 APK 中的公开证书不等于备份私钥。

产物：`release/inspiration-list-0.2.0-alpha.1.apk` 和 `release/SHA256SUMS.txt`。发布前使用 SDK 的 apksigner 验证签名。升级须递增 `android/app/build.gradle` 中 versionCode，更新版本号、脚本产物名称和 Release notes，保留原签名材料。

## 验证

```powershell
# 连接专用测试设备后
cd android
.\gradlew.bat :app:connectedDebugAndroidTest --no-daemon --max-workers=2
```

三项 Android instrumentation 测试覆盖真实 Keystore、WebView 用户流程和受控 HTTPS 上游。`androidTest/assets/upstream-test.p12` 仅为公开的测试证书夹具，固定口令 `test-fixture-only`，不会进入 Release APK；信任覆盖仅存在测试进程，正式应用仍使用系统 TLS 校验。

`scripts/check-release.py` 为本机专用模拟器烟测脚本：设备序号 emulator-5556、ADB 位置 D:/AndroidDev，UI 英文系统的 SAVE 按钮；对其他设备先调整路径和设备号。它会切换该测试模拟器的网络、安装包及创建测试记录，不应用于私人真机。

## 发布

先完成测试并 commit，推送仓库后执行 `node scripts/publish-release.mjs`。脚本从 Git Credential Manager 在内存读取 GitHub 凭据，不输出或写出凭据；创建 draft、上传 APK 和 SHA256SUMS，核对上传大小及摘要后转为 prerelease。不覆盖已发布版本。当前版本固定 v0.2.0-alpha.1，后续发布需要同步调整版本。
