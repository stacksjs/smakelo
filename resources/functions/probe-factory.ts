export function makeHandlers({ count }: { count: any }) {
  function bump() {
    count.set(count() + 1)
  }

  return { bump }
}
