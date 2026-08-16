/** Resolve the Command Code CLI binary. On Windows the short name is `cmdc` (cmd is the shell). */
export function resolveCli(env: NodeJS.ProcessEnv = process.env): string {
  if (env.CMD_BIN) return env.CMD_BIN
  // npm global installs land here on Windows (bun's PATH may not include it).
  const candidates =
    process.platform === "win32"
      ? [process.env.APPDATA ? `${process.env.APPDATA}\\npm\\cmdc.cmd` : "", "cmdc", "command-code"]
      : ["cmd", "command-code"]
  return candidates.find((candidate) => candidate.length > 0) ?? "cmdc"
}
