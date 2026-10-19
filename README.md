# Ants Chat

Android 优先的个人 New API 对话与图片创作应用。React Native + Expo 58 + TypeScript；纯客户端，无业务后端。用户自行填写服务地址和 Key。

## 功能

- 流式对话、Markdown、会话搜索/重命名/删除、手动重试、停止和历史记录。
- Agent 工具：文档读取、公开静态网页读取、Responses 联网模型、图片生成和编辑。
- 图片参考、连续编辑版本、Skia 涂抹蒙版（画笔/橡皮/撤销/重做/双指缩放）、保存相册与分享。
- TXT/Markdown 和文本 PDF 本地导入；PDF 使用本地 Expo 模块封装 PDFBox Android。上限 20 MB / 100 页 / 100 万字符；不支持扫描件 OCR、加密 PDF 或 Office 文件。
- SQLite 保存记录，应用私有文件目录保存图片；Key 使用 SecureStore，并绑定服务地址。网页仅作为辅助预览，Key 仅保存在内存。

## GitHub Actions 打包（默认方式）

仓库 **Actions → Android APK → Run workflow**。推送 `main` 的代码修改也会触发。

流程在 GitHub 执行 `npm ci`、类型检查、测试、Expo prebuild、Android SDK 安装和 Gradle 编译，本地无需构建或安装 SDK。

成功后分别下载 `ants-chat-1.0.0-arm64-v8a-test-apk` 或 `ants-chat-1.0.0-armeabi-v7a-test-apk` artifact，包含：

- `ants-chat-1.0.0-arm64-v8a-test.apk` 或 `ants-chat-1.0.0-armeabi-v7a-test.apk`：独立架构测试包，包含 JS，安装后不依赖 Metro。
- `SHA256SUMS.txt`、`BUILD-INFO.txt`：校验值及对应提交。

**此流程使用模板的 Android 测试签名，不是正式上架签名。** 首版版本固定为 `1.0.0`。后续正式发布需配置独立发布密钥和上架流程；不要把 API Key 或真实签名文件提交到仓库。未配置自动发布 Release。

## 使用

1. 安装 APK，打开「设置」，填写 New API 地址及 Key。
2. 检测连接获取模型列表，分别选择对话、图片和联网模型。
3. 只有确认模型/渠道支持后才开启图片理解、图片编辑、局部重绘或联网。模型列表本身不提供这些能力保证。
4. 在对话中选择「智能助手」「对话」或「图像创作」。参考图和局部重绘属于图像编辑请求；旧图片不会被覆盖。

联网目前适配 `/v1/responses` 的 `web_search`，必须返回完成的真实搜索调用。任意普通聊天模型不能替代此能力。网页读取不执行 JS、不登录、不跟随重定向；只接受公开 HTTP(S) 地址。

任务最多 8 次模型请求（包含联网子请求）、20 次工具调用、2 次图片尝试。失败/超时不会自动重发收费请求。切后台停止本地执行；上游可能继续执行和计费。重启后保留部分结果并标记中断，不自动恢复收费任务。

## 轻量开发检查

```sh
npm ci
npm run typecheck
npm test
npm run web
```

测试需要 Node 24。原生 PDF、蒙版和相册行为需 Android 验收，不能用网页通过替代。

本地模拟验收：另一个终端运行 `node scripts/mock-newapi.cjs`；网页设置地址 `http://127.0.0.1:8787`、任意测试 Key、模型 `mock-chat` / `mock-image`。发送「测试绘图」「测试停止」「测试错误」分别验证工具串联、取消、429。模拟图片使用仓库模板图标夹具，**不是 AI 生成效果**，不产生模型费用。

## 当前验证边界

详见 [验收记录](docs/verification.md)。真实 New API 模型兼容性需配置用户自己的服务后验证；不在仓库内内置任何 Key。
