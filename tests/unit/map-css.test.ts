import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'

/**
 * The map's stylesheet is vendored, and a vendored file rots.
 *
 * `import 'ts-maps/styles.css'` resolves correctly from a `<script client>`
 * and is then dropped - the views build does not emit CSS reached that way -
 * so the rules never arrived on any page. Without them `.tsmap-tile` and
 * `.tsmap-pane` are `position: static`, the tiles lay out in document flow,
 * and their transforms push them from there into a diagonal staircase that
 * covers about half the container. Every page with a map looked half-drawn.
 *
 * So the file is copied into resources/assets/styles and linked from the head
 * partial. This test is the thing that stops the copy quietly falling behind
 * the package: a `bun update` that changes the stylesheet fails here rather
 * than shipping a map positioned by last year's rules.
 */
describe('the vendored map stylesheet', () => {
  const vendored = readFileSync('resources/assets/styles/ts-maps.css', 'utf8')
  const installed = readFileSync('node_modules/ts-maps/src/core-map/ts-maps.css', 'utf8')

  test('matches the installed package', () => {
    // The copy carries a provenance header; everything after it is verbatim.
    const body = vendored.slice(vendored.indexOf('/* required styles */'))

    expect(body).toBe(installed.slice(installed.indexOf('/* required styles */')))
  })

  test('still carries the rule the whole map rests on', () => {
    // If this selector ever stops setting `position: absolute`, tiles go back
    // to flowing down the page and the staircase comes back.
    const required = vendored.slice(vendored.indexOf('/* required styles */'), vendored.indexOf('.tsmap-container'))

    expect(required).toContain('.tsmap-tile')
    expect(required).toContain('position: absolute')
  })
})
