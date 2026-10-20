# 烛

- 用户沟通使用中文。
- Android 优先的 Expo / React Native 应用，用户自行配置 New API 地址与 Key，无业务后端。
- 代码位于 src/；src/app 仅放路由。共享契约 src/core/types.ts 由集成人员维护。
- Key 仅使用 SecureStore，不能进入日志、SQLite、测试截图或仓库。浏览器预览不持久保存 Key。
- 不自动重试已提交的收费请求；停止不代表上游停止计费。
- 不根据模型名称推断联网、视觉、编辑或蒙版能力。真实 API 验证和 mock 验证必须分别报告。
- 使用已有 Android SDK 和模拟器，不安装大型测试工具；优先 Codex 内置浏览器检查网页预览。
- 检查：npm run typecheck、npm test、Android 构建和模拟器操作。主代理负责最终整合验证。
- 用户明确要求禁止本地 Android 构建，APK 只通过 GitHub Actions 打包；本地仅做轻量检查，不新增构建依赖或大型测试工具。
