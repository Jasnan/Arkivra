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
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldX,
  UserRoundCheck,
  UserRoundCog,
  UserRoundX,
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
  return user.isAdmin ? "Admin" : "Member"
}

function getUserStatus(user: AdminUser) {
  return user.disabledAt === null ? "Active" : "Disabled"
}

function getUserAccess(user: AdminUser) {
  if (user.isAdmin) return "All vaults"
  if (user.canCreateVault) return "Can create vaults"
  return "Member access"
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

function formatDate(value: string | null | undefined) {
  if (!value) return "Unknown"

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return "Unknown"

  return new Intl.DateTimeFormat(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date)
}

function getStatusColor(status: string) {
  switch (status) {
    case "Active":
      return "text-green-600 bg-green-50 dark:text-green-400 dark:bg-green-900/20"
    case "Disabled":
      return "text-orange-600 bg-orange-50 dark:text-orange-400 dark:bg-orange-900/20"
    default:
      return "text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-900/20"
  }
}

function getRoleColor(role: string) {
  switch (role) {
    case "Admin":
      return "text-red-600 bg-red-50 dark:text-red-400 dark:bg-red-900/20"
    case "Member":
      return "text-blue-600 bg-blue-50 dark:text-blue-400 dark:bg-blue-900/20"
    default:
      return "text-gray-600 bg-gray-50 dark:text-gray-400 dark:bg-gray-900/20"
  }
}

const exactAdminUserFilter: FilterFn<AdminUser> = (row, columnId, value) => {
  return row.getValue(columnId) === value
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
      header: "Role",
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
      header: "Access",
      cell: ({ row }) => <span className="text-sm font-medium">{row.getValue("access") as string}</span>,
      filterFn: exactAdminUserFilter,
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
            {enabled ? <ShieldCheck className="size-4 text-green-600" /> : <ShieldX className="size-4 text-muted-foreground" />}
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
                    Revoke admin
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="cursor-pointer" disabled={disabled} onSelect={() => onGrantAdmin(user)}>
                    <UserRoundCheck className="mr-2 size-4" />
                    Grant admin
                  </DropdownMenuItem>
                )}
                {user.canCreateVault ? (
                  <DropdownMenuItem className="cursor-pointer" disabled={disabled} onSelect={() => onRevokeCreateVaults(user)}>
                    <UserRoundX className="mr-2 size-4" />
                    Revoke vault creation
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem className="cursor-pointer" disabled={disabled} onSelect={() => onGrantCreateVaults(user)}>
                    <UserRoundCog className="mr-2 size-4" />
                    Allow vault creation
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
    onRevokeAdmin,
    onRevokeCreateVaults,
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
  const accessFilter = table.getColumn("access")?.getFilterValue() as string
  const statusFilter = table.getColumn("status")?.getFilterValue() as string
  const columnLabel = (id: string): ReactNode => {
    const labels: Record<string, string> = {
      user: "User",
      role: "Role",
      access: "Access",
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
          <UserFormDialog disabled={mutationPending} onInviteUser={onInviteUser} />
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-4 sm:gap-4">
        <div className="space-y-2">
          <Label htmlFor="role-filter" className="text-sm font-medium">
            Role
          </Label>
          <Select
            value={roleFilter || ""}
            onValueChange={(value) =>
              table.getColumn("role")?.setFilterValue(value === "all" ? "" : value)
            }
          >
            <SelectTrigger className="w-full cursor-pointer" id="role-filter">
              <SelectValue placeholder="Select Role" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Roles</SelectItem>
              <SelectItem value="Admin">Admin</SelectItem>
              <SelectItem value="Member">Member</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="access-filter" className="text-sm font-medium">
            Access
          </Label>
          <Select
            value={accessFilter || ""}
            onValueChange={(value) =>
              table.getColumn("access")?.setFilterValue(value === "all" ? "" : value)
            }
          >
            <SelectTrigger className="w-full cursor-pointer" id="access-filter">
              <SelectValue placeholder="Select Access" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Access</SelectItem>
              <SelectItem value="All vaults">All vaults</SelectItem>
              <SelectItem value="Can create vaults">Can create vaults</SelectItem>
              <SelectItem value="Member access">Member access</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="status-filter" className="text-sm font-medium">
            Status
          </Label>
          <Select
            value={statusFilter || ""}
            onValueChange={(value) =>
              table.getColumn("status")?.setFilterValue(value === "all" ? "" : value)
            }
          >
            <SelectTrigger className="w-full cursor-pointer" id="status-filter">
              <SelectValue placeholder="Select Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="Active">Active</SelectItem>
              <SelectItem value="Disabled">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="column-visibility" className="text-sm font-medium">
            Column Visibility
          </Label>
          <DropdownMenu>
            <DropdownMenuTrigger asChild id="column-visibility">
              <Button variant="outline" className="w-full cursor-pointer">
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
