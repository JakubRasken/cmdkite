import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
import { randomUUID } from "node:crypto"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { app } from "electron"

const root = dirname(fileURLToPath(import.meta.url))

type Logger = {
  log(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

export type DaemonHandle = {
  url: string
  username: string
  password: string
  stop: () => Promise<void>
}

/**
 * Spawn the cmdkite harness daemon (packages/daemon) as the app's sidecar.
 * The daemon exposes the HTTP/SSE API the renderer's OpenCode client talks to.
 */
export async function startCmkDaemon(logger: Logger): Promise<DaemonHandle> {
  const dev = !app.isPackaged
  const daemonDir = dev
    ? join(root, "../../../daemon")
    : join(process.resourcesPath, "daemon")
  const port = Number(process.env.CMDKITE_PORT ?? 41414)
  const host = process.env.CMDKITE_HOST ?? "127.0.0.1"
  const url = `http://${host}:${port}`

  const args = dev ? ["run", "src/index.ts"] : ["src/index.ts"]
  const child: ChildProcessWithoutNullStreams = spawn(dev ? "bun" : process.execPath, args, {
    cwd: daemonDir,
    env: { ...process.env, CMDKITE_PORT: String(port), CMDKITE_HOST: host, NO_COLOR: "1" },
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  })

  child.stdout.setEncoding("utf8")
  child.stdout.on("data", (chunk: string) => logger.log("cmdkite daemon", { stream: "stdout", text: chunk }))
  child.stderr.setEncoding("utf8")
  child.stderr.on("data", (chunk: string) => logger.log("cmdkite daemon", { stream: "stderr", text: chunk }))
  child.on("error", (err) => logger.error("cmdkite daemon spawn failed", { error: err.message }))
  child.on("exit", (code, signal) =>
    logger.log("cmdkite daemon exited", { code, signal }),
  )

  // Wait for the daemon's health endpoint before considering it ready.
  const deadline = Date.now() + 15_000
  while (Date.now() < deadline) {
    try {
      const res = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(1000) })
      if (res.ok) {
        logger.log("cmdkite daemon ready", { url })
        return {
          url,
          username: "cmdkite",
          password: "",
          stop: async () => {
            child.kill()
            await new Promise<void>((resolve) => {
              if (child.exitCode !== null || child.signalCode !== null) return resolve()
              child.once("exit", () => resolve())
              setTimeout(resolve, 2000)
            })
          },
        }
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }

  child.kill()
  throw new Error(`cmdkite daemon did not become ready at ${url}`)
}
