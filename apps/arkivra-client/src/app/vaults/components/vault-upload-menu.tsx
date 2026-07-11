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
  variant = "default",
  onUploadFiles,
  onUploadFolder,
}: {
  disabled?: boolean
  variant?: "default" | "outline"
  onUploadFiles: () => void
  onUploadFolder: () => void
}) {
  return (
    <div className="inline-flex" role="group" aria-label="Upload options">
      <Button
        type="button"
        variant={variant}
        className="rounded-r-none"
        disabled={disabled}
        onClick={onUploadFiles}
      >
        <Upload className="size-4" />
        Upload files
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant={variant}
            size="icon"
            className="-ml-px rounded-l-none px-2"
            disabled={disabled}
            aria-label="More upload options"
          >
            <ChevronDown className="size-4" />
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
    </div>
  )
}
