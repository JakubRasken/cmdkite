// Reload the page via CDP and wait.
const wsUrl = process.argv[2]
const ws = new WebSocket(wsUrl)
ws.onopen = () => {
  ws.send(JSON.stringify({ id: 1, method: "Page.reload", params: { ignoreCache: true } }))
  console.log("reload sent")
}
setTimeout(() => {
  ws.close()
  process.exit(0)
}, 3000)
ws.onerror = () => process.exit(1)
