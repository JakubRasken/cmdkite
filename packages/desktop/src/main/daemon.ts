import { spawn } from "node:child_process"
import { createServer as createNetServer } from "node:net"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { app } from "electron"

const root = dirname(fileURLToPath(import.meta.url))

type Logger = {
  log(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

function portAvailable(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createNetServer()
    const finish = (available: boolean) => {
      probe.removeAllListeners()
      resolve(available)
    }
    probe.once("error", () => finish(false))
    probe.listen(port, host, () => {
      probe.close(() => finish(true))
    })
  })
}

async function findAvailablePort(host: string, preferred: number): Promise<number> {
  if (await portAvailable(host, preferred)) return preferred

  return new Promise((resolve, reject) => {
    const probe = createNetServer()
    probe.once("error", reject)
    probe.listen(0, host, () => {
      const address = probe.address()
      const port = typeof address === "object" && address ? address.port : 0
      probe.close((error) => (error ? reject(error) : resolve(port)))
    })
  })
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
  const daemonDir = dev ? join(root, "../../../daemon") : join(process.resourcesPath, "daemon")
  const configuredPort = Number(process.env.CMDKITE_PORT ?? 41414)
  const host = process.env.CMDKITE_HOST ?? "127.0.0.1"
  const port = await findAvailablePort(
    host,
    Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 41414,
  )
  const url = `http://${host}:${port}`

  if (port !== configuredPort) logger.log("cmdkite daemon port occupied; using a free port", { configuredPort, port })

  const args = dev ? ["run", "src/index.ts"] : ["src/index.ts"]
  const child = spawn(dev ? "bun" : process.execPath, args, {
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
  child.on("exit", (code, signal) => logger.log("cmdkite daemon exited", { code, signal }))

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
            if (child.exitCode !== null || child.signalCode !== null) return
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
