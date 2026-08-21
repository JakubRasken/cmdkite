import { createMemo } from "solid-js"
import type { Accessor } from "solid-js"
import { useServerSync } from "./server-sync"
import { useSDK } from "./sdk"
import type { createDirSyncContext } from "./directory-sync"

export type DirectorySync = ReturnType<typeof createDirSyncContext>

export const useSync = (): Accessor<DirectorySync> => {
  const serverSync = useServerSync()
  const sdk = useSDK()

  return createMemo(() => {
    const directory = sdk()?.directory
    if (!directory) return undefined as unknown as DirectorySync
    return serverSync.ensureDirSyncContext(directory)
  })
}
