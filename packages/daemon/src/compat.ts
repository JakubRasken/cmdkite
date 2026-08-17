import type { Session } from "./runner.ts"

/** Minimal OpenCode-compatible shapes (see packages/client generated types). */
export type LocationRef = { directory: string; projectID?: string }

export type SessionInfo = {
  id: string
  projectID: string
  model?: string
  cost: { amount: number; currency: string }
  tokens: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number }
  time: { created: number; updated: number }
  title?: string
  location: LocationRef
}

export type SessionMessage = {
  id: string
  time: { created: number }
  type: "user" | "assistant" | "synthetic"
  text?: string
  content?: Array<{ type: "text" | "reasoning" | "tool"; text?: string }>
  agent?: string
  model?: string
  finish?: string
}

export type V2Event = {
  id: string
  created: number
  type: string
  location?: LocationRef
  data: Record<string, unknown>
}

export type SessionsResponse = {
  data: SessionInfo[]
  cursor: { previous?: string | null; next?: string | null }
}

/** Stamp the common wire-event fields (id/created/type/location/data). */
function event(id: string, type: string, location: LocationRef, data: Record<string, unknown>): V2Event {
  return { id, created: Date.now(), type, location, data }
}

export function locationOf(session: Session): LocationRef {
  return { directory: session.cwd }
}

export function toSessionInfo(session: Session): SessionInfo {
  return {
    // The daemon's UUID is the stable app-facing session id. The CLI's own
    // sessionId (from the result frame) is kept for --resume, not surfaced.
    id: session.id,
    projectID: "local",
    model: session.model,
    cost: { amount: 0, currency: "USD" },
    tokens: {},
    time: { created: session.createdAt, updated: Date.now() },
    title: session.prompt.slice(0, 60),
    location: locationOf(session),
  }
}

export function toSessionsResponse(sessions: Session[]): SessionsResponse {
  return { data: sessions.map(toSessionInfo), cursor: { previous: null, next: null } }
}

/** Build the message list for a session (user prompt + assistant reply). */
export function toSessionMessages(session: Session): SessionMessage[] {
  const messages: SessionMessage[] = [
    {
      id: `user-${session.id}`,
      time: { created: session.createdAt },
      type: "user",
      text: session.prompt,
    },
  ]
  if (session.finalText !== undefined) {
    messages.push({
      id: `assistant-${session.id}`,
      time: { created: Date.now() },
      type: "assistant",
      agent: "primary",
      model: "default",
      content: [{ type: "text", text: session.finalText }],
      finish: session.state === "error" ? "error" : "stop",
    })
  }
  return messages
}

/** Events emitted as soon as a run starts: session created + the user's inbox message. */
export function toStartEvents(session: Session): V2Event[] {
  const location = locationOf(session)
  const sessionID = session.id
  const userMessageID = `user-${session.id}`
  const inboxID = `inbox-${session.id}`
  return [
    event(`created-${session.id}`, "session.created", location, {
      sessionID,
      info: toSessionInfo(session),
    }),
    event(`inbox-enqueued-${session.id}`, "session.inbox.enqueued", location, {
      sessionID,
      inboxID,
      item: {
        id: userMessageID,
        sessionID,
        timeCreated: session.createdAt,
        type: "user",
        payload: { text: session.prompt },
        delivery: "steer",
      },
    }),
    event(`inbox-delivered-${session.id}`, "session.inbox.delivered", location, {
      sessionID,
      inboxID,
    }),
    event(`step-started-${session.id}`, "session.step.started", location, {
      sessionID,
      assistantMessageID: `assistant-${session.id}`,
      agent: "primary",
    }),
  ]
}

/** Build the v2 wire event list emitted for a run (OpenCode-compatible shapes). */
export function toEvents(session: Session): V2Event[] {
  const location = locationOf(session)
  const events: V2Event[] = []
  const sessionID = session.id
  const assistantMessageID = `assistant-${session.id}`

  if (session.finalText !== undefined) {
    events.push(event(`text-started-${session.id}`, "session.text.started", location, { sessionID, assistantMessageID, ordinal: 0 }))
    events.push(event(`text-delta-${session.id}`, "session.text.delta", location, { sessionID, assistantMessageID, ordinal: 0, delta: session.finalText }))
    events.push(event(`text-ended-${session.id}`, "session.text.ended", location, { sessionID, assistantMessageID, ordinal: 0, text: session.finalText }))
    events.push(
      event(`step-ended-${session.id}`, "session.step.ended", location, {
        sessionID,
        assistantMessageID,
        finish: "stop",
        time: { completed: Date.now() },
      }),
    )
  }

  if (session.error) {
    events.push(
      event(`step-failed-${session.id}`, "session.step.failed", location, {
        sessionID,
        assistantMessageID,
        finish: "error",
        error: { message: session.error },
      }),
    )
  }

  events.push(event(`updated-${session.id}`, "session.updated", location, { sessionID, info: toSessionInfo(session) }))

  return events
}

/** The initial event the renderer's event stream must start with. */
export function serverConnectedEvent(): V2Event {
  return event(`connected-${Date.now()}`, "server.connected", { directory: process.cwd() }, {})
}
