import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { assertDatabaseCount, assertDatabaseHas, assertDatabaseMissing, factory, refreshDatabase, testDatabasePath } from '../support/database'

/**
 * The test database helper, and the guard that stops it eating the real one.
 *
 * This is not a hypothetical. The first version pointed at
 * `database/smakelo.sqlite` and emptied the development database on its first
 * run: `.env` sets `DB_DATABASE_PATH`, the env plugin loads it before
 * tests/setup.ts, and the line there was written as
 * `if (!Bun.env.DB_DATABASE_PATH)` - so it deferred to the value it was
 * supposed to replace. `refreshDatabase()` then copied a blank schema over 98MB of
 * seeded data and deleted the file afterwards.
 *
 * Everything below exists because of that. The helper is the piece of the
 * suite with the power to destroy something, so it is the piece that most
 * needs its own tests.
 */

const database = refreshDatabase()

describe('where the test database lives', () => {
  test('it is under the testing directory', () => {
    expect(testDatabasePath()).toContain('storage/framework/testing')
  })

  test('setup replaces the configured path rather than deferring to it', () => {
    // The bug, in one line. `.env` names the real database and the env plugin
    // loads it first, so a conditional assignment here assigns nothing.
    //
    // Comments are stripped before looking: this file and setup.ts both
    // quote the broken line while explaining it, and an assertion that cannot
    // tell prose from code would be satisfied by the explanation.
    const setup = readFileSync('tests/setup.ts', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*/g, '')

    expect(setup).toContain('Bun.env.DB_DATABASE_PATH =')
    expect(setup).not.toMatch(/if\s*\(\s*!\s*Bun\.env\.DB_DATABASE_PATH\s*\)/)
  })

  test('it refuses a path outside that directory', () => {
    const original = Bun.env.DB_DATABASE_PATH

    try {
      Bun.env.DB_DATABASE_PATH = 'database/smakelo.sqlite'
      expect(() => testDatabasePath()).toThrow(/Refusing to use/)

      // Including one that merely starts with the right characters.
      Bun.env.DB_DATABASE_PATH = 'storage/framework/testing-elsewhere/x.sqlite'
      expect(() => testDatabasePath()).toThrow(/Refusing to use/)
    }
    finally {
      Bun.env.DB_DATABASE_PATH = original
    }
  })
})

describe('the schema it builds', () => {
  test('is the committed migrations, not a hand-written fixture', () => {
    // A fixture drifts from production the first time somebody adds a column.
    const tables = database
      .connection()
      .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map(row => row.name)

    expect(tables).toContain('businesses')
    expect(tables).toContain('orders')
    expect(tables).toContain('products')
  })

  test('carries the constraints the real schema has', () => {
    // The type column has a CHECK constraint. A helper that built tables from
    // a loose description would accept a row production rejects, which is the
    // failure mode that makes fixture schemas worse than useless.
    expect(() => database.seed('businesses', [factory.business({ type: 'not_a_real_type' })]))
      .toThrow()
  })
})

describe('rows between tests', () => {
  test('a test can seed what it needs', () => {
    const ids = database.seed('businesses', [factory.business({ slug: 'first' }), factory.business({ slug: 'second' })])

    expect(ids.length).toBe(2)
    assertDatabaseCount('businesses', 2)
    assertDatabaseHas('businesses', { slug: 'first' })
  })

  test('and finds none left by the last one', () => {
    // Otherwise a test passes because of what ran before it, and the order of
    // the file becomes part of its meaning.
    assertDatabaseCount('businesses', 0)
    assertDatabaseMissing('businesses', { slug: 'first' })
  })

  test('booleans are stored as the integers the schema wants', () => {
    // The driver throws on a boolean, and every flag in this schema is an
    // integer, so writing `is_partner: true` is an easy thing to reach for.
    database.seed('businesses', [factory.business({ slug: 'flagged', is_partner: true })])

    assertDatabaseHas('businesses', { slug: 'flagged', is_partner: 1 })
  })
})

describe('the assertions', () => {
  test('say what they looked for and what they found', () => {
    // A bare `expect(count).toBe(1)` in a database test reads as "expected 1,
    // got 0" and leaves you to guess which row and which table.
    database.seed('businesses', [factory.business({ slug: 'here' })])

    expect(() => assertDatabaseHas('businesses', { slug: 'elsewhere' }))
      .toThrow(/Expected "businesses" to hold a row matching .*elsewhere.*and it holds none/)

    expect(() => assertDatabaseMissing('businesses', { slug: 'here' }))
      .toThrow(/to hold no row matching .*here.*and it holds 1/)

    expect(() => assertDatabaseCount('businesses', 7))
      .toThrow(/to hold 7 row\(s\), and it holds 1/)
  })

  test('match a null the way SQL will not', () => {
    // `WHERE col = NULL` is never true, so an assertion built on `=` can never
    // find a row by a column that is null - it just reports the row missing.
    database.seed('businesses', [factory.business({ slug: 'no-postcode', postal_code: null })])

    assertDatabaseHas('businesses', { slug: 'no-postcode', postal_code: null })
  })
})

describe('the app sees the same database the test writes to', () => {
  test('a row seeded here is visible through the query builder', async () => {
    // The invariant that broke when each file got a fresh copy of the file.
    // `config/database.ts` reads DB_DATABASE_PATH once, when the first file to
    // import `@stacksjs/database` evaluates it, so the app holds one
    // connection for the whole process. Replacing the file left that
    // connection bound to an unlinked inode: every file passed on its own and
    // 31 tests failed when the suite ran together.
    database.seed('businesses', [factory.business({ slug: 'visible-to-the-app', name: 'Visible' })])

    const { db } = await import('@stacksjs/database')
    const found = await db.selectFrom('businesses').where('slug', '=', 'visible-to-the-app').selectAll().execute()

    expect(found.length).toBe(1)
    expect((found[0] as { name: string }).name).toBe('Visible')
  })

  test('and is gone from the query builder once the test ends', async () => {
    const { db } = await import('@stacksjs/database')
    const found = await db.selectFrom('businesses').selectAll().execute()

    expect(found.length).toBe(0)
  })
})
