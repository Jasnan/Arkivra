import { useSyncExternalStore } from "react"
import { uploadManager } from "./upload-manager"

export function useUploadManagerState() {
  return useSyncExternalStore(
    (listener) => uploadManager.subscribe(listener),
    () => uploadManager.getState(),
    () => uploadManager.getState()
  )
}
