# Rime Voice

ChromeOS Manifest V3 输入法：本地 Rime WASM 拼音 + 可配置的在线语音识别。

## 构建与安装

```sh
# Ubuntu/Debian 首次构建需要：sudo apt install librime-bin
npm ci
npm test
npm run build
```

首次运行 `npm test` 或 `npm run build` 会从 npm 包提取 Rime WASM，并从固定版本的白霜源码编译词典；需要 `rime_deployer` 和可访问 GitHub 的网络。生成的二进制词典与 `dist/` 不提交到 Git。

在 ChromeOS 打开 `chrome://extensions`，启用开发者模式，选择“加载已解压的扩展程序”，指向本项目 `dist/`。再到 ChromeOS“设置 → 键盘 → 输入法”启用“Rime Voice 拼音”。扩展中的“选项”页填写自己的 API Key、HTTPS 端点和模型，并点击“授权麦克风”。

语音服务可在设置页选择 MiMo 或 Gemini 3.5 Transcribe，两者的密钥分别保存。MiMo 默认端点为 `https://token-plan-cn.xiaomimimo.com/v1/chat/completions`，模型为 `mimo-v2.5-asr`；也可改成其他兼容 OpenAI Chat Completions 音频输入的服务。Gemini 使用 `gemini-3.5-transcribe` 的 HTTPS 文件转写，默认启用 SMART 模式来清理语气词、重复和口误；取消勾选则逐字转写。选用 Gemini 时，只要已配置 MiMo API Key，Gemini 请求失败或超时就会在当前录音会话内静默改用 MiMo，后续片段直接走 MiMo；如果两个服务都不可用，才会显示错误。原有的 Gemini Live 设置会自动识别为 Gemini，无需重新输入密钥。密钥仅保存在当前浏览器的 `chrome.storage.local`，不会写入构建产物。

输入拼音后可用空格、数字 1–9 选词；Backspace 删除拼音，Escape 取消，PageUp/PageDown 或 `-`/`=` 翻页。候选窗使用 ChromeOS 原生 UI。**单独按一下 Shift** 切换中英文。英文模式直接输出原始按键，不显示拼音候选窗。在中文拼音尚未选词时按 Shift，会先将已输入的字母原样上屏，再切换到英文。

语音有两种操作：**按住右 Alt 至少 400 毫秒**开始录音，松开结束；或按一次 **Alt+L** 开始，再按一次结束。短按右 Alt 和普通 Alt 组合键不会启动录音。已移除 Super+D。录音时原生候选窗会隐藏，光标处显示一行麦克风和随声音起伏的音量条；安静时音量条保持低位。**每次录音最多 9 分 55 秒**，到时会自动结束并开始识别。长录音由 Offscreen 页面按 75 秒分段转写。麦克风仅在输入法激活、有文本焦点且明确触发语音后开启；失焦或停用输入法会停止录音。录音与转写结束后隐藏页面关闭，空闲时没有音频轮询。

**按键范围：** `chrome.input.ime.onKeyEvent` 只接收该输入法处于活动状态时转交的按键，无法在未激活输入法时获得全局按键。ChromeOS 设备上的右 Alt 按键分发、麦克风权限提示及候选窗外观仍需实机验收。

MiMo-V2.5-ASR 当前公开的 `asr_options` 只有 `language`（自动、中文、英文），没有语气词清理开关；需要此功能可选 Gemini 的 SMART 模式。

## 验证 MiMo API

用真实语音制作 16 kHz、16 bit、单声道 PCM WAV 后运行：

```sh
MIMO_API_KEY=你的密钥 node scripts/test_mimo_api.js /path/to/sample-16k.wav
# 或使用随项目附带的公开测试语音：
MIMO_API_KEY=你的密钥 node scripts/test_mimo_api.js --sample
```

也可通过 `MIMO_ENDPOINT` 和 `MIMO_MODEL` 环境变量覆盖测试端点和模型。脚本验证 WAV 头、HTTP 返回 JSON 结构及非空识别文本。`--sample` 使用 [asr-server 测试语音](https://github.com/donstang/asr-server/blob/daafb0bb6490c6775ac263871d52bab9d8ef4ea6/test/data/english_test.wav)（许可见 `scripts/fixtures/LICENSE.txt`），并校验结果包含英文数字。自动单元测试不会调用付费 API。

## 验证 Gemini

```sh
GEMINI_API_KEY=你的密钥 node scripts/test_gemini_file.js
```

此脚本通过 HTTPS 将随项目附带的语音送入 `gemini-3.5-transcribe`，并验证 SMART 转写结果。模型的[转写文档](https://ai.google.dev/gemini-api/docs/transcribe)说明 SMART 行为；[官方价格表](https://ai.google.dev/gemini-api/docs/pricing)列有免费层级，实际可用配额以你的 Google AI Studio 项目为准。

## 架构与数据来源

- `src/background/`：ChromeOS IME 事件、候选窗、录音状态和 ASR 请求。
- `src/offscreen/`：AudioWorklet 麦克风采集、重采样和 PCM WAV 打包。
- `src/rime/`：Rime WASM 引擎封装。
- `src/options/`：服务商配置与麦克风授权。
- `vendor/rime/`：构建时生成的 WASM 与白霜词典；本地 `dist/` 随包离线加载。

Rime WASM 基于 [jsh_rime 2.0.2](https://www.npmjs.com/package/jsh_rime)（Apache-2.0）与 [librime](https://github.com/rime/librime)（BSD-3-Clause）；为了向 IME 暴露翻页方法，在 `src/rime/vendor/jsh_rime.mjs` 增加了 `flipPage`。白霜词典基于 [gaboolic/rime-frost](https://github.com/gaboolic/rime-frost) 的 `3ad2cb34e3c5763ba3f8da0a617fcaa221b355aa` 提取常用字、基础词、扩展词与杂项词，通过本机 `rime_deployer --compile` 编译，遵循 GPL-3.0。可运行 `scripts/prepare_dictionary.sh` 重新生成二进制词典。对应许可证在 `vendor/`，构建时也复制到 `dist/`。目前没有集成白霜完整的 Lua 辅助功能、细胞词库或语法模型；拼音全拼、简拼、词频排序和 Rime 用户词典由核心支持。

项目自有代码 Copyright (c) 2026 ThraceShah，采用 [GPL-3.0-only 许可](LICENSE)；引入的 JavaScript 引擎、WASM、词库和测试音频仍遵循各自许可，详见 [第三方许可说明](THIRD_PARTY_NOTICES.md)。`dist/` 和编译词典不在公开源码仓库中。API Key 只通过扩展选项页或测试脚本的环境变量提供，源码与构建脚本没有内置密钥。

Chrome 的 [IME API 文档](https://developer.chrome.com/docs/extensions/reference/api/input/ime) 要求 manifest 声明 `input` 权限；[Offscreen API](https://developer.chrome.com/docs/extensions/reference/api/offscreen) 的 `USER_MEDIA` 原因用于麦克风页面。MiMo 音频格式见[官方语音识别 API 文档](https://mimo.mi.com/docs/zh-CN/api/audio/Speech-Recognition)。
