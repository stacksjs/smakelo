import { db, sqliteWriteOptions } from '@stacksjs/database/runtime'
import { offerReadyDeliveries, withdrawCourierOffer } from '../Delivery/dispatch'

export async function courierCoverage() {
  const markets = await db.unsafe(`
    SELECT markets.id, markets.name, markets.is_active AS active,
      (SELECT COUNT(*) FROM courier_markets
        JOIN couriers ON couriers.id = courier_markets.courier_id
        WHERE courier_markets.market_id = markets.id AND couriers.user_id IS NOT NULL
          AND couriers.status IN ('active', 'on_delivery')) AS onShift,
      (SELECT COUNT(*) FROM orders
        JOIN businesses ON businesses.id = orders.business_id
        WHERE businesses.market_id = markets.id AND businesses.self_delivery = 0
          AND orders.order_type = 'DELIVERY' AND orders.status = 'SHIPPED'
          AND NOT EXISTS (
            SELECT 1 FROM delivery_stops WHERE delivery_stops.order_id = orders.id
          )) AS waiting
    FROM markets ORDER BY markets.is_active DESC, markets.name
  `).execute() as Array<{ id: number, name: string, active: number, onShift: number, waiting: number }>

  const couriers = await db.selectFrom('couriers')
    .where('user_id', 'is not', null)
    .orderBy('name')
    .select(['id', 'name'])
    .execute() as Array<{ id: number, name: string }>
  const memberships = await db.selectFrom('courier_markets')
    .select(['courier_id', 'market_id'])
    .execute() as Array<{ courier_id: number, market_id: number }>

  return {
    markets,
    couriers: couriers.map(courier => ({
      ...courier,
      marketIds: memberships.filter(row => row.courier_id === courier.id).map(row => row.market_id),
    })),
  }
}

export async function setCourierMarket(courierId: number, marketId: number, enabled: boolean): Promise<boolean> {
  return await db.transaction(async () => {
    const courier = await db.selectFrom('couriers')
      .where('id', '=', courierId)
      .where('user_id', 'is not', null)
      .select('id')
      .executeTakeFirst()
    const market = await db.selectFrom('markets').where('id', '=', marketId)
      .select(['id', 'is_active'])
      .executeTakeFirst()

    if (!courier || !market || (enabled && Number(market.is_active) !== 1))
      return false

    if (enabled) {
      const existing = await db.selectFrom('courier_markets')
        .where('courier_id', '=', courierId).where('market_id', '=', marketId)
        .select('id').executeTakeFirst()

      if (!existing) {
        await db.insertInto('courier_markets').values({ courier_id: courierId, market_id: marketId }).execute()
        await offerReadyDeliveries()
      }
    }
    else {
      await db.deleteFrom('courier_markets').where('courier_id', '=', courierId).where('market_id', '=', marketId).execute()
      const releasedOrderId = await withdrawCourierOffer(courierId, marketId)

      if (releasedOrderId !== undefined)
        await offerReadyDeliveries(releasedOrderId)
    }

    return true
  }, sqliteWriteOptions())
}
