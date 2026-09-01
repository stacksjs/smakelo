/**
 * The basemap's cartography, as data.
 *
 * The map used to be somebody else's raster with a filter over it. A raster
 * tile has its colours and its typography baked in at the moment it is drawn,
 * so "set the labels in our font" and "make the water this blue" were not
 * questions it could answer - the best a filter can do is tint what is already
 * there, which is how dark mode ended up as a grey photograph of a light map.
 *
 * These are vector tiles, drawn in the browser from the rules below. The two
 * palettes are one structure with different values, so light and dark cannot
 * drift into being two different maps: a road that is a hairline in one is a
 * hairline in the other.
 *
 * Schema is OpenMapTiles - `water`, `transportation`, `place` and the rest are
 * its layer names, not ours.
 */

export interface Palette {
  land: string
  green: string
  landuse: string
  water: string
  building: string
  motorway: string
  primary: string
  secondary: string
  minor: string
  /** The hairline under a light road, which is what stops it vanishing. */
  casing: string | null
  boundary: string
  cityLabel: string
  areaLabel: string
  roadLabel: string
  waterLabel: string
  halo: string
}

/**
 * Navy rather than neutral grey: a pure-grey dark map reads as switched off,
 * and the blue is what makes water look like water instead of a hole.
 */
export const DARK: Palette = {
  land: '#141922',
  green: '#1a2a20',
  landuse: '#171d27',
  water: '#0a0f17',
  building: '#1b212c',
  motorway: '#98a2b6',
  primary: '#79839a',
  secondary: '#525c70',
  minor: '#333c4b',
  casing: null,
  boundary: '#2b3444',
  cityLabel: '#ccd4e0',
  areaLabel: '#98a3b6',
  roadLabel: '#6d768a',
  waterLabel: '#41566f',
  halo: 'rgba(10, 15, 23, 0.85)',
}

/**
 * The same map in daylight, not an inversion of the dark one.
 *
 * Roads go white and pick up a casing, which is the part an inversion always
 * got wrong: white roads on cream have almost no contrast alone, and the
 * hairline beneath them is what actually draws the network.
 */
export const LIGHT: Palette = {
  land: '#f6f4f0',
  green: '#e4ecdd',
  landuse: '#f0ece5',
  water: '#c9d9e8',
  building: '#e9e4dc',
  motorway: '#ffffff',
  primary: '#ffffff',
  secondary: '#ffffff',
  minor: '#fbfaf8',
  casing: '#ddd7cd',
  boundary: '#d8d2c8',
  cityLabel: '#3f3a34',
  areaLabel: '#7d766c',
  roadLabel: '#9a9289',
  waterLabel: '#8ba3bb',
  halo: 'rgba(246, 244, 240, 0.9)',
}

/** Road classes, widest to thinnest, with the width each is drawn at. */
const ROADS = [
  { id: 'motorway', classes: ['motorway'], width: 2.6, key: 'motorway' as const, minzoom: 5 },
  { id: 'primary', classes: ['trunk', 'primary'], width: 2, key: 'primary' as const, minzoom: 7 },
  { id: 'secondary', classes: ['secondary', 'tertiary'], width: 1.4, key: 'secondary' as const, minzoom: 10 },
  { id: 'minor', classes: ['minor', 'service'], width: 0.9, key: 'minor' as const, minzoom: 13 },
]

/**
 * The page's own typeface, so the map is set in the same face as the words
 * around it. The glyphs are rasterised from a browser font rather than fetched
 * as pictures, which is the whole reason this is possible at all.
 */
const FONT = ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif']

/**
 * Build the style layers for a palette.
 *
 * Order is paint order: the ground, then what sits on it, then roads, then
 * labels. Roads are one layer per class rather than one layer with a width
 * expression, because `line-width` takes a number here and four plain layers
 * read better than one clever one.
 */
