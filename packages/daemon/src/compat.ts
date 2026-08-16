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
  type: string
  location?: LocationRef
  data: Record<string, unknown>
}

export type SessionsResponse = {
  data: SessionInfo[]
  cursor: { previous?: string | null; next?: string | null }
}

export function locationOf(session: Session): LocationRef {
  return { directory: session.cwd }
}

export function toSessionInfo(session: Session): SessionInfo {
  return {
    id: session.sessionId ?? session.id,
    projectID: "local",
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

/** Build the event list emitted for a run (OpenCode-compatible shapes). */
export function toEvents(session: Session, cmdSessionId: string | undefined): V2Event[] {
  const location = locationOf(session)
  const now = Date.now()
  const events: V2Event[] = []

  if (cmdSessionId) {
    events.push({
      id: `created-${cmdSessionId}`,
      type: "session.created",
      location,
      data: { sessionID: cmdSessionId, info: toSessionInfo({ ...session, sessionId: cmdSessionId }) },
    })
  }

  events.push({
    id: `user-${session.id}`,
    type: "session.user_message",
    location,
    data: {
      sessionID: cmdSessionId ?? session.id,
      message: { id: `user-${session.id}`, time: { created: session.createdAt }, type: "user", text: session.prompt },
    },
  })

  if (session.finalText !== undefined) {
    events.push({
      id: `text-${session.id}`,
      type: "session.text.delta",
      location,
      data: {
        sessionID: cmdSessionId ?? session.id,
        assistantMessageID: `assistant-${session.id}`,
        ordinal: 0,
        delta: session.finalText,
      },
    })
    events.push({
      id: `assistant-${session.id}`,
      type: "session.updated",
      location,
      data: {
        sessionID: cmdSessionId ?? session.id,
        message: {
          id: `assistant-${session.id}`,
          time: { created: now },
          type: "assistant",
          agent: "primary",
          content: [{ type: "text", text: session.finalText }],
          finish: "stop",
        },
      },
    })
  }

  if (session.error) {
    events.push({
      id: `error-${session.id}`,
      type: "session.error",
      location,
      data: { sessionID: cmdSessionId ?? session.id, error: { message: session.error } },
    })
  }

  events.push({
    id: `state-${session.id}`,
    type: "session.updated",
    location,
    data: {
      sessionID: cmdSessionId ?? session.id,
      state: { status: session.state === "error" ? "error" : "done" },
    },
  })

  return events
}

/** The initial event the renderer's event stream must start with. */
export function serverConnectedEvent(): V2Event {
  return { id: `connected-${Date.now()}`, type: "server.connected", data: {} }
}
