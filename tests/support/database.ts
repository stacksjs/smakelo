import { Database } from 'bun:sqlite'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { afterAll, afterEach, beforeAll } from 'bun:test'

/**
 * A database a test may write to, in the spirit of Laravel's RefreshDatabase.
 *
 * The suite had no way to exercise anything that reads a table. Tests that
 * needed rows either skipped the code that queries them or - worse, and this
 * actually happened - called the real query and asserted on what a developer's
 * seeded database happened to hold. Those pass here and return nothing on a CI
 * runner, so a privacy test failed on the runner over an empty database rather
 * than over the code, which is the least useful failure a suite can produce.
 *
 * `@stacksjs/testing` declares a `./database` subpath for exactly this and does
 * not ship the file - the export resolves to nothing in the installed package -
 * so this is the app's own until that lands upstream.
 *
 * The schema is the committed migrations, applied in order, so a test runs
 * against the shape production actually has rather than a hand-written fixture
 * that drifts from it. All 237 of them apply in about 140ms, and the result is
 * cached as a template and copied per file, so the cost is paid once a run.
 *
 * Usage:
 *
 *   const database = useDatabase()
 *
 *   test('…', async () => {
 *     database.insert('businesses', [aBusiness({ type: 'home_kitchen' })])
 *     …
 *   })
 *
 * Rows are cleared after each test, so no test can be made to pass by another
 * one's leftovers.
 */

const TESTING_DIR = 'storage/framework/testing'
const TEMPLATE = join(TESTING_DIR, 'schema.sqlite')

/**
 * The connection every test in this process shares.
 *
 * Set in tests/setup.ts, before anything imports `@stacksjs/database` -
 * config/database.ts reads `DB_DATABASE_PATH` when its module is evaluated, so
 * a path set later would be read by nobody. Per-process, because `bun test`
 * may run files in more than one.
 */
export function testDatabasePath(): string {
  const path = Bun.env.DB_DATABASE_PATH ?? join(TESTING_DIR, `test-${process.pid}.sqlite`)

  /*
   * Refuse to touch anything that is not ours.
   *
   * This helper copies a blank schema over its file and deletes it afterwards,
   * which is safe for a scratch database and catastrophic for any other. It
   * once pointed at `database/smakelo.sqlite` - `.env` sets DB_DATABASE_PATH,
   * the env plugin loads it before tests/setup.ts, and the guard there was
   * written to defer to an existing value - and emptied the development
   * database on the first run.
   *
   * So the path is checked rather than trusted. tests/setup.ts is expected to
   * have replaced it; if something replaced it back, this stops before any
   * file is written rather than after.
   */
  if (!resolve(path).startsWith(resolve(TESTING_DIR) + sep)) {
    throw new Error(
      `Refusing to use ${path} as a test database: it is outside ${TESTING_DIR}. `
      + 'tests/setup.ts sets DB_DATABASE_PATH; something has overwritten it.',
    )
  }

  return path
}

/**
 * The schema, built once and kept.
 *
 * Rebuilt whenever a migration is newer than the template, so adding one to
 * `database/migrations/` is all it takes - there is no second place to
 * remember to update, which is the only reason a cache like this is safe.
 */
function schemaTemplate(): string {
  mkdirSync(TESTING_DIR, { recursive: true })

  const migrations = readdirSync('database/migrations')
    .filter(file => file.endsWith('.sql'))
    .sort()

  const newest = migrations.reduce((latest, file) => {
    const changed = statSync(join('database/migrations', file)).mtimeMs

    return changed > latest ? changed : latest
  }, 0)

  const cached = fileChangedAt(TEMPLATE)

  if (cached !== null && cached >= newest)
    return TEMPLATE

  rmSync(TEMPLATE, { force: true })

  const database = new Database(TEMPLATE, { create: true })

  try {
    for (const file of migrations)
      database.exec(readFileSync(join('database/migrations', file), 'utf8'))
  }
  finally {
    database.close()
  }

  return TEMPLATE
}

function fileChangedAt(path: string): number | null {
  try {
    return statSync(path).mtimeMs
  }
  catch {
    return null
  }
}

export interface TestDatabase {
  /** Insert rows into a table, returning the ids sqlite assigned. */
  insert: (table: string, rows: Array<Record<string, unknown>>) => number[]
  /** Empty every table, keeping the schema. */
  truncate: () => void
  /** The open connection, for a test that needs to read one back. */
  connection: () => Database
}

/**
 * Give this test file a database of its own.
 *
 * Call at the top level of the file, once. The schema is created before the
 * first test and the rows are cleared after each one.
 */
export function useDatabase(): TestDatabase {
  const path = testDatabasePath()
  let connection: Database | null = null

  beforeAll(() => {
    copyFileSync(schemaTemplate(), path)
    connection = new Database(path)
  })

  afterEach(() => {
    truncate()
  })

  afterAll(() => {
    connection?.close()
    connection = null

    // `-wal` and `-shm` outlive the database they belong to, and a stale pair
    // beside a fresh copy is a database that opens and disagrees with itself.
    for (const suffix of ['', '-wal', '-shm'])
      rmSync(path + suffix, { force: true })
  })

  function open(): Database {
    if (!connection)
      throw new Error('useDatabase() must be called at the top level of the file, before any test runs')

    return connection
  }

  function insert(table: string, rows: Array<Record<string, unknown>>): number[] {
    const database = open()
    const ids: number[] = []

    for (const row of rows) {
      const columns = Object.keys(row)
      const placeholders = columns.map(() => '?').join(', ')
      const statement = database.prepare(
        `INSERT INTO "${table}" (${columns.map(column => `"${column}"`).join(', ')}) VALUES (${placeholders}) RETURNING id`,
      )

      const inserted = statement.get(...columns.map(column => normalise(row[column]))) as { id: number } | null

      if (inserted)
        ids.push(Number(inserted.id))
    }

    return ids
  }

  /*
   * The sqlite driver binds strings, numbers, bigints, buffers and null. A
   * boolean throws, which is easy to write by accident given the schema stores
   * every flag as an integer.
   */
  function normalise(value: unknown): string | number | bigint | null | Uint8Array {
    if (typeof value === 'boolean')
      return value ? 1 : 0

    if (value === undefined)
      return null

    return value as string | number | null
  }

  function truncate(): void {
    const database = open()
    const tables = database
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
      .all()

    database.exec('PRAGMA foreign_keys = OFF')

    for (const { name } of tables)
      database.exec(`DELETE FROM "${name}"`)

    database.exec('PRAGMA foreign_keys = ON')
  }

  return { insert, truncate, connection: open }
}

/**
 * A business row with every not-null column filled in.
 *
 * Defaults to the commonest case - a real listing, copied from open data, that
 * cannot take an order - so a test that cares about one column says only that
 * column and the rest reads as "and nothing unusual".
 */
export function aBusiness(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'A Place',
    slug: `a-place-${Math.random().toString(36).slice(2, 10)}`,
    type: 'restaurant',
    description: '',
    cuisine: '',
    price_tier: 2,
    address: '1 Example St',
    city: 'Santa Monica',
    latitude: 34.0195,
    longitude: -118.4912,
    is_partner: 0,
    is_claimed: 0,
    offers_delivery: 0,
    offers_pickup: 0,
    offers_dine_in: 0,
    offers_shop: 0,
    self_delivery: 0,
    delivery_radius_meters: 8000,
    minimum_order_cents: 0,
    prep_time_minutes: 20,
    rating_average: 0,
    rating_count: 0,
    source: 'curated',
    ...overrides,
  }
}
