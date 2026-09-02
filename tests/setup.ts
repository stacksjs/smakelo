/**
 * Test Setup
 *
 * Runs before every test file. Sets environment variables that must
 * be present before any @stacksjs/* packages are evaluated, then
 * initialises the test environment.
 */

// Env vars that config reads at module-evaluation time
if (!Bun.env.STRIPE_SECRET_KEY)
  Bun.env.STRIPE_SECRET_KEY = 'sk_test_fake_key_for_testing'

/*
 * Point the suite at a scratch database.
 *
 * `config/database.ts` reads `DB_DATABASE_PATH` when its module is evaluated,
 * which happens the first time anything imports `@stacksjs/database`. Set it
 * anywhere later and the value is read by nobody - so it is set here, in the
 * file bunfig preloads before any test file is even parsed.
 *
 * Without it a test that writes rows would write them into
 * `database/smakelo.sqlite`, which is the database the dev server is serving
 * and the one `buddy seed:demo` fills. A suite that can quietly edit the
 * machine's real data is a suite nobody can run twice.
 *
 * Per process, so parallel test processes cannot share a file. The schema is
 * created by `useDatabase()` in tests/support/database.ts; a file that never
 * calls it never gets a database, which is why this is only a path.
 *
 * Assigned unconditionally, and this is the whole point of the line. Written
 * as `if (!Bun.env.DB_DATABASE_PATH)` it did nothing at all: `.env` sets
 * DB_DATABASE_PATH to the real database and the env plugin loads it before
 * this file, so the guard saw a value and left it - pointing the suite at
 * `database/smakelo.sqlite`, which `useDatabase()` then overwrote with an
 * empty schema and deleted. A test database is not a fallback for when one was
 * not configured; it is a replacement for whatever was.
 */
Bun.env.DB_DATABASE_PATH = `storage/framework/testing/test-${process.pid}.sqlite`

import { applyRuntimeDirectoryEnv } from '@stacksjs/path'
import { setupTestEnvironment } from '@stacksjs/testing'

setupTestEnvironment()

// The suite does not go through the preloader, so point stx and ts-cloud at
// `storage/` here too. Without it a test that renders a template or touches a
// cloud helper would write to `.stx` / `.ts-cloud` in the project root.
applyRuntimeDirectoryEnv()

// `@stacksjs/stx`'s reactivity flushes effects through requestAnimationFrame,
// which Bun's non-DOM test runtime does not provide. It schedules through a
// NESTED rAF, so the inner callback lands well after the test that triggered
// it — any suite that installed the shim itself and tore it down afterwards
// left that callback calling a function that no longer existed, surfacing as
// "TypeError: requestAnimationFrame is not a function" between tests. That
// failed the run through bun's exit code while the summary still read 0 fail.
//
// Installed here instead: rAF never exists in this runtime, so there is
// nothing to restore and no window in which it can go missing. Guarded so a
// real DOM environment keeps its own implementation.
if (typeof globalThis.requestAnimationFrame !== 'function') {
  globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) =>
    setTimeout(() => cb(Date.now()), 0) as unknown as number) as typeof requestAnimationFrame

  globalThis.cancelAnimationFrame = ((handle: number) =>
    clearTimeout(handle as unknown as ReturnType<typeof setTimeout>)) as typeof cancelAnimationFrame
}
