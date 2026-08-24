"use client"

import * as React from "react"

import { subscribeToUsers } from "@/services/users.service"
import type { AppUser } from "@/types/user"

export function useUsers() {
  const [users, setUsers] = React.useState<AppUser[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    const unsubscribe = subscribeToUsers(
      (items) => {
        setUsers(items)
        setError(null)
        setLoading(false)
      },
      (err) => {
        console.error("subscribeToUsers failed", err)
        setError(err.message)
        setLoading(false)
      }
    )
    return unsubscribe
  }, [])

  return { users, loading, error }
}
