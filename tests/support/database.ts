import { Database } from 'bun:sqlite'
import { copyFileSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs'
import { join, resolve, sep } from 'node:path'
import { afterEach, beforeAll } from 'bun:test'

/**
 * A database a test may write to: Laravel's RefreshDatabase, in TypeScript.
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
 *   const database = refreshDatabase()
 *
 *   test('…', async () => {
 *     database.seed('businesses', [factory.business({ type: 'home_kitchen' })])
 *     assertDatabaseCount('businesses', 1)
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
  /**
   * Put rows in a table, returning the ids sqlite assigned.
   *
   * Named for Laravel's `$this->seed()` rather than `insert`, because that is
   * what it is for: the arranging step of a test, not an assertion about
   * inserting.
   */
  seed: (table: string, rows: Array<Record<string, unknown>>) => number[]
  /** Empty every table, keeping the schema. */
  truncate: () => void
  /** The open connection, for a test that needs to read one back. */
  connection: () => Database
}

/**
 * Give this test file a database of its own.
 *
 * The equivalent of putting `use RefreshDatabase;` on a Laravel test case:
 * call it at the top level of the file, once. The schema is created before the
 * first test and the rows are cleared after each one, so no test can be made
 * to pass by another one's leftovers.
 */
let shared: Database | null = null

/**
 * The one database this process gets, created on first use.
 *
 * Deliberately not one per file. `bun test` runs a whole directory in a single
 * process, and `config/database.ts` reads DB_DATABASE_PATH exactly once - when
 * the first file to import `@stacksjs/database` evaluates it - so every file
 * shares one app connection to one path.
 *
 * Giving each file a fresh copy of that path is what the first version did,
 * and it looked fine one file at a time: every file passed alone and 31 tests
 * failed together. Replacing the file leaves the app's open connection bound
 * to the inode that was there before, which is now unlinked - so the query
 * builder went on reading a deleted database while the tests wrote to a new
 * one at the same name.
 *
 * So the file is created once and only ever emptied afterwards. Truncating is
 * what isolates one test from the next, and it does not move the file out from
 * under anybody.
 */
function ensureDatabase(path: string): Database {
  if (shared)
    return shared

  /*
   * The template first, because building it is what creates the directory.
   * Sweeping before that read a directory which does not exist on a fresh
   * checkout - it existed on this machine from earlier runs, so it passed
   * here and failed on CI, which is the second time that shape of mistake has
   * cost a pipeline in this suite.
   */
  const template = schemaTemplate()

  sweepAbandoned(path)
  copyFileSync(template, path)
  shared = new Database(path)

  return shared
}

/**
 * The tables the framework owns rather than this app.
 *
 * `database/migrations/` holds the app's own schema. Sessions, tokens, roles
 * and permissions are the framework's, created by `buddy migrate` in a
 * separate step - which is why the output of that command says "including auth
 * tables" - and they are not in the corpus this template is built from.
 *
 * Asked for rather than copied out of a developer's database, so what a test
 * authenticates against is whatever the installed framework builds today. A
 * snapshot would be the same mistake as a fixture schema: right until the day
 * the package changes.
 *
 * Only a test that signs somebody in needs them, and building them costs a
 * second, so `refreshDatabase({ auth: true })` asks explicitly.
 */
let authTablesReady = false

async function ensureAuthTables(): Promise<void> {
  if (authTablesReady)
    return

  const { migrateAuthTables, migrateRbacTables } = await import('@stacksjs/database')

  await migrateAuthTables()
  await migrateRbacTables()

  authTablesReady = true
}

/**
 * Clear out databases left by runs that are over.
 *
 * The file is named for its process and is no longer deleted when a file
 * finishes - deleting it is what broke the app's connection - so without this
 * every `bun test` leaves another three files behind, and they are a megabyte
 * each.
 *
 * Age rather than liveness: another test process running right now has a file
 * it has touched in the last few seconds, and one from a run that has ended
 * has not been touched since. Checking whether a pid is alive would be exact
 * and would also delete a database out from under a process that recycled the
 * number.
 */
const ABANDONED_AFTER_MS = 10 * 60 * 1000

function sweepAbandoned(keep: string): void {
  const ours = keep.split('/').pop()

  if (fileChangedAt(TESTING_DIR) === null)
    return

  for (const name of readdirSync(TESTING_DIR)) {
    if (!name.startsWith('test-') || name.startsWith(ours ?? ''))
      continue

    const file = join(TESTING_DIR, name)
    const changed = fileChangedAt(file)

    if (changed !== null && Date.now() - changed > ABANDONED_AFTER_MS)
      rmSync(file, { force: true })
  }
}

