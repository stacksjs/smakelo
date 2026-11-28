export function say(key: string, fallback: string): string {
  const language = (globalThis as typeof globalThis & { Smakelo?: { t?: (key: string, fallback: string) => string } }).Smakelo
  return language?.t?.(key, fallback) ?? fallback
}
