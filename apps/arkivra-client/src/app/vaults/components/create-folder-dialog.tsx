"use client"

import { useId, useState, type FormEvent } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { createFolder } from "../vaults.api"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not create folder."
}

export function CreateFolderDialog({
  open,
  vaultId,
  parentId,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  vaultId: string
  parentId: string | null
  onOpenChange: (open: boolean) => void
  onCreated: () => void
}) {
  const nameInputId = useId()
  const [name, setName] = useState("")
  const [nameError, setNameError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  function resetForm() {
    setName("")
    setNameError(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (isSubmitting) {
      return
    }

    onOpenChange(nextOpen)

    if (!nextOpen) {
      resetForm()
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNameError(null)

    const normalizedName = name.trim()
    if (!normalizedName) {
      setNameError("Folder name is required.")
      return
    }

    setIsSubmitting(true)

    try {
      await createFolder({ vaultId, parentId, name: normalizedName })
      toast.success("Folder created.")
      resetForm()
      onOpenChange(false)
      onCreated()
    } catch (error) {
      toast.error(getErrorMessage(error))
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleCancel() {
    if (isSubmitting) {
      return
    }

    resetForm()
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>New folder</DialogTitle>
          <DialogDescription>
            Create a folder in the current vault location.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor={nameInputId}>Name *</Label>
            <Input
              id={nameInputId}
              autoFocus
              placeholder="Project files"
              value={name}
              disabled={isSubmitting}
              aria-invalid={nameError ? "true" : undefined}
              onChange={(event) => setName(event.target.value)}
              className={nameError ? "border-destructive" : ""}
            />
            {nameError ? (
              <p className="text-sm text-destructive">{nameError}</p>
            ) : null}
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={handleCancel}
              disabled={isSubmitting}
              className="cursor-pointer"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || name.trim().length === 0}
              className="cursor-pointer"
            >
              {isSubmitting ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