export function refreshDatabase(options: { auth?: boolean } = {}): TestDatabase {
  const path = testDatabasePath()

  beforeAll(async () => {
    ensureDatabase(path)

    if (options.auth)
      await ensureAuthTables()

    // Whatever the previous file left, in case it had no `afterEach` of its
    // own - a file should open on an empty database however it got here.
    truncate()
  })

  afterEach(() => {
    truncate()
  })

  function open(): Database {
    if (!shared)
      throw new Error('refreshDatabase() must be called at the top level of the file, before any test runs')

    return shared
  }

  function seed(table: string, rows: Array<Record<string, unknown>>): number[] {
    const database = open()
    const ids: number[] = []

    /*
     * `RETURNING id` only where there is one. A pivot - `user_roles`,
     * `role_permissions` - is two foreign keys and no key of its own, and
     * asking it for an id fails on "no such column" rather than on anything
     * to do with the row being inserted.
     */
    const keyed = hasIdColumn(database, table)

    for (const row of rows) {
      const columns = Object.keys(row)
      const placeholders = columns.map(() => '?').join(', ')
      const names = columns.map(column => `"${column}"`).join(', ')
      const values = columns.map(column => normalise(row[column]))

      if (!keyed) {
        database.prepare(`INSERT INTO "${table}" (${names}) VALUES (${placeholders})`).run(...values)
        continue
      }

      const inserted = database
        .prepare(`INSERT INTO "${table}" (${names}) VALUES (${placeholders}) RETURNING id`)
        .get(...values) as { id: number } | null

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

  /** Whether a table has its own primary key, as opposed to being a pivot. */
  function hasIdColumn(database: Database, table: string): boolean {
    return database
      .query<{ name: string }, []>(`PRAGMA table_info("${table}")`)
      .all()
      .some(column => column.name === 'id')
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

  return { seed, truncate, connection: open }
}

/**
 * The connection the assertions below read.
 *
 * Laravel's `assertDatabaseHas` is a method on the test case, which already
 * knows its connection. These are free functions, so they read the one this
 * process opened - and a file that calls one without `refreshDatabase()` gets
 * told so, rather than quietly querying nothing and passing.
 */
function assertionConnection(): Database {
  if (!shared)
    throw new Error('assertDatabase* needs refreshDatabase() at the top level of this file')

  return shared
}

/** The `where` half of an assertion, as SQL and its bindings. */
function matching(columns: Record<string, unknown>): { clause: string, values: Array<string | number | null> } {
  const names = Object.keys(columns)

  if (names.length === 0)
    return { clause: '1 = 1', values: [] }

  return {
    clause: names.map(name => `"${name}" IS ?`).join(' AND '),
    values: names.map(name => bindable(columns[name])),
  }
}

function countMatching(table: string, columns: Record<string, unknown>): number {
  const { clause, values } = matching(columns)
  const row = assertionConnection()
    .query<{ n: number }, any[]>(`SELECT COUNT(*) n FROM "${table}" WHERE ${clause}`)
    .get(...values)

  return row?.n ?? 0
}

/** Laravel's `assertDatabaseHas`: this table holds a row like this. */
export function assertDatabaseHas(table: string, columns: Record<string, unknown>): void {
  const found = countMatching(table, columns)

  if (found === 0) {
    throw new Error(
      `Expected "${table}" to hold a row matching ${JSON.stringify(columns)}, and it holds none.`,
    )
  }
}

/** Laravel's `assertDatabaseMissing`: and this one it does not. */
export function assertDatabaseMissing(table: string, columns: Record<string, unknown>): void {
  const found = countMatching(table, columns)

  if (found > 0) {
    throw new Error(
      `Expected "${table}" to hold no row matching ${JSON.stringify(columns)}, and it holds ${found}.`,
    )
  }
}

/** Laravel's `assertDatabaseCount`. */
export function assertDatabaseCount(table: string, expected: number): void {
  const row = assertionConnection().query<{ n: number }, []>(`SELECT COUNT(*) n FROM "${table}"`).get()
  const found = row?.n ?? 0

  if (found !== expected)
    throw new Error(`Expected "${table}" to hold ${expected} row(s), and it holds ${found}.`)
}

function bindable(value: unknown): string | number | null {
  if (typeof value === 'boolean')
    return value ? 1 : 0

  if (value === undefined)
    return null

  return value as string | number | null
}

/**
 * Rows with every not-null column already filled in.
 *
 * Laravel would spell this `Business::factory()->create()`; there is no model
 * factory here, so it is a plain object a test can hand to `seed`. Each one
 * defaults to the commonest case, so a test that cares about one column names
 * only that column and the rest reads as "and nothing unusual".
 */
export const factory = {
  business: aBusiness,
  product: aProduct,
  market: aMarket,
  courier: aCourier,
  csaPlan: aCsaPlan,
}

/**
 * A business: by default a real listing, copied from open data, that cannot
 * take an order - which is what most rows in this table are.
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

/** A product on some business's menu. `business_id` is the one thing to pass. */
export function aProduct(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'A Dish',
    description: '',
    price: 1000,
    is_available: 1,
    preparation_time: 15,
    allergens: '[]',
    ...overrides,
  }
}

/** A market, which is what gives a business its currency, tax and timezone. */
export function aMarket(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Los Angeles',
    slug: `los-angeles-${Math.random().toString(36).slice(2, 8)}`,
    city: 'Los Angeles',
    country_code: 'US',
    currency: 'usd',
    tax_mode: 'exclusive',
    default_tax_rate: 0,
    timezone: 'America/Los_Angeles',
    locale: 'en',
    center_latitude: 34.0195,
    center_longitude: -118.4912,
    is_active: 1,
    ...overrides,
  }
}

/**
 * A courier, free and positioned.
 *
 * `status: 'active'` is the one that means available - `on_delivery` is the
 * busy one - and a courier with no coordinates is treated as unpositioned by
 * the dispatcher, so both are filled in by default.
 */
export function aCourier(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'A Courier',
    phone: '',
    vehicle_number: 'BIKE-1',
    license: '',
    status: 'active',
    latitude: 34.0195,
    longitude: -118.4912,
    heading: 0,
    speed: 0,
    ...overrides,
  }
}

/** A weekly vegetable share, open, collected on Wednesdays. */
export function aCsaPlan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'Weekly Box',
    description: '',
    price_cents: 3000,
    cadence: 'weekly',
    feeds: '2-3 people',
    day_of_week: 3,
    offers_delivery: 0,
    is_active: 1,
    ...overrides,
  }
}
