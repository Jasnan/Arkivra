"use client"

import { useMemo, useState, type ReactNode } from "react"
import {
  type ColumnDef,
  type ColumnFiltersState,
  type FilterFn,
  type SortingState,
  type VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table"
import {
  ChevronDown,
  EllipsisVertical,
  Folder,
  RefreshCw,
  Search,
  Shield,
  ShieldCheck,
  ShieldX,
  Sparkles,
  UserRound,
  UserRoundCheck,
  UserRoundCog,
  UserRoundX,
  X,
} from "lucide-react"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatShortDate } from "@/lib/date-format"
import type { AdminUser, EmailInvitation, InviteUserInput } from "../admin-users.api"
import { UserFormDialog } from "./user-form-dialog"

interface DataTableProps {
  users: AdminUser[]
  isLoading: boolean
  error: Error | null
  mutationPending: boolean
  onInviteUser: (input: InviteUserInput) => Promise<EmailInvitation>
  onRetry: () => void | Promise<void>
  onDisableUser: (user: AdminUser) => void | Promise<void>
  onEnableUser: (user: AdminUser) => void | Promise<void>
  onGrantAdmin: (user: AdminUser) => void | Promise<void>
  onRevokeAdmin: (user: AdminUser) => void | Promise<void>
  onGrantCreateVaults: (user: AdminUser) => void | Promise<void>
  onRevokeCreateVaults: (user: AdminUser) => void | Promise<void>
  onGrantUseAI: (user: AdminUser) => void | Promise<void>
  onRevokeUseAI: (user: AdminUser) => void | Promise<void>
}

function getUserInitials(user: AdminUser) {
  const source = user.name?.trim() || user.email.trim()
  const parts = source.split(/\s+/).filter(Boolean)

  if (parts.length >= 2) {
    return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
  }

  return source.slice(0, 2).toUpperCase() || "?"
}

function getUserDisplayName(user: AdminUser) {
  return user.name?.trim() || user.email
}

function getUserRole(user: AdminUser) {
  return user.isAdmin ? "Administrator" : "Member"
}

function getUserStatus(user: AdminUser) {
  return user.disabledAt === null ? "Active" : "Disabled"
}

function getUserAccess(user: AdminUser) {
  const privileges = [
    ...(user.canUseAI ? ["Use AI"] : []),
    ...(user.canCreateVault ? ["Create vaults without approval"] : []),
  ]

  return privileges.length > 0 ? privileges.join(", ") : "None"
}

function getUserAuth(user: AdminUser) {
  const methods = user.authMethods

  if (!methods) {
    return user.twoFactorEnabled ? "2FA enabled" : "Password"
  }

  const providers = methods.oauthProviders
    .map((provider) => provider.charAt(0).toUpperCase() + provider.slice(1))
    .join(", ")

  if (methods.hasPassword && providers) return `Password, ${providers}`
  if (providers) return providers
  if (methods.hasPassword) return "Password"
  return "Unknown"
}

const formatDate = formatShortDate

function getStatusColor(status: string) {
  switch (status) {
    case "Active":
      return "bg-primary/10 text-foreground"
    case "Disabled":
      return "bg-muted text-muted-foreground"
    default:
      return "bg-muted text-muted-foreground"
  }
}

function getRoleColor(role: string) {
  switch (role) {
    case "Administrator":
      return "bg-primary/10 text-foreground"
    case "Member":
      return "bg-secondary text-secondary-foreground"
    default:
      return "bg-muted text-muted-foreground"
  }
}

const exactAdminUserFilter: FilterFn<AdminUser> = (row, columnId, value) => {
  return row.getValue(columnId) === value
}

type PlatformPrivilegeFilters = {
  useAI: boolean
  createVaults: boolean
}

const emptyPlatformPrivilegeFilters: PlatformPrivilegeFilters = {
  useAI: false,
  createVaults: false,
}

function isPlatformPrivilegeFilters(value: unknown): value is PlatformPrivilegeFilters {
  return (
    typeof value === "object" &&
    value !== null &&
    "useAI" in value &&
    "createVaults" in value
  )
}

