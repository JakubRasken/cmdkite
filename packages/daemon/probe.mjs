// Probe renderer state via CDP.
const wsUrl = process.argv[2]
const expr = process.argv[3] ?? "document.body.innerText.slice(0,300)"
const ws = new WebSocket(wsUrl)
const timer = setTimeout(() => {
  console.error("timeout")
  process.exit(1)
}, 8000)
ws.onopen = () => {
  ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: expr, returnByValue: true } }))
}
ws.onmessage = (event) => {
  const d = JSON.parse(event.data)
  if (d.id === 1) {
    console.log(JSON.stringify(d.result?.result?.value ?? d.result ?? d))
    clearTimeout(timer)
    ws.close()
    process.exit(0)
  }
}
ws.onerror = () => process.exit(1)
