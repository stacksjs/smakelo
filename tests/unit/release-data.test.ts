import { Database } from 'bun:sqlite'
import { expect, test } from 'bun:test'
import { withDisposableDatabase } from '@stacksjs/testing'
import { tsCloud } from '../../config/cloud'

test('production startup initializes empty data and preserves marketplace records on the next release', async () => {
  const dataSteps = tsCloud.sites?.main?.preStart?.filter(step => /\b(?:migrate(?::fresh)?|seed:demo)\b/.test(step)) ?? []

  expect(dataSteps).toHaveLength(2)

  await withDisposableDatabase('sqlite', async ({ path, env }) => {
    if (!path)
      throw new Error('A file-backed disposable database is required.')

    async function startRelease(): Promise<void> {
      for (const step of dataSteps) {
        const args = step.split(' ').slice(1)
        const child = Bun.spawn([process.execPath, ...args], {
          env: { ...process.env, ...env, APP_ENV: 'test', DB_DATABASE_PATH: path },
          stdout: 'pipe',
          stderr: 'pipe',
        })
        const [status, stdout, stderr] = await Promise.all([
          child.exited,
          new Response(child.stdout).text(),
          new Response(child.stderr).text(),
        ])

        if (status !== 0)
          throw new Error(`${step} failed with exit code ${status}\n${stdout}\n${stderr}`)
      }
    }

    await startRelease()

    const before = readMarketplace(path)
    expect(before.orders.length).toBeGreaterThan(0)
    expect(before.tables.length).toBeGreaterThan(0)

    using database = new Database(path)
    const listing = database.query<{ id: number }, []>('SELECT id FROM businesses WHERE is_partner = 0 LIMIT 1').get()
    if (!listing)
      throw new Error('Expected a seeded business listing.')

    database.query('UPDATE businesses SET deleted_at = ? WHERE id = ?')
      .run('2026-01-01T00:00:00.000Z', listing.id)
    database.query('INSERT INTO claims (uuid, business_id, status, claimant_name, claimant_email, message) VALUES (?, ?, ?, ?, ?, ?)')
      .run(crypto.randomUUID(), listing.id, 'pending', 'Demo claimant', 'claimant@example.invalid', 'Please correct the opening hours.')

    const curated = readMarketplace(path)
    expect(curated.claims).toHaveLength(1)
    expect(curated.hidden).toHaveLength(1)

    await startRelease()

    expect(readMarketplace(path)).toEqual(curated)
  })
}, 120_000)

function readMarketplace(path: string) {
  using database = new Database(path, { readonly: true })

  return {
    orders: database.query('SELECT id, tracking_token, status, total_amount FROM orders ORDER BY id').all(),
    tables: database.query('SELECT id, qr_token FROM tables ORDER BY id').all(),
    claims: database.query('SELECT id, uuid, business_id, status FROM claims ORDER BY id').all(),
    hidden: database.query('SELECT id, deleted_at FROM businesses WHERE deleted_at IS NOT NULL ORDER BY id').all(),
  }
}
