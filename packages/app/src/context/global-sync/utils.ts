import type {
  AgentListOutput,
  ModelDefaultOutput,
  ModelListOutput,
  ProviderListOutput,
} from "@opencode-ai/client/promise"
import type { Agent, Project, Provider, ProviderListResponse } from "@/types"
import type { Project as CurrentProject } from "@opencode-ai/client/promise"
import { NormalizedProviderListResponse } from "@opencode-ai/session-ui/context"
export { pathKey as directoryKey, type PathKey as DirectoryKey } from "@/utils/path-key"

export const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function normalizeAgentList(input: AgentListOutput["data"] | Agent[]): Agent[] {
  if (!Array.isArray(input)) return []
  if (input.every((agent) => !("request" in agent))) return input as Agent[]
  return (input as AgentListOutput["data"]).map((agent) => {
    const settings = agent.request?.settings ?? {}
    const permissions = Array.isArray(agent.permissions) ? agent.permissions : []
    return {
      name: agent.id,
      description: agent.description,
      mode: agent.mode,
      hidden: agent.hidden,
      temperature: typeof settings.temperature === "number" ? settings.temperature : undefined,
      topP: typeof settings.topP === "number" ? settings.topP : undefined,
      color: agent.color,
      permission: permissions.map((rule) => ({
        permission: rule.action,
        pattern: rule.resource,
        action: rule.effect,
      })),
      model: agent.model && { providerID: agent.model.providerID, modelID: agent.model.id },
      variant: agent.model?.variant,
      prompt: agent.system,
      options: settings,
      steps: agent.steps,
    }
  })
}

export function normalizeProviderList(
  providers: ProviderListOutput["data"] | ProviderListResponse,
  models?: ModelListOutput["data"],
  defaultModel?: ModelDefaultOutput["data"],
): NormalizedProviderListResponse {
  if (!Array.isArray(providers)) {
    if (providers && typeof providers === "object" && providers.all instanceof Map) return providers
    return { all: new Map(), connected: [], default: {} }
  }
  const all = new Map<string, Provider>()

  for (const provider of providers) {
    all.set(provider.id, {
      id: provider.id,
      name: provider.name,
      source: "custom",
      env: [],
      options: provider.settings ?? {},
      models: {},
    })
  }

  const modelList = Array.isArray(models) ? models : []
  for (const model of modelList) {
    const provider = all.get(model.providerID)
    if (!provider || model.status === "deprecated") continue
    const cost = model.cost?.find((item) => item.tier === undefined) ?? model.cost?.[0]
    provider.models[model.id] = {
      id: model.id,
      providerID: model.providerID,
      api: {
        id: model.modelID,
        url: "",
        npm: model.package ?? provider.id,
      },
      name: model.name,
      family: model.family,
      capabilities: {
        temperature: false,
        reasoning: false,
        attachment: model.capabilities?.input?.some((item) => item !== "text") ?? false,
        toolcall: model.capabilities?.tools ?? false,
        input: {
          text: model.capabilities?.input?.includes("text") ?? false,
          audio: model.capabilities?.input?.includes("audio") ?? false,
          image: model.capabilities?.input?.includes("image") ?? false,
          video: model.capabilities?.input?.includes("video") ?? false,
          pdf: model.capabilities?.input?.includes("pdf") ?? false,
        },
        output: {
          text: model.capabilities?.output?.includes("text") ?? false,
          audio: model.capabilities?.output?.includes("audio") ?? false,
          image: model.capabilities?.output?.includes("image") ?? false,
          video: model.capabilities?.output?.includes("video") ?? false,
          pdf: model.capabilities?.output?.includes("pdf") ?? false,
        },
        interleaved: false,
      },
      cost: {
        input: cost?.input ?? 0,
        output: cost?.output ?? 0,
        cache: {
          read: cost?.cache?.read ?? 0,
          write: cost?.cache?.write ?? 0,
        },
      },
      limit: model.limit,
      status: model.status,
      options: model.settings ?? {},
      headers: model.headers ?? {},
      release_date: model.time?.released ? new Date(model.time.released).toISOString().slice(0, 10) : "",
      variants: Object.fromEntries((model.variants ?? []).map((variant) => [variant.id, variant.settings ?? {}])),
    }
  }

  return {
    all,
    connected: providers.map((provider) => provider.id),
    default: Object.fromEntries(
      providers.flatMap((provider) => {
        const model =
          defaultModel?.providerID === provider.id
            ? defaultModel
            : modelList?.find((item) => item.providerID === provider.id && item.status !== "deprecated")
        return model ? [[provider.id, model.id]] : []
      }),
    ),
  }
}

export function normalizeProjectInfo(project: Project | CurrentProject): Project {
  const worktree = "canonical" in project ? project.canonical : project.worktree
  return {
    ...project,
    worktree,
    worktrees: "worktrees" in project ? project.worktrees : [{ directory: worktree }],
    vcs: project.vcs === "git" ? "git" : undefined,
  }
}