function hasActivePrivilegeFilter(value: PlatformPrivilegeFilters) {
  return value.useAI || value.createVaults
}

function getPrivilegeFilterLabel(value: PlatformPrivilegeFilters) {
  const count = Number(value.useAI) + Number(value.createVaults)
  return count > 0 ? `${count} selected` : "Any privileges"
}

const platformPrivilegeFilter: FilterFn<AdminUser> = (row, _columnId, value) => {
  if (!isPlatformPrivilegeFilters(value) || !hasActivePrivilegeFilter(value)) {
    return true
  }

  const user = row.original

  if (value.useAI && !user.canUseAI) return false
  if (value.createVaults && !user.canCreateVault) return false

  return true
}

export function DataTable({
  users,
  isLoading,
  error,
  mutationPending,
  onInviteUser,
  onRetry,
  onDisableUser,
  onEnableUser,
  onGrantAdmin,
  onRevokeAdmin,
  onGrantCreateVaults,
  onRevokeCreateVaults,
  onGrantUseAI,
  onRevokeUseAI,
}: DataTableProps) {
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [columnVisibility, setColumnVisibility] = useState<VisibilityState>({})
  const [rowSelection, setRowSelection] = useState({})
  const [globalFilter, setGlobalFilter] = useState("")

  const globalUserFilter: FilterFn<AdminUser> = (row, _columnId, value) => {
    const query = String(value).trim().toLowerCase()
    if (query.length === 0) return true

    const user = row.original
    return [
      getUserDisplayName(user),
      user.email,
      getUserRole(user),
      getUserStatus(user),
      getUserAccess(user),
      getUserAuth(user),
    ].some((field) => field.toLowerCase().includes(query))
  }

  const columns = useMemo<ColumnDef<AdminUser>[]>(() => [
    {
      id: "select",
      header: ({ table }) => (
        <div className="flex items-center justify-center px-2">
          <Checkbox
            checked={
              table.getIsAllPageRowsSelected() ||
              (table.getIsSomePageRowsSelected() && "indeterminate")
            }
            onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
            aria-label="Select all"
          />
        </div>
      ),
      cell: ({ row }) => (
        <div className="flex items-center justify-center px-2">
          <Checkbox
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(!!value)}
            aria-label="Select row"
          />
        </div>
      ),
      enableSorting: false,
      enableHiding: false,
      size: 50,
    },
    {
      accessorFn: getUserDisplayName,
      id: "user",
      header: "User",
      cell: ({ row }) => {
        const user = row.original
        return (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs font-medium">
                {getUserInitials(user)}
              </AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-col">
              <span className="truncate font-medium">{getUserDisplayName(user)}</span>
              <span className="truncate text-sm text-muted-foreground">{user.email}</span>
            </div>
          </div>
        )
      },
    },
    {
      accessorFn: getUserRole,
      id: "role",
      header: "Platform role",
      cell: ({ row }) => {
        const role = row.getValue("role") as string
        return (
          <Badge variant="secondary" className={getRoleColor(role)}>
            {role}
          </Badge>
        )
      },
      filterFn: exactAdminUserFilter,
    },
    {
      accessorFn: getUserAccess,
      id: "access",
      header: "Platform privileges",
      cell: ({ row }) => <span className="text-sm font-medium">{row.getValue("access") as string}</span>,
      filterFn: platformPrivilegeFilter,
    },
    {
      accessorFn: getUserStatus,
      id: "status",
      header: "Status",
      cell: ({ row }) => {
        const status = row.getValue("status") as string
        return (
          <Badge variant="secondary" className={getStatusColor(status)}>
            {status}
          </Badge>
        )
      },
      filterFn: exactAdminUserFilter,
    },
    {
      accessorFn: (user) => (user.twoFactorEnabled ? "Enabled" : "Not enabled"),
      id: "twoFactor",
      header: "2FA",
      cell: ({ row }) => {
        const enabled = row.original.twoFactorEnabled
        return (
          <span className="inline-flex items-center gap-2 text-sm">
            {enabled ? <ShieldCheck className="size-4 text-primary" /> : <ShieldX className="size-4 text-muted-foreground" />}
            {enabled ? "Enabled" : "Not enabled"}
          </span>
        )
      },
    },
    {
      accessorFn: getUserAuth,
      id: "auth",
      header: "Auth",
      cell: ({ row }) => <span className="text-sm">{row.getValue("auth") as string}</span>,
    },
    {
      accessorFn: (user) => user.createdAt,
      id: "joined",
      header: "Joined",
      cell: ({ row }) => <span className="text-sm">{formatDate(row.original.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "Actions",
      cell: ({ row }) => {
        const user = row.original
        const disabled = mutationPending
        return (
          <div className="flex items-center justify-end gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 cursor-pointer" disabled={disabled}>
                  <EllipsisVertical className="size-4" />
                  <span className="sr-only">User actions for {user.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {user.isAdmin ? (
                  <DropdownMenuItem className="cursor-pointer" disabled={disabled} onSelect={() => onRevokeAdmin(user)}>
                    <UserRoundX className="mr-2 size-4" />
                    Revoke platform administrator
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="cursor-pointer" disabled={disabled} onSelect={() => onGrantAdmin(user)}>
                    <UserRoundCheck className="mr-2 size-4" />
                    Grant platform administrator
                  </DropdownMenuItem>
                )}
                {user.canUseAI ? (
                  <DropdownMenuItem className="cursor-pointer" disabled={disabled || user.isAdmin} onSelect={() => onRevokeUseAI(user)}>
                    <UserRoundX className="mr-2 size-4" />
                    Revoke Use AI privilege
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="cursor-pointer" disabled={disabled || user.isAdmin} onSelect={() => onGrantUseAI(user)}>
                    <UserRoundCog className="mr-2 size-4" />
                    Grant Use AI privilege
                  </DropdownMenuItem>
                )}
                {user.canCreateVault ? (
                  <DropdownMenuItem className="cursor-pointer" disabled={disabled || user.isAdmin} onSelect={() => onRevokeCreateVaults(user)}>
                    <UserRoundX className="mr-2 size-4" />
                    Revoke create vaults without approval
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="cursor-pointer" disabled={disabled || user.isAdmin} onSelect={() => onGrantCreateVaults(user)}>
                    <UserRoundCog className="mr-2 size-4" />
                    Grant create vaults without approval
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                {user.disabledAt ? (
                  <DropdownMenuItem className="cursor-pointer" disabled={disabled} onSelect={() => onEnableUser(user)}>
                    <UserRoundCheck className="mr-2 size-4" />
                    Re-enable user
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem
                    variant="destructive"
                    className="cursor-pointer"
                    disabled={disabled}
                    onSelect={() => onDisableUser(user)}
                  >
                    <UserRoundX className="mr-2 size-4" />
                    Disable user
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )
      },
      enableSorting: false,
      enableHiding: false,
    },
  ], [
    mutationPending,
    onDisableUser,
    onEnableUser,
    onGrantAdmin,
    onGrantCreateVaults,
    onGrantUseAI,
    onRevokeAdmin,
    onRevokeCreateVaults,
    onRevokeUseAI,
  ])

  const table = useReactTable({
    data: users,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onGlobalFilterChange: setGlobalFilter,
    globalFilterFn: globalUserFilter,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
      globalFilter,
    },
  })

  const roleFilter = table.getColumn("role")?.getFilterValue() as string
  const privilegeFilterValue = table.getColumn("access")?.getFilterValue()
  const privilegeFilters = isPlatformPrivilegeFilters(privilegeFilterValue)
    ? privilegeFilterValue
    : emptyPlatformPrivilegeFilters
  const statusFilter = table.getColumn("status")?.getFilterValue() as string
  const setPrivilegeFilter = (nextFilters: PlatformPrivilegeFilters) => {
    table.getColumn("access")?.setFilterValue(
      hasActivePrivilegeFilter(nextFilters) ? nextFilters : undefined
    )
  }
  const columnLabel = (id: string): ReactNode => {
    const labels: Record<string, string> = {
      user: "User",
      role: "Platform role",
      access: "Platform privileges",
      status: "Status",
      twoFactor: "2FA",
      auth: "Auth",
      joined: "Joined",
    }
    return labels[id] ?? id
  }

  return (
    <div className="w-full space-y-4">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center space-x-2">
          <div className="relative max-w-sm flex-1">
            <Search className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search users..."
              value={globalFilter ?? ""}
              onChange={(event) => setGlobalFilter(String(event.target.value))}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="icon" aria-label="Refresh users" disabled={isLoading} onClick={() => void onRetry()}>
            <RefreshCw className={isLoading ? "size-4 animate-spin" : "size-4"} />
          </Button>
        </div>
        <div className="flex items-center space-x-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild id="column-visibility">
              <Button variant="outline" className="cursor-pointer">
                Columns <ChevronDown className="ml-2 size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) => column.toggleVisibility(!!value)}
                  >
                    {columnLabel(column.id)}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <UserFormDialog disabled={mutationPending} onInviteUser={onInviteUser} />
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="role-filter" className="text-sm font-medium">
              Platform role
            </Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  asChild
                  variant="outline"
                  className="h-10 w-full justify-between px-3 font-normal"
                >
                  <div id="role-filter">
                    <span className="flex min-w-0 items-center gap-2">
                      <UserRound className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{roleFilter || "Any role"}</span>
                    </span>
                    <span className="ml-2 flex shrink-0 items-center gap-1">
                      {roleFilter ? (
                        <button
                          type="button"
                          aria-label="Clear platform role filter"
                          className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          onPointerDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            table.getColumn("role")?.setFilterValue(undefined)
                          }}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            table.getColumn("role")?.setFilterValue(undefined)
                          }}
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : null}
                      <ChevronDown className="size-4 text-muted-foreground" />
                    </span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={6} className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-md p-2 shadow-lg">
                <DropdownMenuLabel className="px-2 pb-2 pt-1 text-sm font-medium">
                  Platform role
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={roleFilter || ""}
                  onValueChange={(value) => table.getColumn("role")?.setFilterValue(value || undefined)}
                >
                  <DropdownMenuRadioItem value="Administrator" className="cursor-pointer py-2">
                    Administrator
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="Member" className="cursor-pointer py-2">
                    Member
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <Label className="text-sm font-medium">
              Platform privileges
            </Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  asChild
                  variant="outline"
                  className="h-10 w-full justify-between px-3 font-normal"
                >
                  <div>
                    <span className="flex min-w-0 items-center gap-2">
                      <Shield className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{getPrivilegeFilterLabel(privilegeFilters)}</span>
                    </span>
                    <span className="ml-2 flex shrink-0 items-center gap-1">
                      {hasActivePrivilegeFilter(privilegeFilters) ? (
                        <button
                          type="button"
                          aria-label="Clear platform privileges filter"
                          className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          onPointerDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            setPrivilegeFilter(emptyPlatformPrivilegeFilters)
                          }}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            setPrivilegeFilter(emptyPlatformPrivilegeFilters)
                          }}
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : null}
                      <ChevronDown className="size-4 text-muted-foreground" />
                    </span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={6} className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-md p-2 shadow-lg">
                <DropdownMenuLabel className="px-2 pb-2 pt-1 text-sm font-medium">
                  Platform privileges
                </DropdownMenuLabel>
                <DropdownMenuCheckboxItem
                  checked={privilegeFilters.useAI}
                  className="cursor-pointer py-2"
                  onCheckedChange={(checked) =>
                    setPrivilegeFilter({
                      ...privilegeFilters,
                      useAI: checked === true,
                    })
                  }
                  onSelect={(event) => event.preventDefault()}
                >
                  <Sparkles className="size-4 text-muted-foreground" />
                  Use AI
                </DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem
                  checked={privilegeFilters.createVaults}
                  className="cursor-pointer py-2"
                  onCheckedChange={(checked) =>
                    setPrivilegeFilter({
                      ...privilegeFilters,
                      createVaults: checked === true,
                    })
                  }
                  onSelect={(event) => event.preventDefault()}
                >
                  <Folder className="size-4 text-muted-foreground" />
                  Create vaults without approval
                </DropdownMenuCheckboxItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>

          <div className="space-y-2">
            <Label htmlFor="status-filter" className="text-sm font-medium">
              Status
            </Label>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  asChild
                  variant="outline"
                  className="h-10 w-full justify-between px-3 font-normal"
                >
                  <div id="status-filter">
                    <span className="flex min-w-0 items-center gap-2">
                      <span
                        className={
                          statusFilter === "Active"
                            ? "size-2.5 shrink-0 rounded-full bg-primary"
                            : statusFilter === "Disabled"
                              ? "size-2.5 shrink-0 rounded-full bg-muted-foreground"
                              : "size-2.5 shrink-0 rounded-full border border-muted-foreground/50"
                        }
                      />
                      <span className="truncate">{statusFilter || "Any status"}</span>
                    </span>
                    <span className="ml-2 flex shrink-0 items-center gap-1">
                      {statusFilter ? (
                        <button
                          type="button"
                          aria-label="Clear status filter"
                          className="rounded-sm p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                          onPointerDown={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            table.getColumn("status")?.setFilterValue(undefined)
                          }}
                          onClick={(event) => {
                            event.preventDefault()
                            event.stopPropagation()
                            table.getColumn("status")?.setFilterValue(undefined)
                          }}
                        >
                          <X className="size-3.5" />
                        </button>
                      ) : null}
                      <ChevronDown className="size-4 text-muted-foreground" />
                    </span>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" sideOffset={6} className="w-[var(--radix-dropdown-menu-trigger-width)] rounded-md p-2 shadow-lg">
                <DropdownMenuLabel className="px-2 pb-2 pt-1 text-sm font-medium">
                  Status
                </DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={statusFilter || ""}
                  onValueChange={(value) => table.getColumn("status")?.setFilterValue(value || undefined)}
                >
                  <DropdownMenuRadioItem value="Active" className="cursor-pointer py-2">
                    Active
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="Disabled" className="cursor-pointer py-2">
                    Disabled
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
      </div>

      {error ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">
          <span>{error.message}</span>
          <Button type="button" variant="outline" size="sm" onClick={() => void onRetry()}>
            Retry
          </Button>
        </div>
      ) : null}

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={table.getVisibleFlatColumns().length} className="h-24 text-center">
                  Loading users...
                </TableCell>
              </TableRow>
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={table.getVisibleFlatColumns().length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-between space-x-2 py-4">
        <div className="flex items-center space-x-2">
          <Label htmlFor="page-size" className="text-sm font-medium">
            Show
          </Label>
          <Select
            value={`${table.getState().pagination.pageSize}`}
            onValueChange={(value) => {
              table.setPageSize(Number(value))
            }}
          >
            <SelectTrigger className="w-20 cursor-pointer" id="page-size">
              <SelectValue placeholder={table.getState().pagination.pageSize} />
            </SelectTrigger>
            <SelectContent side="top">
              {[10, 20, 30, 40, 50].map((pageSize) => (
                <SelectItem key={pageSize} value={`${pageSize}`}>
                  {pageSize}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="hidden flex-1 text-sm text-muted-foreground sm:block">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div className="flex items-center space-x-6 lg:space-x-8">
          <div className="hidden items-center space-x-2 sm:flex">
            <p className="text-sm font-medium">Page</p>
            <strong className="text-sm">
              {table.getPageCount() === 0 ? 0 : table.getState().pagination.pageIndex + 1} of{" "}
              {table.getPageCount()}
            </strong>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
              className="cursor-pointer"
            >
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
              className="cursor-pointer"
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
