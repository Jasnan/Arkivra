"use client"

import { ChevronDown, FileUp, FolderUp, MessageSquare, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function VaultUploadMenu({
  disabled,
  showChat,
  onOpenChat,
  onUploadFiles,
  onUploadFolder,
}: {
  disabled?: boolean
  showChat?: boolean
  onOpenChat?: () => void
  onUploadFiles: () => void
  onUploadFolder: () => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={disabled}>
          <Upload className="size-4" />
          Upload
          <ChevronDown className="size-4 opacity-70" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        {showChat ? (
          <>
            <DropdownMenuItem className="cursor-pointer" onClick={onOpenChat}>
              <MessageSquare className="size-4" />
              Chat
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        ) : null}
        <DropdownMenuItem className="cursor-pointer" onClick={onUploadFiles}>
          <FileUp className="size-4" />
          Upload files
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer" onClick={onUploadFolder}>
          <FolderUp className="size-4" />
          Upload folder
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
