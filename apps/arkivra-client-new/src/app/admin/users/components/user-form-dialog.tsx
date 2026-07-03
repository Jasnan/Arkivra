"use client"

import { useState } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { Check, Mail, Plus, Send } from "lucide-react"
import { useForm } from "react-hook-form"
import { z } from "zod"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { EmailInvitation, InviteUserInput } from "../admin-users.api"

const inviteUserSchema = z.object({
  email: z.string().email({
    message: "Please enter a valid email address.",
  }),
  systemRole: z.enum(["member", "admin"]),
  canCreateVaults: z.boolean(),
})

type InviteUserFormValues = z.infer<typeof inviteUserSchema>

interface UserFormDialogProps {
  disabled?: boolean
  onInviteUser: (input: InviteUserInput) => Promise<EmailInvitation>
}

export function UserFormDialog({ disabled = false, onInviteUser }: UserFormDialogProps) {
  const [open, setOpen] = useState(false)
  const [createdInvitation, setCreatedInvitation] = useState<EmailInvitation | null>(null)

  const form = useForm<InviteUserFormValues>({
    resolver: zodResolver(inviteUserSchema),
    defaultValues: {
      email: "",
      systemRole: "member",
      canCreateVaults: false,
    },
  })

  async function onSubmit(data: InviteUserFormValues) {
    const invitation = await onInviteUser(data)
    setCreatedInvitation(invitation)
    form.reset()
  }

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (!nextOpen) {
      setCreatedInvitation(null)
      form.reset()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button className="cursor-pointer" disabled={disabled}>
          <Plus className="mr-2 size-4" />
          Invite User
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{createdInvitation ? "Invitation Created" : "Invite User"}</DialogTitle>
          <DialogDescription>
            {createdInvitation
              ? "The invitation is ready for the user to accept."
              : "Send an account invitation with the right system access."}
          </DialogDescription>
        </DialogHeader>

        {createdInvitation ? (
          <div className="space-y-4">
            <div className="rounded-md border bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <div className="flex size-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Check className="size-5" />
                </div>
                <div className="min-w-0 space-y-1">
                  <p className="font-medium">Invitation is pending acceptance</p>
                  <p className="break-all text-sm text-muted-foreground">{createdInvitation.email}</p>
                  <p className="text-sm text-muted-foreground">
                    Role: {createdInvitation.systemRole === "admin" ? "Admin" : "Member"}
                  </p>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <div className="relative">
                        <Input placeholder="user@example.com" type="email" className="pr-10" {...field} />
                        <Mail className="absolute top-1/2 right-3 size-4 -translate-y-1/2 text-muted-foreground" />
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="systemRole"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>System Role</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger className="w-full cursor-pointer">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="member">Member</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="canCreateVaults"
                render={({ field }) => (
                  <FormItem className="flex items-start gap-3 rounded-md border p-3">
                    <FormControl>
                      <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                    <div className="space-y-1 leading-none">
                      <FormLabel>Can create vaults</FormLabel>
                      <p className="text-sm text-muted-foreground">Allow this user to create new vaults.</p>
                    </div>
                  </FormItem>
                )}
              />

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={disabled}>
                  <Send className="mr-2 size-4" />
                  Send Invite
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}
