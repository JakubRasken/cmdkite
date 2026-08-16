import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { CmdRunner, type RunOptions } from "./runner.ts"

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
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`)
      const path = url.pathname

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
