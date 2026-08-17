import { createMemo } from "solid-js"
import { useServerSync } from "./server-sync"
import { useSDK } from "./sdk"

export const useSync = () => {
  const serverSync = useServerSync()
  const sdk = useSDK()

  return createMemo(() => {
    const directory = sdk()?.directory
    if (!directory) return undefined as unknown as ReturnType<ReturnType<typeof useSync>>
    return serverSync.ensureDirSyncContext(directory)
  })
}

export type DirectorySync = ReturnType<ReturnType<typeof useSync>>
