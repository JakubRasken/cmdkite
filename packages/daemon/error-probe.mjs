// Click the "Error Details" button and dump the expanded error panel.
const wsUrl = process.argv[2]
const ws = new WebSocket(wsUrl)
const timer = setTimeout(() => {
  console.error("timeout")
  process.exit(1)
}, 8000)
let step = 0
ws.onopen = () => {
  ws.send(
    JSON.stringify({
      id: 1,
      method: "Runtime.evaluate",
      params: {
        expression:
          "var b = Array.from(document.querySelectorAll('button')).find(function(x){return x.innerText.indexOf('Error Details') >= 0}); if (b) { b.click(); 'clicked' } else { 'no button' }",
        returnByValue: true,
      },
    }),
  )
}
ws.onmessage = (event) => {
  const d = JSON.parse(event.data)
  if (d.id === 1) {
    if (step === 0) {
      console.log("click:", JSON.stringify(d.result?.result?.value))
      step = 1
      setTimeout(() => {
        ws.send(
          JSON.stringify({
            id: 2,
            method: "Runtime.evaluate",
            params: { expression: "document.body.innerText.slice(0, 2000)", returnByValue: true },
          }),
        )
      }, 500)
    } else {
      console.log("body:", JSON.stringify(d.result?.result?.value))
      clearTimeout(timer)
      ws.close()
      process.exit(0)
    }
  }
}
ws.onerror = () => process.exit(1)
