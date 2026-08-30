import { describe, expect, test } from 'bun:test'
import { assessKeys } from '../../app/Actions/Payment/checkout'

/*
 * Smakelo must never take a real payment.
 *
 * The businesses that can be ordered from are invented, so a live key would
 * mean charging a real card on behalf of a restaurant that does not exist.
 * Every other part of the checkout would work fine against a live account,
 * which is exactly why this check is worth a test of its own.
 */
describe('assessKeys', () => {
  test('accepts a matched pair of test keys', () => {
    const result = assessKeys('sk_test_abc123', 'pk_test_abc123')

    expect('reason' in result).toBe(false)
  })

  test('refuses a live secret key', () => {
    const result = assessKeys('sk_live_abc123', 'pk_test_abc123')

    expect('reason' in result).toBe(true)
    expect((result as { reason: string }).reason).toContain('refuses live Stripe keys')
  })

  test('refuses a live publishable key even when the secret is a test key', () => {
    // The publishable key is the one the browser sees. A live one here would
    // mount a real card form against a test intent, which fails confusingly
    // rather than safely.
    const result = assessKeys('sk_test_abc123', 'pk_live_abc123')

    expect('reason' in result).toBe(true)
  })

  test('refuses anything that is not recognisably a Stripe test key', () => {
    for (const pair of [['whatever', 'pk_test_abc'], ['sk_test_abc', 'whatever'], ['sk_', 'pk_']])
      expect('reason' in assessKeys(pair[0] as string, pair[1] as string)).toBe(true)
  })

  test('says so plainly when nothing is configured', () => {
    const result = assessKeys('', '')

    expect((result as { reason: string }).reason).toBe('No payment provider is configured.')
  })
})
