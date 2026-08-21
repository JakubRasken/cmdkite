import { afterEach, describe, expect, test } from "bun:test"
import type { AddressInfo } from "node:net"
import { createApp } from "./server.ts"
import type { Session } from "./runner.ts"

const sessions = new Map<string, Session>()
let nextID = 0

const runner = {
  list: () => [...sessions.values()],
  get: (id: string) => sessions.get(id),
  create: (input: { id?: string; cwd: string; prompt: string; model?: string; agent?: string }) => {
    const id = input.id ?? `session-${++nextID}`
    const existing = sessions.get(id)
    if (existing) return existing
    const session: Session = { id, state: "idle", createdAt: Date.now(), ...input }
    sessions.set(id, session)
    return session
  },
  ensure: (id: string, input: { cwd?: string; prompt?: string; model?: string; agent?: string }) =>
    runner.create({
      id,
      cwd: input.cwd ?? process.cwd(),
      prompt: input.prompt ?? "",
      model: input.model,
      agent: input.agent,
    }),
  prompt: (id: string, input: { prompt: string; model?: string; cwd?: string }) => {
    const session = sessions.get(id)
    if (!session) return false
    session.prompt = input.prompt
    session.model = input.model ?? session.model
    session.state = "running"
    return true
  },
  onFrame: () => () => {},
  getCli: () => "test-cli",
} as unknown as Parameters<typeof createApp>[0]

let server: ReturnType<typeof createApp> | undefined

async function request(path: string, init?: RequestInit) {
  const address = server?.address() as AddressInfo
  return fetch(`http://127.0.0.1:${address.port}${path}`, init)
}

afterEach(async () => {
  sessions.clear()
  nextID = 0
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = undefined
})

describe("daemon API contracts", () => {
  test("uses the generated client's 204 mutation responses", async () => {
    server = createApp(runner)
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve))

    const created = await request("/api/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ agent: "build", model: { id: "model", providerID: "commandcode" } }),
    })
    const session = (await created.json()).data as Session

    expect(created.status).toBe(200)
    expect((session as unknown as { cost: number }).cost).toBe(0)
    expect((session as unknown as { tokens: { cache: { read: number } } }).tokens.cache.read).toBe(0)
    expect((await request(`/api/session/${session.id}/agent`, mutation({ agent: "build" }))).status).toBe(204)
    expect(
      (
        await request(
          `/api/session/${session.id}/model`,
          mutation({ model: { id: "model", providerID: "commandcode" } }),
        )
      ).status,
    ).toBe(204)
  })

  test("recreates a stale session before accepting a prompt", async () => {
    server = createApp(runner)
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve))

    const id = "stale-session"
    expect(
      (await request(`/api/session/${id}/agent?location%5Bdirectory%5D=%2Fworkspace`, mutation({ agent: "build" })))
        .status,
    ).toBe(204)
    const response = await request(
      `/api/session/${id}/prompt?location%5Bdirectory%5D=%2Fworkspace`,
      mutation({ text: "hello" }),
    )

    expect(response.status).toBe(200)
    expect(sessions.get(id)?.cwd).toBe("/workspace")
  })
})

function mutation(body: unknown): RequestInit {
  return { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }
}
