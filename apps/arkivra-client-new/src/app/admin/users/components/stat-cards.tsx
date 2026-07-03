import { Card, CardContent } from "@/components/ui/card"
import { CheckCircle2, ShieldCheck, UserRoundPlus, Users } from "lucide-react"
import type { AdminUser } from "../admin-users.api"

interface StatCardsProps {
  users: AdminUser[]
}

export function StatCards({ users }: StatCardsProps) {
  const metrics = [
    {
      title: "Total Users",
      current: users.length.toLocaleString(),
      icon: Users,
    },
    {
      title: "Admins",
      current: users.filter((user) => user.isAdmin).length.toLocaleString(),
      icon: ShieldCheck,
    },
    {
      title: "Active Users",
      current: users.filter((user) => user.disabledAt === null).length.toLocaleString(),
      icon: CheckCircle2,
    },
    {
      title: "Vault Creators",
      current: users.filter((user) => user.canCreateVault).length.toLocaleString(),
      icon: UserRoundPlus,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {metrics.map((metric) => {
        const Icon = metric.icon

        return (
          <Card key={metric.title} className="border">
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <Icon className="size-6 text-muted-foreground" />
              </div>

              <div className="space-y-2">
                <p className="flex items-baseline gap-2 text-sm font-medium text-muted-foreground">
                  <span>{metric.title}:</span>
                  <span className="text-2xl font-bold text-foreground">{metric.current}</span>
                </p>
              </div>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
