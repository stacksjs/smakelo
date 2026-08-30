import { db } from '@stacksjs/database'
import { config } from '@stacksjs/config'

/**
 * Taking the money.
 *
 * Sandbox only, always. Smakelo will never process a real payment: the
 * businesses that can be ordered from are invented, so a live key here would
 * charge a real card on behalf of a restaurant that does not exist. The guard
 * below refuses a live secret key outright rather than trusting configuration
 * to stay right.
 *
 * The intent is created through `@stacksjs/payments`, which wraps the Stripe
 * SDK with the framework's lazy client and idempotency helpers, so this file
 * says what Smakelo wants and nothing about how Stripe is reached.
 */

export interface PaymentSetup {
  /** Whether a payment can be attempted at all. */
  configured: boolean
  publishableKey: string
  clientSecret?: string
  /** Cents, for the sandbox badge to state what would be charged. */
  amountCents?: number
  currency?: string
  reason?: string
}

/**
 * A test key, and only a test key.
 *
 * Pure and exported so it can be tested directly. This is the one rule in the
 * app that must never quietly stop working: everything else in this file would
 * work perfectly well against a live Stripe account, and the only thing
 * standing between demonstrating a checkout and charging a stranger for food
 * from a restaurant that does not exist is this string comparison.
 */
export function assessKeys(secret: string, publishable: string): { secret: string, publishable: string } | { reason: string } {
  if (!secret || !publishable)
    return { reason: 'No payment provider is configured.' }

  if (secret.startsWith('sk_live_') || publishable.startsWith('pk_live_'))
    return { reason: 'Smakelo refuses live Stripe keys. This is a demonstration and must never take a real payment.' }

  if (!secret.startsWith('sk_test_') || !publishable.startsWith('pk_test_'))
    return { reason: 'Those do not look like Stripe test keys.' }

  return { secret, publishable }
}

function sandboxKeys(): { secret: string, publishable: string } | { reason: string } {
  const payment = config.payment as Record<string, any> | undefined

  return assessKeys(
    String(payment?.stripe?.secretKey ?? ''),
    String(payment?.stripe?.publishableKey ?? ''),
  )
}

/**
 * Prepare a payment for an order that has already been priced and stored.
 *
 * The amount comes from the order row, never from the request: the client
 * chooses what to buy and the server decides what it costs, which is the same
 * rule the pricing code follows and the reason it is worth repeating here.
 */
export async function preparePayment(orderId: number): Promise<PaymentSetup> {
  const keys = sandboxKeys()

  const order = await db.selectFrom('orders')
    .where('id', '=', Number(orderId))
    .select(['id', 'uuid', 'total_amount', 'currency', 'status'])
    .executeTakeFirst() as Record<string, unknown> | undefined

  if (!order)
    return { configured: false, publishableKey: '', reason: 'No such order.' }

  const amountCents = Number(order.total_amount ?? 0)
  const currency = String(order.currency ?? 'usd')

  if ('reason' in keys)
    return { configured: false, publishableKey: '', amountCents, currency, reason: keys.reason }

  const { stripe, stacksIdempotencyKey } = await import('@stacksjs/payments')

  const intent = await stripe.paymentIntents.create({
    amount: amountCents,
    currency,
    // The order's own uuid keys the intent, so a customer who reloads the
    // checkout does not end up with two intents against one order.
    metadata: { orderId: String(order.id), orderUuid: String(order.uuid) },
    automatic_payment_methods: { enabled: true },
  }, {
    idempotencyKey: stacksIdempotencyKey('smakelo.order.intent', String(order.uuid)),
  })

  await recordPayment(Number(order.id), amountCents, currency, String(intent.id), 'pending')

  return {
    configured: true,
    publishableKey: keys.publishable,
    clientSecret: String(intent.client_secret ?? ''),
    amountCents,
    currency,
  }
}

/**
 * What the checkout should tell the customer before they commit.
 *
 * Called with no order, so the page can say what will happen before anything
 * has been created. A checkout that stays silent about being a sandbox until
 * after the button is pressed has told the person nothing useful.
 */
