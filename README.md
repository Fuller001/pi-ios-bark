# pi-ios-bark

一个用于 [Pi](https://pi.dev/) 的 Bark 推送扩展。

本项目基于 [`@herbertgao/pi-bark`](https://github.com/HerbertGao/pi-extensions/tree/master/packages/pi-bark) 修改。与原版不同，**Pi 启动后不会自动开启 Bark 推送**；必须在当前会话中手动输入 `/bark` 才会开启。

## 功能

- 输入 `/bark` 后才读取配置并开启 Bark 推送。
- 开启后，Pi 底部状态栏会显示 `Bark 已开启`。
- Pi 完成工作或等待用户回答问卷时发送 Bark 通知。
- 新建会话或执行 `/reload` 后会自动回到关闭状态，需要重新输入 `/bark`。
- 配置缺失、无效或设置 `"enabled": false` 时，会显示警告且不会推送。

## 安装

```bash
pi install https://github.com/Fuller001/pi-ios-bark
```

然后在 Pi 中执行：

```text
/reload
```

> 如果之前安装过原版 `npm:@herbertgao/pi-bark`，请先移除，避免两个版本同时加载：
>
> ```bash
> pi remove npm:@herbertgao/pi-bark
> ```

## 配置 Bark

创建或编辑：

```text
~/.pi/agent/bark.json
```

示例：

```json
{
  "endpoint": "https://api.day.app/your-device-key",
  "machine": "Arch Linux",
  "locale": "zh-CN",
  "events": {
    "agentSettled": true,
    "askUserQuestion": true
  },
  "params": {
    "group": "pi",
    "icon": "https://raw.githubusercontent.com/HerbertGao/pi-extensions/master/packages/pi-bark/assets/pi-icon.png"
  },
  "timeoutMs": 4000
}
```

字段说明：

- `endpoint`：必填，Bark 设备接口地址。请把 `your-device-key` 替换成自己的 Bark Key。
- `machine`：推送正文中显示的设备名称；省略时使用系统主机名。
- `locale`：支持 `auto`、`zh-CN`、`zh-TW`、`en`。
- `events.agentSettled`：Pi 完全完成当前任务后推送。
- `events.askUserQuestion`：Pi 等待用户回答问题时推送。
- `params`：附加 Bark POST 参数，例如 `group`、`sound`、`icon`、`level`。
- `timeoutMs`：请求超时时间，默认 `4000` 毫秒。
- `enabled`：设置为 `false` 可临时禁用推送。

请妥善保管 `bark.json`，因为 `endpoint` 通常包含 Bark 设备 Key。

## 使用方法

1. 确认 `~/.pi/agent/bark.json` 已配置完成。
2. 启动 Pi，或执行 `/reload`。
3. 在当前会话输入：

   ```text
   /bark
   ```

4. 看到底部状态栏显示 `Bark 已开启` 后，推送功能才会生效。
5. 当 Pi 完成任务或等待用户输入时，对应事件会推送到 iOS Bark。

注意：

- `/reload`、新建会话或切换会话后，需要重新输入 `/bark`。
- 如果没有输入 `/bark`，即使 `bark.json` 已配置，也不会发送推送。
- 如果 `/bark` 后提示配置无效，请检查 `bark.json` 是否存在、JSON 格式是否正确、`endpoint` 是否使用 `http://` 或 `https://`，以及是否设置了 `"enabled": false`。

## 本地开发

```bash
git clone https://github.com/Fuller001/pi-ios-bark.git
cd pi-ios-bark
npm install
npm run typecheck
```

临时测试扩展：

```bash
pi -e ./src/index.ts
```

## 许可证

MIT。原项目版权见 [LICENSE](LICENSE)。
