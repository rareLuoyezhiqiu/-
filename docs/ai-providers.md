# 模型预设与官方来源

核对日期：2026-11-16。预设用于填写 API 设置，用户可修改模型 ID；不是实际账户调用成功的证明。不同账户、地域、协议和供应商版本仍需实际联调。不自动检测或切换模型，不自动付费调用。

| 厂商 | 本次预设 | 官方资料 |
| --- | --- | --- |
| DeepSeek | deepseek-flash（当前指向 V4.1 Flash） | [更新日志](https://api-docs.deepseek.com/updates/) |
| OpenAI | gpt-6.1-sol、gpt-6.1-terra、gpt-6-astra、gpt-6-luna | [GPT-6 / 6.1 接入](https://developers.openai.com/api/docs/guides/latest-model) |
| Anthropic | claude-sonnet-5-5、claude-opus-5-5、claude-haiku-5-5、claude-fable-5-2 | [模型概览](https://platform.claude.com/docs/en/models/overview) |
| Google | gemini-4-hydrogen、gemini-4-carbon、gemini-4-argon | [模型列表](https://aistudio.google.com/docs/models)、[OpenAI 兼容接口](https://aistudio.google.com/docs/openai) |
| 阿里云百炼 | qwen4-max、qwen3.7-plus、qwen3.8-flash | [模型列表](https://help.aliyun.com/zh/model-studio/models) |
| Kimi | kimi-k3.1-pro、kimi-k3.1-pro-highspeed、kimi-k3 | [快速开始](https://platform.kimi.com/docs/get-api-key) |
| 智谱 | glm-5.3、glm-5.3-flash | [GLM-5.3](https://docs.bigmodel.cn/cn/guide/models/text/glm-5.3) |
| MiniMax | MiniMax-M3.1-Flash、MiniMax-M3 | [模型概览](https://platform.minimax.cn/docs/guides/models-intro)、[兼容接口](https://platform.minimax.cn/docs/api-reference/text-openai-api) |

`shared/providers.ts` 是界面预设的唯一来源。实际支持 OpenAI Chat Completions 与 Anthropic Messages 协议；Google 使用其 OpenAI 兼容入口。自定义地址须为完整请求地址，域名需由部署者允许。

设置中提供数据政策入口，并允许用户替换为其实际签约服务/区域的政策。首次使用告知展示服务商、接口域名、模型与政策地址；配置变化使确认失效。应用不声明上游零留存或免于训练，应以实际账户适用政策为准。阿里云境内服务例如说明会依法存储调用数据，见[隐私说明](https://help.aliyun.com/zh/model-studio/privacy-notice)。

本次没有真实密钥，未验证任何厂商的实际输出质量或中国大陆网络连通性。用户输入自定义模型后如果上游拒绝，界面保留原文、旧拓写和草稿，允许调整设置后手动重试。