export function basemapStyle(palette: Palette): any[] {
  const layers: any[] = [
    { id: 'landuse', type: 'fill', sourceLayer: 'landuse', paint: { 'fill-color': palette.landuse } },
    { id: 'landcover', type: 'fill', sourceLayer: 'landcover', paint: { 'fill-color': palette.green, 'fill-opacity': 0.85 } },
    { id: 'park', type: 'fill', sourceLayer: 'park', paint: { 'fill-color': palette.green } },
    { id: 'water', type: 'fill', sourceLayer: 'water', paint: { 'fill-color': palette.water } },
    { id: 'building', type: 'fill', sourceLayer: 'building', minzoom: 14, paint: { 'fill-color': palette.building } },
  ]

  // The casing goes under every road, so it is drawn as its own pass first.
  if (palette.casing) {
    for (const road of ROADS) {
      layers.push({
        id: `${road.id}-casing`,
        type: 'line',
        sourceLayer: 'transportation',
        minzoom: road.minzoom,
        filter: ['in', 'class', ...road.classes],
        paint: { 'line-color': palette.casing, 'line-width': road.width + 1.2, 'line-cap': 'round', 'line-join': 'round' },
      })
    }
  }

  for (const road of ROADS) {
    layers.push({
      id: road.id,
      type: 'line',
      sourceLayer: 'transportation',
      minzoom: road.minzoom,
      filter: ['in', 'class', ...road.classes],
      paint: { 'line-color': palette[road.key], 'line-width': road.width, 'line-cap': 'round', 'line-join': 'round' },
    })
  }

  layers.push(
    {
      id: 'boundary',
      type: 'line',
      sourceLayer: 'boundary',
      filter: ['<=', 'admin_level', 6],
      paint: { 'line-color': palette.boundary, 'line-width': 0.8, 'line-opacity': 0.7 },
    },

    /*
     * Labels.
     *
     * Set in caps and tracked wide, which is what a place name on a map has
     * looked like since long before anybody drew one in a browser: an area is
     * a region of the map rather than a point on it, and letting the name
     * spread says so where a tight lowercase label just marks a spot.
     */
    {
      id: 'place-city',
      type: 'symbol',
      sourceLayer: 'place',
      filter: ['in', 'class', 'city', 'town'],
      layout: {
        'text-field': ['upcase', ['get', 'name']],
        'text-size': 13,
        'text-font': FONT,
        'text-letter-spacing': 0.16,
        'symbol-priority': 1,
      },
      paint: { 'text-color': palette.cityLabel, 'text-halo-color': palette.halo, 'text-halo-width': 1.4 },
    },
    {
      id: 'place-area',
      type: 'symbol',
      sourceLayer: 'place',
      minzoom: 11,
      filter: ['in', 'class', 'suburb', 'neighbourhood', 'quarter', 'village'],
      layout: {
        'text-field': ['upcase', ['get', 'name']],
        'text-size': 10.5,
        'text-font': FONT,
        'text-letter-spacing': 0.2,
        'symbol-priority': 2,
      },
      paint: { 'text-color': palette.areaLabel, 'text-halo-color': palette.halo, 'text-halo-width': 1.2 },
    },
    {
      id: 'road-label',
      type: 'symbol',
      sourceLayer: 'transportation_name',
      minzoom: 0,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 10,
        'text-font': FONT,
        'symbol-placement': 'line',
        'symbol-priority': 4,
      },
      paint: { 'text-color': palette.roadLabel, 'text-halo-color': palette.halo, 'text-halo-width': 1.2 },
    },
    {
      id: 'water-label',
      type: 'symbol',
      sourceLayer: 'water_name',
      minzoom: 0,
      layout: {
        'text-field': ['get', 'name'],
        'text-size': 11,
        'text-font': FONT,
        'text-italic': true,
        'text-letter-spacing': 0.08,
        'symbol-priority': 3,
      },
      paint: { 'text-color': palette.waterLabel, 'text-halo-color': palette.halo, 'text-halo-width': 1 },
    },
  )

  return layers
}
