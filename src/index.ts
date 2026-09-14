import type { ExtensionAPI } from "@earendil-works/pi-coding-agent"
import { readFileSync } from "node:fs"
import { homedir, hostname } from "node:os"
import { join } from "node:path"

const ASK_USER_PROMPT_EVENT = "rpiv:ask-user:prompt"
const DEFAULT_TIMEOUT_MS = 4_000

export type BarkLocale = "en" | "zh-CN" | "zh-TW"
type NotificationEvent = "agentSettled" | "askUserQuestion"

const COPY: Record<BarkLocale, Record<NotificationEvent, string>> = {
  en: {
    agentSettled: "✅ Pi finished",
    askUserQuestion: "🟡 Pi needs your input",
  },
  "zh-CN": {
    agentSettled: "✅ Pi 跑完了",
    askUserQuestion: "🟡 Pi 等你回答",
  },
  "zh-TW": {
    agentSettled: "✅ Pi 已完成",
    askUserQuestion: "🟡 Pi 等你回覆",
  },
}

export interface BarkConfig {
  endpoint: string
  machine: string
  locale: BarkLocale
  events: {
    agentSettled: boolean
    askUserQuestion: boolean
  }
  params: Record<string, string | number | boolean>
  timeoutMs: number
}

export function getConfigPath(): string {
  return join(
    process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent"),
    "bark.json",
  )
}

export function resolveLocale(input: unknown): BarkLocale {
  const requested =
    typeof input === "string" && input.toLowerCase() !== "auto"
      ? input
      : Intl.DateTimeFormat().resolvedOptions().locale
  const locale = requested.toLowerCase()
  if (locale.includes("hant") || /^zh-(tw|hk|mo)/.test(locale)) return "zh-TW"
  if (locale.startsWith("zh")) return "zh-CN"
  return "en"
}

export function notificationTitle(
  locale: BarkLocale,
  event: NotificationEvent,
): string {
  return COPY[locale][event]
}

export function normalizeConfig(input: unknown): BarkConfig | undefined {
  if (!input || typeof input !== "object") return undefined
  const source = input as Record<string, unknown>
  if (source.enabled === false || typeof source.endpoint !== "string")
    return undefined

  try {
    const protocol = new URL(source.endpoint).protocol
    if (protocol !== "http:" && protocol !== "https:") return undefined
  } catch {
    return undefined
  }

  const eventSource =
    source.events && typeof source.events === "object"
      ? (source.events as Record<string, unknown>)
      : {}
  const params =
    source.params && typeof source.params === "object"
      ? Object.fromEntries(
          Object.entries(source.params).filter((entry) =>
            ["string", "number", "boolean"].includes(typeof entry[1]),
          ),
        )
      : {}
  const timeoutMs =
    typeof source.timeoutMs === "number" &&
    Number.isFinite(source.timeoutMs) &&
    source.timeoutMs > 0
      ? source.timeoutMs
      : DEFAULT_TIMEOUT_MS

  return {
    endpoint: source.endpoint,
    machine:
      typeof source.machine === "string" && source.machine.trim()
        ? source.machine.trim()
        : hostname(),
    locale: resolveLocale(source.locale),
    events: {
      agentSettled: eventSource.agentSettled !== false,
      askUserQuestion: eventSource.askUserQuestion !== false,
    },
    params,
    timeoutMs,
  }
}

export function loadConfig(path = getConfigPath()): BarkConfig | undefined {
  try {
    return normalizeConfig(JSON.parse(readFileSync(path, "utf8")))
  } catch {
    return undefined
  }
}

export function formatBody(config: BarkConfig, cwd: string): string {
  return `💻 ${config.machine}\n📁 ${cwd}`
}

export async function sendBark(
  config: BarkConfig,
  title: string,
  body: string,
  fetcher: typeof fetch = fetch,
): Promise<void> {
  const form = new URLSearchParams()
  for (const [key, value] of Object.entries(config.params))
    form.set(key, String(value))
  form.set("title", title)
  form.set("body", body)

  const response = await fetcher(config.endpoint, {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(config.timeoutMs),
  })
  if (!response.ok) throw new Error(`Bark returned HTTP ${response.status}`)
}

const ACTIVATION_COPY: Record<
  BarkLocale,
  { status: string; enabled: string; unavailable: string }
> = {
  en: {
    status: "Bark enabled",
    enabled: "Bark notifications enabled",
    unavailable: "Bark was not enabled: bark.json is missing, invalid, or disabled",
  },
  "zh-CN": {
    status: "Bark 已开启",
    enabled: "Bark 推送已开启",
    unavailable: "Bark 未开启：bark.json 缺失、无效或已禁用",
  },
  "zh-TW": {
    status: "Bark 已開啟",
    enabled: "Bark 推送已開啟",
    unavailable: "Bark 未開啟：bark.json 遺失、無效或已停用",
  },
}

export default function piBark(pi: ExtensionAPI): void {
  let config: BarkConfig | undefined
  let cwd = process.cwd()
  let userFacingSession = false

  const notify = async (title: string): Promise<void> => {
    if (!config || !userFacingSession) return
    try {
      await sendBark(config, title, formatBody(config, cwd))
    } catch {
      // Notifications are best-effort and must never interrupt Pi.
    }
  }

  const unsubscribeAskUser = pi.events.on(ASK_USER_PROMPT_EVENT, () => {
    if (config?.events.askUserQuestion)
      void notify(notificationTitle(config.locale, "askUserQuestion"))
  })

  pi.registerCommand("bark", {
    description: "Enable Bark notifications",
    handler: async (_args, ctx) => {
      const nextConfig = loadConfig()
      cwd = ctx.cwd
      userFacingSession = ctx.hasUI

      if (!nextConfig) {
        config = undefined
        if (ctx.hasUI) {
          const copy = ACTIVATION_COPY[resolveLocale(undefined)]
          ctx.ui.setStatus("bark", undefined)
          ctx.ui.notify(copy.unavailable, "warning")
        }
        return
      }

      config = nextConfig
      if (ctx.hasUI) {
        const copy = ACTIVATION_COPY[config.locale]
        ctx.ui.setStatus("bark", copy.status)
        ctx.ui.notify(copy.enabled, "info")
      }
    },
  })

  pi.on("session_start", (_event, ctx) => {
    config = undefined
    cwd = ctx.cwd
    userFacingSession = ctx.hasUI
    if (ctx.hasUI) ctx.ui.setStatus("bark", undefined)
  })

  pi.on("agent_settled", (_event, ctx) => {
    cwd = ctx.cwd
    if (config?.events.agentSettled)
      void notify(notificationTitle(config.locale, "agentSettled"))
  })

  pi.on("session_shutdown", (_event, ctx) => {
    unsubscribeAskUser()
    if (ctx.hasUI) ctx.ui.setStatus("bark", undefined)
  })
}
