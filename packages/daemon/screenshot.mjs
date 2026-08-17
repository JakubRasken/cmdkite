import { writeFileSync } from "node:fs"
const wsUrl = process.argv[2]
const outFile = process.argv[3]
const ws = new WebSocket(wsUrl)
const timer = setTimeout(() => {
  console.error("timeout")
  process.exit(1)
}, 10000)
ws.onopen = () => {
  ws.send(JSON.stringify({ id: 1, method: "Page.enable" }))
  ws.send(JSON.stringify({ id: 2, method: "Page.captureScreenshot", params: { format: "png" } }))
}
ws.onmessage = (event) => {
  const d = JSON.parse(event.data)
  if (d.id === 2) {
    writeFileSync(outFile, Buffer.from(d.result.data, "base64"))
    console.log("saved", outFile, d.result.data.length, "bytes")
    clearTimeout(timer)
    ws.close()
    process.exit(0)
  }
}
ws.onerror = () => process.exit(1)
