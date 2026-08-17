/** Static Command Code model catalog (mirrors `cmdc --list-models` output). */

export type CmdModel = {
  id: string
  modelID: string
  providerID: string
  name: string
  family?: string
  capabilities: { input: string[]; output: string[]; tools: boolean }
  time: { released: number }
  cost: Array<{ tier?: string; input: number; output: number; cache: { read: number; write: number } }>
  limit: { context: number; input?: number; output: number }
  status: "alpha" | "beta" | "deprecated" | "active"
  variants: Array<{ id: string; settings?: Record<string, unknown> }>
  settings?: Record<string, unknown>
}

const cap = (tools = true, input: string[] = ["text"], output: string[] = ["text"]): CmdModel["capabilities"] => ({
  input,
  output,
  tools,
})

const cost = (input = 0, output = 0): CmdModel["cost"] => [
  { input, output, cache: { read: input * 0.1, write: input * 1.25 } },
]

const m = (
  id: string,
  name: string,
  context: number,
  opts: { family?: string; tools?: boolean; released?: number; status?: CmdModel["status"] } = {},
): CmdModel => ({
  id,
  modelID: id,
  providerID: "commandcode",
  name,
  family: opts.family,
  capabilities: cap(opts.tools ?? true),
  time: { released: opts.released ?? Date.UTC(2025, 0, 1) },
  cost: cost(),
  limit: { context, output: 128_000 },
  status: opts.status ?? "active",
  variants: [],
})

