export function isChatPath(pathname: string) {
  return pathname === "/chat" || pathname.startsWith("/chat/")
}

export function shouldConfirmChatDiscard({
  hasConversation,
  hasNonGlobalContext,
  hasChatId,
  currentPathname,
  nextPathname,
}: {
  hasConversation: boolean
  hasNonGlobalContext: boolean
  hasChatId: boolean
  currentPathname: string
  nextPathname: string
}) {
  return (
    !hasConversation &&
    (hasNonGlobalContext || hasChatId) &&
    isChatPath(currentPathname) &&
    !isChatPath(nextPathname)
  )
}
