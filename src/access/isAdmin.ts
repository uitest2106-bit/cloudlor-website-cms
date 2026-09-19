import { hasRole } from './hasRole'

export const isAdmin = hasRole(['admin', 'super_admin'])
