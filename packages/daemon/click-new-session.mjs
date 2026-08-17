// Click the "New session" button and report the resulting UI text.
const wsUrl = process.argv[2]
const ws = new WebSocket(wsUrl)
const timer = setTimeout(() => {
  console.error("timeout")
  process.exit(1)
}, 12000)
ws.onopen = () => {
  ws.send(
    JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: {
        expression:
          "var bs = Array.from(document.querySelectorAll('button')); var b = bs.find(function(x){return x.innerText.trim() === 'New session'}); if (b) { b.click(); 'clicked' } else { 'no button; buttons=' + bs.length }",
        returnByValue: true,
      },
    }),
  )
}
ws.onmessage = (event) => {
  const d = JSON.parse(event.data)
  if (d.id === 1) {
    console.log("click:", JSON.stringify(d.result?.result?.value))
    setTimeout(() => {
      ws.send(
        JSON.stringify({
          id: 2,
          method: "Runtime.evaluate",
          params: { expression: "document.body.innerText.slice(0, 600)", returnByValue: true },
        }),
      )
    }, 2500)
  } else if (d.id === 2) {
    console.log("body:", JSON.stringify(d.result?.result?.value))
    clearTimeout(timer)
    ws.close()
    process.exit(0)
  }
}
ws.onerror = () => process.exit(1)
