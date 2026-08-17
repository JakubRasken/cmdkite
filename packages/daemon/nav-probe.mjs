// Navigate to a URL, capture the FIRST uncaught exception with full details.
const wsUrl = process.argv[2]
const targetUrl = process.argv[3]
const ws = new WebSocket(wsUrl)
const timer = setTimeout(() => {
  console.error("timeout")
  process.exit(1)
}, 20000)
let done = false
ws.onopen = () => {
  ws.send(JSON.stringify({ id: 1, method: "Runtime.enable" }))
  ws.send(JSON.stringify({ id: 2, method: "Page.enable" }))
  ws.send(JSON.stringify({ id: 3, method: "Page.navigate", params: { url: targetUrl } }))
}
ws.onmessage = (event) => {
  const d = JSON.parse(event.data)
  if (d.method === "Runtime.exceptionThrown" && !done) {
    done = true
    const ex = d.params.exceptionDetails
    const desc = ex.exception?.description ?? ex.text
    console.log("EXCEPTION:", desc.slice(0, 2000))
    clearTimeout(timer)
    process.exit(0)
  }
  if (d.id === 3) console.log("navigating to", targetUrl)
}
ws.onerror = () => process.exit(1)
