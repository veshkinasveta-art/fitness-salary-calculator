export interface SheetRowIdentity {
  entityId: string
  revision: number
}

export function resolveSheetRowIndex(
  existingIds: readonly string[],
  entityId: string,
): number {
  return existingIds.findIndex((id) => id === entityId)
}

export function shouldWriteRevision(
  current: SheetRowIdentity | undefined,
  incoming: SheetRowIdentity,
): boolean {
  if (!current) return true
  if (current.entityId !== incoming.entityId) return true
  return incoming.revision >= current.revision
}
