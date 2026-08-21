import { spawn } from "node:child_process"
import { randomUUID } from "node:crypto"
import { resolveCli } from "./cli.ts"
import { createFrameParser, type Frame } from "./ndjson.ts"

export type RunOptions = {
  /** Workspace directory the CLI runs in. */
  cwd: string
  prompt: string
  /** Resume the most recent headless session in cwd. */
  continue?: boolean
  /** Resume a specific session by id. */
  resume?: string
  model?: string
  effort?: string
  theme?: string
  /** Extra `--config key=value` settings. */
  config?: Record<string, string>
  /** Enable writes/shell (auto-accept mode). Defaults to true for this app. */
  yolo?: boolean
  maxTurns?: number
  agent?: string
}

export type SessionState = "idle" | "running" | "done" | "error"

export interface Session {
  id: string
  state: SessionState
  cwd: string
  prompt: string
  createdAt: number
  sessionId?: string
  agent?: string
  stopReason?: string
  usage?: unknown
  finalText?: string
  error?: string
  model?: string
}

type Listener = (session: Session, frame: Frame) => void

const MAX_KEEP = 200

function errorMessage(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim()
  if (!value || typeof value !== "object") return
  const record = value as Record<string, unknown>
  const message = typeof record.message === "string" ? record.message.trim() : ""
  if (!message) return
  const name = typeof record.name === "string" ? record.name.trim() : ""
  return name && !message.startsWith(`${name}:`) ? `${name}: ${message}` : message
}

export class CmdRunner {
  private sessions = new Map<string, Session>()
  private listeners = new Set<Listener>()
  private cli: string

  constructor(cli: string = resolveCli()) {
    this.cli = cli
  }

  getCli(): string {
    return this.cli
  }

  list(): Session[] {
    return [...this.sessions.values()].sort((a, b) => b.createdAt - a.createdAt)
  }

  get(id: string): Session | undefined {
    return this.sessions.get(id)
  }

  /** Subscribe to frames for a session (no replay). Returns an unsubscribe fn. */
  onFrame(listener: Listener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Register an idle session (no CLI run yet). The app creates sessions before prompting. */
  create(opts: Pick<RunOptions, "cwd" | "prompt"> & { id?: string; model?: string; agent?: string }): Session {
    const id = opts.id ?? randomUUID()
    const existing = this.sessions.get(id)
    if (existing) {
      if (opts.agent) existing.agent = opts.agent
      if (opts.model) existing.model = opts.model
      if (opts.prompt) existing.prompt = opts.prompt
      return existing
    }
    const session: Session = {
      id,
      state: "idle",
      cwd: opts.cwd,
      prompt: opts.prompt,
      createdAt: Date.now(),
      agent: opts.agent,
      model: opts.model,
    }
    this.sessions.set(id, session)
    this.trimOld()
    return session
  }

  /** Start a CLI run for an existing session. Returns false if the session is unknown. */
  prompt(id: string, opts: Omit<RunOptions, "cwd" | "prompt"> & { prompt: string; cwd?: string }): boolean {
    const session =
      this.sessions.get(id) ??
      this.ensure(id, { cwd: opts.cwd, prompt: opts.prompt, model: opts.model, agent: opts.agent })
    session.state = "running"
    session.prompt = opts.prompt
    session.error = undefined
    session.finalText = undefined
    session.stopReason = undefined
    session.usage = undefined
    if (opts.agent) session.agent = opts.agent
    if (opts.model) session.model = opts.model
    this.emit(id, session)
    this.spawnRun(id, opts)
    return true
  }

  /** Start a CLI run for a new session (legacy path: creates then runs). */
  start(opts: RunOptions): Session {
    const session = this.create({ cwd: opts.cwd, prompt: opts.prompt, model: opts.model, agent: opts.agent })
    session.state = "running"
    this.spawnRun(session.id, opts)
    return session
  }

  /** Recreate a lightweight session shell when the daemon outlived the UI state. */
  ensure(id: string, opts: { cwd?: string; prompt?: string; model?: string; agent?: string }): Session {
    return this.create({
      id,
      cwd: opts.cwd ?? process.cwd(),
      prompt: opts.prompt ?? "",
      model: opts.model,
      agent: opts.agent,
    })
  }

  private spawnRun(id: string, opts: Omit<RunOptions, "cwd">): void {
    const session = this.sessions.get(id)
    if (!session) return
    const args: string[] = ["-p", opts.prompt, "--output-format", "json", "--skip-onboarding", "--trust"]
    if (opts.continue) args.push("--continue")
    else if (opts.resume) args.push("--resume", opts.resume)
    if (opts.model ?? session.model) args.push("--model", opts.model ?? session.model!)
    if (opts.effort) args.push("--effort", opts.effort)
    if (opts.theme) args.push("--theme", opts.theme)
    if (opts.yolo !== false) args.push("--yolo", "--auto-accept")
    if (opts.maxTurns) args.push("--max-turns", String(opts.maxTurns))
    for (const [key, value] of Object.entries(opts.config ?? {})) args.push("--config", `${key}=${value}`)

    const child = spawn(this.cli, args, {
      cwd: session.cwd,
      env: { ...process.env, NO_COLOR: "1" },
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    })

    let stderr = ""
    const parser = createFrameParser(
      (frame) => {
        this.applyFrame(id, frame)
      },
      (message) => {
        this.fail(id, message)
      },
    )

    child.stdout.setEncoding("utf8")
    child.stdout.on("data", (chunk: string) => parser.push(chunk))
    child.stderr.setEncoding("utf8")
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk
    })

    child.on("error", (err) => {
      this.fail(id, `Failed to spawn ${this.cli}: ${err.message}`)
    })
    child.on("close", (code) => {
      parser.end()
      const current = this.sessions.get(id)
      if (!current) return
      if (current.state === "running") {
        current.state = code === 0 ? "done" : "error"
        if (code !== 0 && !current.error) current.error = stderr.trim().slice(-500) || `exit code ${code}`
        this.emit(id, current)
      } else if (current.state === "error" && (!current.error || current.error === "Command Code request failed")) {
        const detail = stderr.trim().slice(-500)
        if (detail) {
          current.error = detail
          this.emit(id, current)
        }
      }
    })
  }

  private applyFrame(id: string, frame: Frame): void {
    const session = this.sessions.get(id)
    if (!session) return
    if (frame.type === "result") {
      session.state = frame.subtype === "error" ? "error" : "done"
      session.sessionId = frame.sessionId
      session.stopReason = frame.stopReason
      session.usage = frame.usage
      session.finalText = frame.finalText
      session.error =
        frame.subtype === "error"
          ? (errorMessage(frame.error) ?? errorMessage(frame.finalText) ?? "Command Code request failed")
          : undefined
    } else if (frame.event.type === "run_error") {
      session.error = errorMessage(frame.event.error) ?? session.error
    }
    this.emit(id, session, frame)
  }

  private fail(id: string, error: string): void {
    const session = this.sessions.get(id)
    if (!session) return
    session.state = "error"
    session.error = error
    this.emit(id, session)
  }

  private emit(id: string, session: Session, frame?: Frame): void {
    for (const listener of this.listeners)
      listener(
        session,
        frame ?? {
          type: "result",
          subtype: session.state === "error" ? "error" : "success",
          finalText: session.finalText ?? "",
        },
      )
  }

  private trimOld(): void {
    const all = [...this.sessions.values()].sort((a, b) => b.createdAt - a.createdAt)
    for (const session of all.slice(MAX_KEEP)) this.sessions.delete(session.id)
  }
}
