// Click the model selector and dump the picker contents.
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
          "var bs = Array.from(document.querySelectorAll('button')); var b = bs.find(function(x){return x.innerText.indexOf('DeepSeek') >= 0 || x.innerText.indexOf('Select model') >= 0}); if (b) { b.click(); 'clicked: ' + b.innerText.trim() } else { 'no model button; buttons=' + bs.map(function(x){return x.innerText.trim()}).join('|').slice(0,300) }",
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
          params: { expression: "document.body.innerText.slice(0, 1200)", returnByValue: true },
        }),
      )
    }, 2000)
  } else if (d.id === 2) {
    console.log("BODY:", JSON.stringify(d.result?.result?.value))
    clearTimeout(timer)
    ws.close()
    process.exit(0)
  }
}
ws.onerror = () => process.exit(1)