/** The full catalog from `cmdc --list-models` (55 models, grouped by provider family). */
export const MODELS: CmdModel[] = [
  // Open Source
  m("deepseek/deepseek-v4-pro", "DeepSeek V4 Pro", 128_000, { family: "DeepSeek" }),
  m("deepseek/deepseek-v4-flash", "DeepSeek V4 Flash", 128_000, { family: "DeepSeek" }),
  m("moonshotai/kimi-k3", "Kimi K3", 1_000_000, { family: "Moonshot AI" }),
  m("moonshotai/kimi-k2.7-code", "Kimi K2.7 Code", 1_000_000, { family: "Moonshot AI" }),
  m("moonshotai/kimi-k2.7-code-highspeed", "Kimi K2.7 Code Highspeed", 1_000_000, { family: "Moonshot AI" }),
  m("moonshotai/kimi-k2.6", "Kimi K2.6", 1_000_000, { family: "Moonshot AI" }),
  m("moonshotai/kimi-k2.5", "Kimi K2.5", 1_000_000, { family: "Moonshot AI" }),
  m("zai-org/glm-5.3", "GLM 5.3", 1_000_000, { family: "Z.ai" }),
  m("zai-org/glm-5.2", "GLM 5.2", 1_000_000, { family: "Z.ai" }),
  m("zai-org/glm-5.2-fast", "GLM 5.2 Fast", 1_000_000, { family: "Z.ai" }),
  m("zai-org/glm-5.1", "GLM 5.1", 1_000_000, { family: "Z.ai" }),
  m("zai-org/glm-5", "GLM 5", 1_000_000, { family: "Z.ai" }),
  m("minimaxai/minimax-m3", "MiniMax M3", 128_000, { family: "MiniMax" }),
  m("minimaxai/minimax-m2.7", "MiniMax M2.7", 128_000, { family: "MiniMax" }),
  m("minimaxai/minimax-m2.5", "MiniMax M2.5", 128_000, { family: "MiniMax" }),
  m("xiaomi/mimo-v2.5-pro", "MiMo V2.5 Pro", 128_000, { family: "Xiaomi" }),
  m("xiaomi/mimo-v2.5", "MiMo V2.5", 128_000, { family: "Xiaomi" }),
  m("qwen/qwen3.8-max", "Qwen3.8 Max", 128_000, { family: "Qwen" }),
  m("qwen/qwen3.7-max", "Qwen3.7 Max", 128_000, { family: "Qwen" }),
  m("qwen/qwen3.7-plus", "Qwen3.7 Plus", 128_000, { family: "Qwen" }),
  m("qwen/qwen3.7-flash", "Qwen3.7 Flash", 128_000, { family: "Qwen" }),
  m("qwen/qwen3.6-max-preview", "Qwen3.6 Max Preview", 128_000, { family: "Qwen", status: "beta" }),
  m("qwen/qwen3.6-plus", "Qwen3.6 Plus", 128_000, { family: "Qwen" }),
  m("stepfun/step-3.7-flash", "Step 3.7 Flash", 128_000, { family: "StepFun" }),
  m("stepfun/step-3.5-flash", "Step 3.5 Flash", 128_000, { family: "StepFun" }),
  m("tencent/hy3-paid", "Hunyuan 3 Paid", 128_000, { family: "Tencent" }),
  m("nvidia/nemotron-3-ultra-550b-a55b", "Nemotron 3 Ultra 550B", 128_000, { family: "NVIDIA" }),
  m("thinkingmachines/inkling", "Inkling", 128_000, { family: "Thinking Machines" }),
  m("thinkingmachines/inkling-small", "Inkling Small", 128_000, { family: "Thinking Machines" }),
  m("poolside/laguna-s-2.1-free", "Laguna S 2.1 Free", 128_000, { family: "Poolside" }),
  // Anthropic
  m("claude-sonnet-5", "Claude Sonnet 5", 200_000, { family: "Anthropic" }),
  m("claude-sonnet-4-6", "Claude Sonnet 4.6", 200_000, { family: "Anthropic" }),
  m("claude-fable-5", "Claude Fable 5", 200_000, { family: "Anthropic" }),
  m("claude-opus-5", "Claude Opus 5", 200_000, { family: "Anthropic" }),
  m("claude-opus-4-8", "Claude Opus 4.8", 200_000, { family: "Anthropic" }),
  m("claude-opus-4-7", "Claude Opus 4.7", 200_000, { family: "Anthropic" }),
  m("claude-haiku-4-5", "Claude Haiku 4.5", 200_000, { family: "Anthropic" }),
  // OpenAI
  m("gpt-5.6-sol", "GPT 5.6 Sol", 200_000, { family: "OpenAI" }),
  m("gpt-5.6-terra", "GPT 5.6 Terra", 200_000, { family: "OpenAI" }),
  m("gpt-5.6-luna", "GPT 5.6 Luna", 200_000, { family: "OpenAI" }),
  m("gpt-5.5", "GPT 5.5", 200_000, { family: "OpenAI" }),
  m("gpt-5.4", "GPT 5.4", 200_000, { family: "OpenAI" }),
  m("gpt-5.3-codex", "GPT 5.3 Codex", 200_000, { family: "OpenAI" }),
  m("gpt-5.4-mini", "GPT 5.4 Mini", 200_000, { family: "OpenAI" }),
  // Google
  m("google/gemini-3.7-flash", "Gemini 3.7 Flash", 1_000_000, { family: "Google" }),
  m("google/gemini-3.6-flash", "Gemini 3.6 Flash", 1_000_000, { family: "Google" }),
  m("google/gemini-3.5-flash", "Gemini 3.5 Flash", 1_000_000, { family: "Google" }),
  m("google/gemini-3.5-flash-lite", "Gemini 3.5 Flash Lite", 1_000_000, { family: "Google" }),
  m("google/gemini-3.1-flash-lite", "Gemini 3.1 Flash Lite", 1_000_000, { family: "Google" }),
  // Sakana
  m("sakana/fugu-ultra", "Fugu Ultra", 128_000, { family: "Sakana" }),
  // Meta
  m("meta/muse-spark-1.1", "Muse Spark 1.1", 128_000, { family: "Meta" }),
  m("meta/muse-spark-1.2", "Muse Spark 1.2", 128_000, { family: "Meta" }),
  m("meta/muse-spark-1.2-contributor", "Muse Spark 1.2 Contributor", 128_000, { family: "Meta" }),
  // xAI
  m("xai/grok-4.5", "Grok 4.5", 200_000, { family: "xAI" }),
  m("xai/grok-4.6", "Grok 4.6", 200_000, { family: "xAI" }),
]

export const PROVIDER = {
  id: "commandcode",
  name: "Command Code",
  activation: "enabled",
  package: "@commandcode/provider",
  settings: {},
} as const

export const DEFAULT_MODEL = { providerID: "commandcode", modelID: "deepseek/deepseek-v4-flash" } as const
