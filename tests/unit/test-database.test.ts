import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { aBusiness, testDatabasePath, useDatabase } from '../support/database'

/**
 * The test database helper, and the guard that stops it eating the real one.
 *
 * This is not a hypothetical. The first version pointed at
 * `database/smakelo.sqlite` and emptied the development database on its first
 * run: `.env` sets `DB_DATABASE_PATH`, the env plugin loads it before
 * tests/setup.ts, and the line there was written as
 * `if (!Bun.env.DB_DATABASE_PATH)` - so it deferred to the value it was
 * supposed to replace. `useDatabase()` then copied a blank schema over 98MB of
 * seeded data and deleted the file afterwards.
 *
 * Everything below exists because of that. The helper is the piece of the
 * suite with the power to destroy something, so it is the piece that most
 * needs its own tests.
 */

const database = useDatabase()

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
    expect(() => database.insert('businesses', [aBusiness({ type: 'not_a_real_type' })]))
      .toThrow()
  })
})

describe('rows between tests', () => {
  test('a test can insert what it needs', () => {
    const ids = database.insert('businesses', [aBusiness({ slug: 'first' }), aBusiness({ slug: 'second' })])

    expect(ids.length).toBe(2)
    expect(database.connection().query('SELECT COUNT(*) n FROM businesses').get()).toEqual({ n: 2 })
  })

  test('and finds none left by the last one', () => {
    // Otherwise a test passes because of what ran before it, and the order of
    // the file becomes part of its meaning.
    expect(database.connection().query('SELECT COUNT(*) n FROM businesses').get()).toEqual({ n: 0 })
  })

  test('booleans are stored as the integers the schema wants', () => {
    // The driver throws on a boolean, and every flag in this schema is an
    // integer, so writing `is_partner: true` is an easy thing to reach for.
    database.insert('businesses', [aBusiness({ slug: 'flagged', is_partner: true })])

    const row = database.connection().query('SELECT is_partner FROM businesses WHERE slug = ?').get('flagged')

    expect(row).toEqual({ is_partner: 1 })
  })
})
