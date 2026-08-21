import { describe, expect, test } from "bun:test"
import { CmdRunner } from "./runner.ts"

describe("command runner errors", () => {
  test("preserves CLI result and run_error details", () => {
    const runner = new CmdRunner("unused")
    const session = runner.create({ cwd: process.cwd(), prompt: "hello" })
    const applyFrame = (runner as unknown as { applyFrame: (id: string, frame: unknown) => void }).applyFrame.bind(
      runner,
    )

    applyFrame(session.id, {
      type: "event",
      event: { type: "run_error", error: { name: "TransportError", message: "quota exceeded" } },
    })
    applyFrame(session.id, {
      type: "result",
      subtype: "error",
      finalText: "",
      error: "Error: quota exceeded",
    })

    expect(runner.get(session.id)?.state).toBe("error")
    expect(runner.get(session.id)?.error).toBe("Error: quota exceeded")
  })
})
