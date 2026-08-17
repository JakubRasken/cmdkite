// Capture console messages + exceptions for a few seconds, then dump.
const wsUrl = process.argv[2]
const ws = new WebSocket(wsUrl)
const timer = setTimeout(() => {
  console.error("timeout")
  process.exit(1)
}, 15000)
const lines = []
ws.onopen = () => {
  ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }))
  ws.send(JSON.stringify({ id: 2, method: "Log.enable" }))
}
ws.onmessage = (event) => {
  const d = JSON.parse(event.data)
  if (d.method === "Runtime.exceptionThrown") {
    const ex = d.params.exceptionDetails
    lines.push("EXCEPTION: " + (ex.text + " " + (ex.exception?.description ?? "")).slice(0, 800))
  }
  if (d.method === "Runtime.consoleAPICalled") {
    const text = d.params.args.map((a) => a.value ?? a.description ?? "").join(" ").slice(0, 400)
    lines.push("CONSOLE[" + d.params.type + "]: " + text)
  }
  if (d.method === "Log.entryAdded") {
    lines.push("LOG: " + (d.params.entry.text ?? "").slice(0, 400))
  }
  if (lines.length >= 40) finish()
}
function finish() {
  clearTimeout(timer)
  console.log(lines.join("\n"))
  ws.close()
  process.exit(0)
}
setTimeout(finish, 10000)
