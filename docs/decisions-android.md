# Android MVP 方案决定

日期：2026-11-17。

用户确认将现有 Vue MVP 用 Capacitor 打包为 APK，发布至 GitHub Releases 的预发布版本。沿用本机 IndexedDB，不增加账号与同步。手机端直连用户自备 AI 接口，密钥经 Android Keystore 加密保存，无需维护统一 AI 后端。网页继续沿用原代理，避免改变已有网页数据与服务方式。

决定因素：用户希望下载即可记录、自行填写 API 并承担自己的模型调用，减少服务器维护。App 数据与浏览器数据隔离，不自动迁移；当前仍仅支持导出。签名密钥本机保管，后续版本覆盖安装。构建与验证详见 android-release.md。
