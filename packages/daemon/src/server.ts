import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { readdir, readFile, stat } from "node:fs/promises"
import { join } from "node:path"
import { CmdRunner, type RunOptions } from "./runner.ts"
import {
  serverConnectedEvent,
  toEvents,
  toSessionInfo,
  toSessionMessages,
  toSessionsResponse,
  toStartEvents,
} from "./compat.ts"
import { DEFAULT_MODEL, MODELS, PROVIDER } from "./models.ts"

const PORT = Number(process.env.CMDKITE_PORT ?? 41414)
const HOST = process.env.CMDKITE_HOST ?? "127.0.0.1"

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = ""
    req.on("data", (chunk) => {
      data += chunk
      if (data.length > 1_000_000) reject(new Error("Request body too large"))
    })
    req.on("end", () => resolve(data))
    req.on("error", reject)
  })
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8" })
  res.end(JSON.stringify(value))
}

export function createApp(runner: CmdRunner) {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
      const path = url.pathname
      res.on("finish", () => console.log(`[cmdkite] ${req.method} ${path} -> ${res.statusCode}`))

      // Resolve the location[directory] query param (the project root) with a cwd fallback.
      const locationDir = (): string => {
        const raw = url.searchParams.get("location[directory]") ?? url.searchParams.get("location")
        if (!raw) return process.cwd()
        try {
          const parsed = JSON.parse(raw) as { directory?: string }
          return parsed.directory ?? process.cwd()
        } catch {
          return raw
        }
      }
      const locationBody = () => {
        const directory = locationDir()
        return {
          directory,
          workspaceID: "local",
          project: { id: "local", directory, canonical: directory },
        }
      }

      if (req.method === "GET" && path === "/api/fs/list") {
        const root = locationDir()
        const rel = url.searchParams.get("path") ?? ""
        const target = join(root, rel)
        const entries = await readdir(target, { withFileTypes: true }).catch(() => [])
        const data = entries.map((entry) => ({ path: join(rel, entry.name), type: entry.isDirectory() ? "directory" : "file" as const }))
        sendJson(res, 200, { location: locationBody(), data })
        return
      }

      if (req.method === "GET" && path === "/api/fs/find") {
        const root = locationDir()
        const query = (url.searchParams.get("query") ?? "").toLowerCase()
        const limit = Number(url.searchParams.get("limit") ?? 50)
        const results: { path: string; type: "file" | "directory" }[] = []
        const walk = async (dir: string, depth: number): Promise<void> => {
          if (results.length >= limit || depth > 4) return
          const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
          for (const entry of entries) {
            if (entry.name === "node_modules" || entry.name === ".git") continue
            const full = join(dir, entry.name)
            const rel = full.slice(root.length).replace(/\\/g, "/").replace(/^\//, "")
            if (rel.toLowerCase().includes(query)) {
              results.push({ path: rel, type: entry.isDirectory() ? "directory" : "file" })
              if (results.length >= limit) return
            }
            if (entry.isDirectory()) await walk(full, depth + 1)
          }
        }
        await walk(root, 0).catch(() => undefined)
        sendJson(res, 200, { location: locationBody(), data: results })
        return
      }

      const fsReadMatch = path.match(/^\/api\/fs\/read\/(.+)$/)
      if (req.method === "GET" && fsReadMatch) {
        const root = locationDir()
        const target = join(root, decodeURIComponent(fsReadMatch[1]!))
        const info = await stat(target).catch(() => undefined)
        if (!info?.isFile()) {
          sendJson(res, 404, { error: "file not found" })
          return
        }
        const bytes = await readFile(target)
        res.writeHead(200, { "content-type": "application/octet-stream" })
        res.end(bytes)
        return
      }

      if (req.method === "GET" && path === "/api/location") {
        sendJson(res, 200, {
          directory: process.cwd(),
          workspaceID: "local",
          project: { id: "local", directory: process.cwd(), canonical: process.cwd() },
        })
        return
      }

      if (req.method === "GET" && path === "/api/project") {
        // The app manages projects itself (persisted per-server list). Returning an
        // empty list lets the UI show the user's own projects with their real names
        // instead of a synthetic "Default Project" from the daemon's cwd.
        sendJson(res, 200, [])
        return
      }

      if (req.method === "GET" && path === "/api/project/current") {
        const directory = process.cwd()
        sendJson(res, 200, {
          id: "local",
          canonical: directory,
          name: "Default Project",
          time: { created: Date.now(), updated: Date.now() },
          sandboxes: [],
        })
        return
      }

      if (req.method === "GET" && path === "/api/provider") {
        sendJson(res, 200, { data: [PROVIDER] })
        return
      }

      if (req.method === "GET" && path === "/api/model") {
        sendJson(res, 200, { data: MODELS })
        return
      }

      if (req.method === "GET" && path === "/api/model/default") {
        sendJson(res, 200, { data: DEFAULT_MODEL })
        return
      }

      if (req.method === "GET" && path === "/api/agent") {
        sendJson(res, 200, { data: [] })
        return
      }

      if (req.method === "GET" && path === "/api/command") {
        sendJson(res, 200, { data: [] })
        return
      }

      if (req.method === "GET" && path === "/api/reference") {
        sendJson(res, 200, { data: [] })
        return
      }

      if (req.method === "GET" && path === "/api/permission/request") {
        sendJson(res, 200, { data: [] })
        return
      }

      if (req.method === "GET" && path === "/api/integration") {
        sendJson(res, 200, { data: [] })
        return
      }

      if (req.method === "GET" && path === "/api/vcs") {
        sendJson(res, 200, { data: {} })
        return
      }

      if (req.method === "GET" && path === "/api/session/active") {
        const active: Record<string, { type: "running" }> = {}
        for (const session of runner.list()) {
          if (session.state === "running") active[session.id] = { type: "running" }
        }
        sendJson(res, 200, { data: active })
        return
      }

      if (req.method === "GET" && path === "/api/mcp") {
        sendJson(res, 200, { data: [] })
        return
      }

      if (req.method === "GET" && path === "/api/mcp/resource") {
        sendJson(res, 200, { data: [] })
        return
      }

      if (req.method === "GET" && path === "/api/experimental/migration/v1") {
        sendJson(res, 200, { status: "completed" })
        return
      }

      const worktreeMatch = path.match(/^\/api\/worktree\/([^/]+)$/)
      if (req.method === "GET" && worktreeMatch) {
        sendJson(res, 200, [{ directory: process.cwd() }])
        return
      }

      if (req.method === "GET" && path === "/api/config") {
        sendJson(res, 200, {
          data: {
            model: DEFAULT_MODEL.modelID,
            small_model: DEFAULT_MODEL.modelID,
            default_agent: "build",
            username: "cmdkite",
            permission: "auto-accept",
          },
        })
        return
      }

      if (req.method === "GET" && path === "/api/health") {
        sendJson(res, 200, { ok: true })
        return
      }

      if (req.method === "GET" && path === "/api/session") {
        sendJson(res, 200, toSessionsResponse(runner.list()))
        return
      }

      if (req.method === "POST" && path === "/api/session") {
        const body = JSON.parse(await readBody(req)) as {
          title?: string
          model?: { id?: string; providerID?: string }
          location?: { directory?: string }
        }
        const cwd = body.location?.directory ?? process.cwd()
        const model = body.model?.id
        const session = runner.create({ cwd, prompt: body.title ?? "", model })
        sendJson(res, 200, { data: toSessionInfo(session) })
        return
      }

      const sessionMatch = path.match(/^\/api\/session\/([^/]+)$/)
      if (req.method === "GET" && sessionMatch) {
        const id = decodeURIComponent(sessionMatch[1]!)
        const session = runner.get(id)
        if (!session) {
          sendJson(res, 404, { error: "session not found" })
          return
        }
        sendJson(res, 200, { data: toSessionInfo(session) })
        return
      }

      const messagesMatch = path.match(/^\/api\/session\/([^/]+)\/message$/)
      if (req.method === "GET" && messagesMatch) {
        const id = decodeURIComponent(messagesMatch[1]!)
        const session = runner.get(id)
        if (!session) {
          sendJson(res, 404, { error: "session not found" })
          return
        }
        sendJson(res, 200, { data: toSessionMessages(session), cursor: { previous: null, next: null } })
        return
      }

      const contextMatch = path.match(/^\/api\/session\/([^/]+)\/context$/)
      if (req.method === "GET" && contextMatch) {
        const id = decodeURIComponent(contextMatch[1]!)
        const session = runner.get(id)
        if (!session) {
          sendJson(res, 404, { error: "session not found" })
          return
        }
        sendJson(res, 200, { data: toSessionMessages(session) })
        return
      }

      const inboxMatch = path.match(/^\/api\/session\/([^/]+)\/inbox$/)
      if (req.method === "GET" && inboxMatch) {
        sendJson(res, 200, { data: [] })
        return
      }

      const promptMatch = path.match(/^\/api\/session\/([^/]+)\/prompt$/)
      if (req.method === "POST" && promptMatch) {
        const id = decodeURIComponent(promptMatch[1]!)
        const body = JSON.parse(await readBody(req)) as { text?: string; model?: { id?: string; providerID?: string }; resume?: boolean }
        const text = body.text ?? ""
        if (!text.trim()) {
          sendJson(res, 400, { error: "text is required" })
          return
        }
        const ok = runner.prompt(id, {
          prompt: text,
          model: body.model?.id,
          continue: body.resume ?? false,
        })
        if (!ok) {
          sendJson(res, 404, { error: "session not found" })
          return
        }
        const session = runner.get(id)!
        sendJson(res, 200, {
          data: {
            id: `user-${session.id}`,
            sessionID: session.id,
            timeCreated: Date.now(),
            type: "user",
            payload: { text },
            delivery: "steer",
          },
        })
        return
      }

      if (req.method === "GET" && path === "/api/event") {
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        })
        const send = (event: unknown) => res.write(`data: ${JSON.stringify(event)}\n\n`)
        send(serverConnectedEvent())
        // Emit start events (created + user inbox message) when a run begins,
        // and the text/step completion events when the run settles.
        const started = new Set<string>()
        const settled = new Set<string>()
        const unsubscribe = runner.onFrame((session, frame) => {
          if (session.state === "running") {
            if (started.has(session.id)) return
            started.add(session.id)
            for (const event of toStartEvents(session)) send(event)
            return
          }
          if (settled.has(session.id)) return
          settled.add(session.id)
          if (!started.has(session.id)) {
            started.add(session.id)
            for (const event of toStartEvents(session)) send(event)
          }
          for (const event of toEvents(session)) send(event)
        })
        // Replay already-settled sessions for late subscribers.
        for (const session of runner.list()) {
          if (session.state === "running" || session.state === "idle") continue
          if (settled.has(session.id)) continue
          settled.add(session.id)
          if (!started.has(session.id)) {
            started.add(session.id)
            for (const event of toStartEvents(session)) send(event)
          }
          for (const event of toEvents(session)) send(event)
        }
        // Keep the stream alive with periodic comments so proxies/browsers
        // don't idle-close it while no session events are flowing.
        const heartbeat = setInterval(() => res.write(": ping\n\n"), 15_000)
        req.on("close", () => {
          clearInterval(heartbeat)
          unsubscribe()
        })
        return
      }

      if (req.method === "GET" && path === "/api/status") {
        sendJson(res, 200, { ok: true, cli: runner.getCli(), sessions: runner.list().length })
        return
      }

      if (req.method === "GET" && path === "/api/sessions") {
        sendJson(res, 200, { sessions: runner.list() })
        return
      }

      if (req.method === "POST" && path === "/api/sessions") {
        const body = JSON.parse(await readBody(req)) as Partial<RunOptions>
        if (typeof body.prompt !== "string" || body.prompt.length === 0) {
          sendJson(res, 400, { error: "prompt is required" })
          return
        }
        const cwd = typeof body.cwd === "string" && body.cwd.length > 0 ? body.cwd : process.cwd()
        const session = runner.start({ ...body, cwd, prompt: body.prompt } as RunOptions)
        sendJson(res, 201, { session })
        return
      }

      const eventsMatch = path.match(/^\/api\/sessions\/([^/]+)\/events$/)
      if (req.method === "GET" && eventsMatch) {
        const id = decodeURIComponent(eventsMatch[1]!)
        const session = runner.get(id)
        if (!session) {
          sendJson(res, 404, { error: "session not found" })
          return
        }
        res.writeHead(200, {
          "content-type": "text/event-stream; charset=utf-8",
          "cache-control": "no-cache, no-transform",
          connection: "keep-alive",
        })
        res.write(`data: ${JSON.stringify({ session })}\n\n`)
        const unsubscribe = runner.onFrame((s, frame) => {
          if (s.id !== id) return
          res.write(`data: ${JSON.stringify({ session: s, frame })}\n\n`)
        })
        req.on("close", unsubscribe)
        return
      }

      sendJson(res, 404, { error: "not found" })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      sendJson(res, 500, { error: message })
    }
  })
  return server
}

export function startDaemon(): void {
  const runner = new CmdRunner()
  const server = createApp(runner)
  server.listen(PORT, HOST, () => {
    console.log(`[cmdkite] daemon listening on http://${HOST}:${PORT} (cli: ${runner.getCli()})`)
  })
  const shutdown = () => server.close(() => process.exit(0))
  process.on("SIGINT", shutdown)
  process.on("SIGTERM", shutdown)
}
