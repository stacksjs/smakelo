import { db, sqliteWriteOptions } from '@stacksjs/database'
import { customerForBuyer, customerIdsForBuyer } from '../Visitor/identity'

/**
 * Where somebody's food goes.
 *
 * Saved because typing an address into a phone is the worst part of ordering
 * food, and because the delivery fee depends on where the box is going: an
 * order with no address is priced at a flat rate that is wrong for everybody.
 */

export interface AddressRow {
  id: number
  label: string
  line: string
  city: string
  postalCode: string
  latitude: number | null
  longitude: number | null
  notes: string
  isDefault: boolean
}

export async function addressesFor(visitorToken: unknown, userId?: number | null): Promise<AddressRow[]> {
  const customerIds = await customerIdsForBuyer(visitorToken, userId)

  if (customerIds.length === 0)
    return []

  const rows = await db.selectFrom('addresses')
    .where('customer_id', 'in', customerIds)
    .orderBy('is_default', 'desc')
    .orderBy('id', 'desc')
    .selectAll()
    .execute()

  // A buyer can import more than one guest profile, each with a past default.
  return rows.map((row, index) => ({ ...shape(row), isDefault: index === 0 }))
}

export interface SaveAddressInput {
  visitorToken: unknown
  userId?: number | null
  label: string
  line: string
  city?: string
  postalCode?: string
  latitude?: number
  longitude?: number
  notes?: string
}

export async function saveAddress(input: SaveAddressInput): Promise<{ ok: boolean, address?: AddressRow, reason?: string }> {
  const line = String(input.line ?? '').trim()

  if (line.length < 5)
    return { ok: false, reason: 'That is not enough of an address to find.' }

  return await db.transaction(async () => {
    const customerId = await customerForBuyer(input.visitorToken, input.userId)

    if (customerId === null)
      return { ok: false, reason: 'Could not identify this buyer.' }

    const customerIds = input.userId ? await customerIdsForBuyer(input.visitorToken, input.userId) : [customerId]
    const existing = await db.selectFrom('addresses')
      .where('customer_id', 'in', customerIds)
      .orderBy('is_default', 'desc')
      .orderBy('id', 'desc')
      .select(['id', 'is_default'])
      .executeTakeFirst()

    if (existing && Number(existing.is_default) !== 1) {
      await db.updateTable('addresses')
        .set({ is_default: 1 })
        .where('id', '=', Number(existing.id))
        .execute()
    }

    const position = coordinates(input)
    const created = await db.insertInto('addresses').values({
      uuid: crypto.randomUUID(),
      customer_id: customerId,
      label: String(input.label ?? 'Home').trim().slice(0, 40) || 'Home',
      line: line.slice(0, 255),
      city: String(input.city ?? '').slice(0, 120),
      postal_code: String(input.postalCode ?? '').slice(0, 20),
      latitude: position.latitude,
      longitude: position.longitude,
      notes: String(input.notes ?? '').slice(0, 300),
      is_default: existing ? 0 : 1,
    } as never).returningAll().executeTakeFirst()

    if (!created)
      throw new Error('The saved address could not be loaded.')

    return { ok: true, address: shape(created) }
  }, sqliteWriteOptions())
}

export async function removeAddress(id: number, visitorToken: unknown, userId?: number | null): Promise<boolean> {
  return await db.transaction(async () => {
    const customerIds = await customerIdsForBuyer(visitorToken, userId)

    if (customerIds.length === 0)
      return false

    const deleted = await db.deleteFrom('addresses')
      .where('id', '=', id)
      .where('customer_id', 'in', customerIds)
      .returning(['is_default'])
      .executeTakeFirst()

    if (!deleted)
      return false

    if (Number(deleted.is_default) === 1) {
      const next = await db.selectFrom('addresses')
        .where('customer_id', 'in', customerIds)
        .orderBy('is_default', 'desc')
        .orderBy('id', 'desc')
        .select(['id', 'is_default'])
        .executeTakeFirst()

      if (next && Number(next.is_default) !== 1) {
        await db.updateTable('addresses')
          .set({ is_default: 1 })
          .where('id', '=', Number(next.id))
          .execute()
      }
    }

    return true
  }, sqliteWriteOptions())
}

/** A typed address has no map position until one has been supplied. */
function coordinates(input: SaveAddressInput): { latitude: number | null, longitude: number | null } {
  const latitude = Number(input.latitude)
  const longitude = Number(input.longitude)

  const placed = Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90
    && Math.abs(longitude) <= 180
    && !(latitude === 0 && longitude === 0)

  return placed
    ? { latitude, longitude }
    : { latitude: null, longitude: null }
}

function shape(row: Record<string, unknown>): AddressRow {
  return {
    id: Number(row.id),
    label: String(row.label ?? 'Home'),
    line: String(row.line ?? ''),
    city: String(row.city ?? ''),
    postalCode: String(row.postal_code ?? ''),
    latitude: row.latitude == null ? null : Number(row.latitude),
    longitude: row.longitude == null ? null : Number(row.longitude),
    notes: String(row.notes ?? ''),
    isDefault: Number(row.is_default) === 1,
  }
}
