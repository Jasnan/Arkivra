export type ChatUrlThreadRestoreController = {
  switchToThread: (chatId: string) => unknown
  reload: () => unknown
}

export async function restoreChatThreadFromUrl({
  chatId,
  threads,
  onReloadError,
}: {
  chatId: string
  threads: ChatUrlThreadRestoreController
  onReloadError?: (error: unknown) => void
}) {
  await Promise.resolve(threads.switchToThread(chatId))

  try {
    await Promise.resolve(threads.reload())
  } catch (error) {
    onReloadError?.(error)
  }
}
