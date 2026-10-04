export type StudioRole = 'owner' | 'manager' | 'viewer'

export function canReadStudio(role: StudioRole) {
  return role === 'owner' || role === 'manager' || role === 'viewer'
}

export function canEditOperations(role: StudioRole) {
  return role === 'owner' || role === 'manager'
}

export function canManageMembers(role: StudioRole) {
  return role === 'owner'
}

export function canClosePeriod(role: StudioRole, online: boolean) {
  return canEditOperations(role) && online
}