export function paymentNotice(): { sandbox: boolean, message: string } {
  const keys = sandboxKeys()

  if ('reason' in keys) {
    return {
      sandbox: false,
      message: 'No payment provider is configured, so this order is recorded without one. Everything else about it is real: the prices, the fee split, and the ledger rows.',
    }
  }

  return {
    sandbox: true,
    message: 'Stripe test mode. Use card 4242 4242 4242 4242 with any future expiry. No money moves, and nothing here can be bought.',
  }
}

/**
 * Write the payment row.
 *
 * The framework's `payments` table already models this, so Smakelo uses it
 * rather than bolting a reference column onto `orders`: a payment has a status
 * of its own, it can be refunded, and an order that was paid twice is a thing
 * worth being able to see.
 */
async function recordPayment(
  orderId: number,
  amountCents: number,
  currency: string,
  transactionId: string,
  status: 'pending' | 'succeeded' | 'failed',
): Promise<void> {
  const existing = await db.selectFrom('payments')
    .where('transaction_id', '=', transactionId)
    .select(['id'])
    .executeTakeFirst() as { id: number } | undefined

  if (existing) {
    await db.updateTable('payments')
      .set({ status } as never)
      .where('id', '=', Number(existing.id))
      .execute()

    return
  }

  const order = await db.selectFrom('orders')
    .where('id', '=', orderId)
    .select(['customer_id'])
    .executeTakeFirst() as { customer_id?: number } | undefined

  await db.insertInto('payments').values({
    uuid: crypto.randomUUID(),
    order_id: orderId,
    customer_id: order?.customer_id ?? null,
    amount: amountCents,
    currency,
    method: 'creditCard',
    status,
    payment_provider: 'stripe',
    transaction_id: transactionId,
    reference_number: '',
    notes: 'Stripe test mode. No money moved.',
  } as never).executeTakeFirst()
}

/**
 * Mark a payment settled.
 *
 * Called from the client once Stripe confirms, which is enough for a
 * demonstration and would not be enough for a real one: a client can lie about
 * having paid. A live deployment settles on the `payment_intent.succeeded`
 * webhook, which the framework already routes through `onWebhookEvent`, and
 * treats this path as a hint that the webhook is worth waiting for.
 */
export async function confirmPayment(transactionId: string): Promise<{ ok: boolean, reason?: string }> {
  const keys = sandboxKeys()

  if ('reason' in keys)
    return { ok: false, reason: keys.reason }

  const { stripe } = await import('@stacksjs/payments')

  // Asked of Stripe rather than believed from the browser. The client tells us
  // which intent to look at; Stripe tells us whether it was paid.
  const intent = await stripe.paymentIntents.retrieve(transactionId)

  const payment = await db.selectFrom('payments')
    .where('transaction_id', '=', transactionId)
    .select(['id', 'order_id'])
    .executeTakeFirst() as { id: number, order_id: number } | undefined

  if (!payment)
    return { ok: false, reason: 'No payment for that intent.' }

  const paid = intent.status === 'succeeded'

  await db.updateTable('payments')
    .set({ status: paid ? 'succeeded' : 'failed' } as never)
    .where('id', '=', Number(payment.id))
    .execute()

  return paid ? { ok: true } : { ok: false, reason: `Stripe says the payment is ${intent.status}.` }
}

/** What a customer's order shows about its payment. */
export async function paymentFor(orderId: number): Promise<{ status: string, amountCents: number, provider: string } | null> {
  const row = await db.selectFrom('payments')
    .where('order_id', '=', Number(orderId))
    .orderBy('id', 'desc')
    .selectAll()
    .executeTakeFirst() as Record<string, unknown> | undefined

  if (!row)
    return null

  return {
    status: String(row.status),
    amountCents: Number(row.amount ?? 0),
    provider: String(row.payment_provider ?? ''),
  }
}
