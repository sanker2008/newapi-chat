# 切后台请求修复（2026-10-21）

原因：AppState 收到 background 时，AppProvider 主动 abort 当前请求，导致同步生图等待被取消。修复后 inactive/background 仅保存快照，保留同一个请求和结果回调；手动停止仍会取消本地等待，不自动重发收费请求。

## API 依据

- https://docs.newapi.pro/zh/docs/api/ai-model/images/openai/post-v1-images-generations
- https://docs.newapi.pro/zh/docs/api/ai-model/images/openai/post-v1-images-edits

当前使用的 OpenAI 兼容 Images 接口返回 created / data（b64_json 或 url）；所查接口没有返回可用于断线恢复的 task_id。不能将其他异步绘图接口的查询机制套用在这些同步请求上。

## 验证与边界

- 修复前，真实 AppProvider 的生命周期模拟测试中，两项后台继续生成测试失败；修复后通过。
- 新增测试覆盖后台接收图片、返回前台接收图片、手动停止，核对结果持久化且不重发。
- npm run typecheck、npm test：通过，共 28 项测试。
- 此次为代码及 mock 回归验证，未发起真实收费生成，未进行新版 APK 真机后台验收。
- 系统冻结/杀进程、强制退出、网络断开仍可能丢失同步响应。本次未实现 Android 前台服务或服务端任务代理，不宣称具备杀进程后的任务恢复能力。
