"use client"

import { ChevronDown, FileUp, FolderUp, Upload } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function VaultUploadMenu({
  disabled,
  onUploadFiles,
  onUploadFolder,
}: {
  disabled?: boolean
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
