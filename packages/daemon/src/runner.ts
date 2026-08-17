import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process"
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
}

export type SessionState = "idle" | "running" | "done" | "error"

export interface Session {
  id: string
  state: SessionState
  cwd: string
  prompt: string
  createdAt: number
  sessionId?: string
  stopReason?: string
  usage?: unknown
  finalText?: string
  error?: string
}

type Listener = (session: Session, frame: Frame) => void

const MAX_KEEP = 200

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
  create(opts: Pick<RunOptions, "cwd" | "prompt"> & { id?: string }): Session {
    const id = opts.id ?? randomUUID()
    const session: Session = {
      id,
      state: "idle",
      cwd: opts.cwd,
      prompt: opts.prompt,
      createdAt: Date.now(),
    }
    this.sessions.set(id, session)
    this.trimOld()
    return session
  }

  /** Start a CLI run for an existing session. Returns false if the session is unknown. */
  prompt(id: string, opts: Omit<RunOptions, "cwd" | "prompt"> & { prompt: string }): boolean {
    const session = this.sessions.get(id)
    if (!session) return false
    session.state = "running"
    session.prompt = opts.prompt
    this.emit(id, session)
    this.spawnRun(id, opts)
    return true
  }

  /** Start a CLI run for a new session (legacy path: creates then runs). */
  start(opts: RunOptions): Session {
    const session = this.create({ cwd: opts.cwd, prompt: opts.prompt })
    session.state = "running"
    this.spawnRun(session.id, opts)
    return session
  }

  private spawnRun(id: string, opts: Omit<RunOptions, "cwd">): void {
    const session = this.sessions.get(id)
    if (!session) return
    const args: string[] = ["-p", opts.prompt, "--output-format", "json", "--skip-onboarding", "--trust"]
    if (opts.continue) args.push("--continue")
    else if (opts.resume) args.push("--resume", opts.resume)
    if (opts.model) args.push("--model", opts.model)
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
    for (const listener of this.listeners) listener(session, frame ?? { type: "result", subtype: session.state === "error" ? "error" : "success", finalText: session.finalText ?? "" })
  }

  private trimOld(): void {
    const all = [...this.sessions.values()].sort((a, b) => b.createdAt - a.createdAt)
    for (const session of all.slice(MAX_KEEP)) this.sessions.delete(session.id)
  }
}
