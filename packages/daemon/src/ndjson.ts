/**
 * NDJSON frame types emitted by `cmd -p --output-format json`.
 * Forward-compatible: unknown event types are ignored by consumers.
 */
export type ResultFrame = {
  type: "result"
  subtype: "success" | "error" | "max_turns"
  sessionId?: string
  stopReason?: string
  usage?: unknown
  durationMs?: number
  finalText: string
}

export type EventFrame = {
  type: "event"
  event: {
    type: string
    toolCallId?: string
    toolName?: string
    description?: string
    [key: string]: unknown
  }
}

export type Frame = EventFrame | ResultFrame

/** Split a stdout stream into NDJSON frames, dispatching each parsed line. */
export function createFrameParser(onFrame: (frame: Frame) => void, onError: (message: string) => void) {
  let buffer = ""
  return {
    push(chunk: string): void {
      buffer += chunk
      let index: number
      while ((index = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, index).trim()
        buffer = buffer.slice(index + 1)
        if (!line) continue
        try {
          const parsed = JSON.parse(line) as Frame
          onFrame(parsed)
        } catch {
          onError(`Failed to parse NDJSON frame: ${line.slice(0, 200)}`)
        }
      }
    },
    end(): void {
      const line = buffer.trim()
      if (line) {
        try {
          onFrame(JSON.parse(line) as Frame)
        } catch {
          onError(`Failed to parse trailing NDJSON frame: ${line.slice(0, 200)}`)
        }
      }
      buffer = ""
    },
  }
}
