import type { Access } from 'payload'

export type UserRole = 'user' | 'admin' | 'super_admin'

type UserWithRole = {
  role?: UserRole
}

export const hasRole = (roles: UserRole[]): Access => {
  return ({ req }) => {
    const user = req.user as UserWithRole | null | undefined

    if (!user) {
      return false
    }

    return Boolean(user.role && roles.includes(user.role))
  }
}
