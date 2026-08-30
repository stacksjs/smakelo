import { db } from '@stacksjs/database'
import { customerForVisitor, existingCustomerFor } from '../Visitor/identity'

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
  latitude: number
  longitude: number
  notes: string
  isDefault: boolean
}

export async function addressesFor(visitorToken: unknown): Promise<AddressRow[]> {
  const customerId = await existingCustomerFor(visitorToken)

  if (!customerId)
    return []

  const rows = await db.selectFrom('addresses')
    .where('customer_id', '=', customerId)
    .orderBy('id', 'desc')
    .selectAll()
    .execute() as Array<Record<string, unknown>>

  return rows.map(shape).sort((a, b) => Number(b.isDefault) - Number(a.isDefault))
}

export interface SaveAddressInput {
  visitorToken: unknown
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

  const customerId = await customerForVisitor(input.visitorToken)

  if (!customerId)
    return { ok: false, reason: 'Could not identify this browser.' }

  const existing = await db.selectFrom('addresses')
    .where('customer_id', '=', customerId)
    .select(['id'])
    .execute() as Array<{ id: number }>

  const position = coordinates(input)

  await db.insertInto('addresses').values({
    uuid: crypto.randomUUID(),
    customer_id: customerId,
    label: String(input.label ?? 'Home').trim().slice(0, 40) || 'Home',
    line: line.slice(0, 255),
    city: String(input.city ?? 'Los Angeles').slice(0, 120),
    postal_code: String(input.postalCode ?? '').slice(0, 20),
    latitude: position.latitude,
    longitude: position.longitude,
    notes: String(input.notes ?? '').slice(0, 300),
    // The first one saved is the default, because a person with one address
    // should never have to choose it.
    is_default: existing.length === 0 ? 1 : 0,
  } as never).executeTakeFirst()

  const created = await db.selectFrom('addresses')
    .where('customer_id', '=', customerId)
    .orderBy('id', 'desc')
    .selectAll()
    .executeTakeFirst() as Record<string, unknown> | undefined

  return { ok: true, address: created ? shape(created) : undefined }
}

export async function removeAddress(id: number, visitorToken: unknown): Promise<{ ok: boolean, reason?: string }> {
  const customerId = await existingCustomerFor(visitorToken)

  if (!customerId)
    return { ok: false, reason: 'Could not identify this browser.' }

  const row = await db.selectFrom('addresses')
    .where('id', '=', Number(id))
    .select(['id', 'customer_id'])
    .executeTakeFirst() as { id: number, customer_id: number } | undefined

  if (!row || Number(row.customer_id) !== customerId)
    return { ok: false, reason: 'That address belongs to someone else.' }

  await db.deleteFrom('addresses').where('id', '=', Number(id)).execute()

  return { ok: true }
}

/**
 * Turn an address into a position.
 *
 * There is no geocoder here, and adding one would mean sending a stranger's
 * home address to a third party so a demonstration could price a delivery
 * nobody will make. Los Angeles is the only market, so an unplaced address sits
 * at the market centre and the fee comes out at the base rate: honest, and
 * visibly a flat rate rather than a fake precise one.
 */
function coordinates(input: SaveAddressInput): { latitude: number, longitude: number } {
  const latitude = Number(input.latitude)
  const longitude = Number(input.longitude)

  const placed = Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && Math.abs(latitude) <= 90
    && Math.abs(longitude) <= 180
    && !(latitude === 0 && longitude === 0)

  return placed
    ? { latitude, longitude }
    : { latitude: 34.0195, longitude: -118.4912 }
}

function shape(row: Record<string, unknown>): AddressRow {
  return {
    id: Number(row.id),
    label: String(row.label ?? 'Home'),
    line: String(row.line ?? ''),
    city: String(row.city ?? ''),
    postalCode: String(row.postal_code ?? ''),
    latitude: Number(row.latitude ?? 0),
    longitude: Number(row.longitude ?? 0),
    notes: String(row.notes ?? ''),
    isDefault: Number(row.is_default) === 1,
  }
}
