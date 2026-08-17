// Navigate to the new-session route, type a prompt, submit, and report the result.
const wsUrl = process.argv[2]
const ws = new WebSocket(wsUrl)
const timer = setTimeout(() => {
  console.error("timeout")
  process.exit(1)
}, 45000)
let step = 0
function send(method, params) {
  ws.send(JSON.stringify({ id: ++step, method, params }))
}
ws.onopen = () => {
  send("Runtime.enable", {})
  send("Page.enable", {})
  // Click the first "New session" button after a short wait.
  setTimeout(() => {
    send("Runtime.evaluate", {
      params: {
        expression:
          "var bs = Array.from(document.querySelectorAll('button')); var b = bs.find(function(x){return x.innerText.trim() === 'New session'}); if (b) { b.click(); 'clicked' } else { 'no button' }",
        returnByValue: true,
      },
    })
  }, 3000)
}
ws.onmessage = (event) => {
  const d = JSON.parse(event.data)
  if (d.id === 1 && d.result?.result?.value) {
    console.log("click:", JSON.stringify(d.result.result.value))
    // Wait for composer, then set the prompt and submit.
    setTimeout(() => {
      send("Runtime.evaluate", {
        params: {
          expression:
            "var ed = document.querySelector('[contenteditable=\"true\"], textarea, [contenteditable]'); if (!ed) return 'no editor'; ed.focus(); document.execCommand('insertText', false, 'Reply with exactly: pong'); 'typed'",
          returnByValue: true,
        },
      })
    }, 2000)
  }
  if (d.id === 2 && d.result?.result?.value) {
    console.log("type:", JSON.stringify(d.result.result.value))
    setTimeout(() => {
      send("Runtime.evaluate", {
        params: {
          expression:
            "var ed = document.querySelector('[contenteditable=\"true\"], textarea, [contenteditable]'); var ev = new KeyboardEvent('keydown', {key:'Enter', code:'Enter', bubbles:true}); ed.dispatchEvent(ev); 'submitted'",
          returnByValue: true,
        },
      })
    }, 1000)
  }
  if (d.id === 3 && d.result?.result?.value) {
    console.log("submit:", JSON.stringify(d.result.result.value))
    // Wait and read the resulting body.
    setTimeout(() => {
      send("Runtime.evaluate", {
        params: { expression: "document.body.innerText.slice(0, 900)", returnByValue: true },
      })
    }, 15000)
  }
  if (d.id === 4 && d.result?.result?.value) {
    console.log("BODY:", JSON.stringify(d.result.result.value))
    clearTimeout(timer)
    ws.close()
    process.exit(0)
  }
}
ws.onerror = () => process.exit(1)
