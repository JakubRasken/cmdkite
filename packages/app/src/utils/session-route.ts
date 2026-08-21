import { base64Encode } from "@opencode-ai/core/util/encode"
import { ServerConnection } from "@/context/servers"
import { decode64 } from "@/utils/base64"

export function sessionHref(server: ServerConnection.Key, sessionID: string) {
  return `/server/${base64Encode(server)}/session/${sessionID}`
}

export function legacySessionHref(directory: string, sessionID: string) {
  return `/${base64Encode(directory)}/session/${sessionID}`
}

export function requireServerKey(segment: string | undefined) {
  const key = decode64(segment)
  if (key && base64Encode(key) === segment) return ServerConnection.Key.make(key)

  // Older desktop state stored the local sidecar key without base64 encoding.
  if (segment === "sidecar") return ServerConnection.Key.make(segment)

  // The harness runs a single local server; fall back to its key when the
  // route omits the segment (e.g. legacy-direct session navigation).
  if (segment === undefined) return ServerConnection.Key.make("sidecar")
  throw new Error("Invalid server route")
}

export function legacySessionServer(
  tabs: readonly { type: "session"; server: ServerConnection.Key; sessionId: string }[],
  sessionID: string,
  active: ServerConnection.Key,
) {
  const matches = tabs.filter((tab) => tab.sessionId === sessionID)
  return matches.find((tab) => tab.server === active)?.server ?? (matches.length === 1 ? matches[0]?.server : active)
}

type SessionParent = { id: string; parentID?: string }

export async function rootSession<T extends SessionParent>(session: T, get: (sessionID: string) => Promise<T>) {
  const seen = new Set([session.id])
  let current = session
  while (current.parentID) {
    if (seen.has(current.parentID)) throw new Error(`Session parent cycle: ${current.parentID}`)
    seen.add(current.parentID)
    current = await get(current.parentID)
  }
  return current
}
