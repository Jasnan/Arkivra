"use client"

import { useEffect, useId, useState, type FormEvent } from "react"
import { FolderPlus, Plus } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createVault, getMe, isPermissionRequestResponse } from "../vaults.api"

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not create vault."
}

export function CreateVaultDialog() {
  const nameInputId = useId()
  const descriptionInputId = useId()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [description, setDescription] = useState("")
  const [nameError, setNameError] = useState<string | null>(null)
  const [canCreateVault, setCanCreateVault] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!open) {
      return
    }

    let ignore = false

    getMe()
      .then((result) => {
        if (!ignore) {
          setCanCreateVault(result.canCreateVault)
        }
      })
      .catch(() => {
        if (!ignore) {
          setCanCreateVault(true)
        }
      })

    return () => {
      ignore = true
    }
  }, [open])

  function resetForm() {
    setName("")
    setDescription("")
    setNameError(null)
  }

  function handleOpenChange(nextOpen: boolean) {
    if (isSubmitting) {
      return
    }

    setOpen(nextOpen)

    if (!nextOpen) {
      resetForm()
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setNameError(null)

    const normalizedName = name.trim()
    if (!normalizedName) {
      setNameError("Vault name is required.")
      return
    }

    setIsSubmitting(true)

    try {
      const result = await createVault({
        name: normalizedName,
        description: description.trim() || null,
      })

      if (isPermissionRequestResponse(result)) {
        toast.success("Vault creation request queued for admin approval.")
      } else {
        toast.success("Vault created.")
        window.dispatchEvent(
          new CustomEvent("arkivra:vault-created", { detail: result.vault })
        )
      }

      resetForm()
      setOpen(false)
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
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button variant="default" size="sm" className="cursor-pointer">
          <Plus className="size-4" />
          New vault
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>New vault</DialogTitle>
          <DialogDescription>
            Group related documents in one place and manage who can access them.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor={nameInputId}>Vault name *</Label>
            <Input
              id={nameInputId}
              autoFocus
              placeholder="Finance & tax"
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

          <div className="space-y-2">
            <Label htmlFor={descriptionInputId}>Description</Label>
            <Textarea
              id={descriptionInputId}
              placeholder="Invoices, tax returns, and supporting records"
              value={description}
              disabled={isSubmitting}
              rows={3}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
            {canCreateVault
              ? "After creation, open the vault settings to invite members and assign viewer or editor access."
              : "Your request will be sent to an administrator for approval before the vault is created."}
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
            <Button type="submit" disabled={isSubmitting} className="cursor-pointer">
              <FolderPlus className="size-4" />
              {isSubmitting ? "Submitting..." : canCreateVault ? "Create" : "Request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
