# cmdkite

OpenCode-style desktop GUI for [Command Code](https://commandcode.ai). Unofficial — not
affiliated with Command Code or OpenCode.

**cmdkite** wraps the Command Code CLI (`cmd` / `cmdc`) in an Electron desktop app built on
the [OpenCode](https://github.com/anomalyco/opencode) v2 UI (MIT). It gives you OpenCode's
look and feel — home screen, session composer, themes — powered by Command Code as the
agent engine, including image backgrounds and the translucent autotheme surfaces from
OpenCode PR #37956.

## How it works

```
┌──────────────────────────┐        ┌──────────────────────────┐
│  Electron renderer       │  IPC   │  Electron main process   │
│  (OpenCode v2 UI,        │◄──────►│  (window mgmt, file      │
│   SolidJS, glass theme)  │        │   pickers, protocol)     │
└──────────────────────────┘        └───────────┬──────────────┘
                                                │ spawn / stdio
                                                ▼
                                 ┌──────────────────────────────┐
                                 │  cmdkite daemon (Node)       │
                                 │  wraps: cmdc -p "…"           │
                                 │   --output-format json       │
                                 │   --yolo --auto-accept       │
                                 │  NDJSON event stream → SSE   │
                                 └──────────────────────────────┘
```

- `packages/daemon` — local harness daemon: spawns the Command Code CLI, parses its NDJSON
  event stream, and exposes an OpenCode-compatible HTTP/SSE API the renderer talks to.
- `packages/desktop` — Electron shell (forked from OpenCode v2) that spawns the daemon and
  hosts the UI.
- `packages/app`, `packages/ui`, `packages/session-ui`, `packages/client`, `packages/core`,
  `packages/schema`, `packages/util` — vendored from OpenCode v2 (MIT), with the session
  model wired to the daemon instead of OpenCode's server.

## Prerequisites

- [Node.js](https://nodejs.org) 22+
- [Bun](https://bun.sh) (`powershell -c "irm bun.sh/install.ps1 | iex"`)
- Command Code CLI, logged in: `cmdc --version` and `cmdc login`

## Run

```bash
bun install
cd packages/desktop
bun run dev
```

The app spawns the daemon automatically (port 41414). `CMD_BIN` can override the CLI binary
path if `cmdc` isn't on PATH.

## License & attribution

- MIT (this repo's code), with the OpenCode copyright notice retained for the vendored
  packages.
- Command Code is proprietary; cmdkite only wraps its public CLI — no Command Code source is
  included.
- Not affiliated with Command Code or OpenCode.
