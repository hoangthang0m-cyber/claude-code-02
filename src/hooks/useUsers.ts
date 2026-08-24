"use client"

import * as React from "react"

import { subscribeToUsers } from "@/services/users.service"
import type { AppUser } from "@/types/user"

export function useUsers() {
  const [users, setUsers] = React.useState<AppUser[]>([])
  const [loading, setLoading] = React.useState(true)

  React.useEffect(() => {
    const unsubscribe = subscribeToUsers((items) => {
      setUsers(items)
      setLoading(false)
    })
    return unsubscribe
  }, [])

  return { users, loading }
}
