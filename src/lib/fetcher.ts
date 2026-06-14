/**
 * Client-safe fetch helpers. Reject on non-2xx so callers' `.catch` (or try/catch)
 * surfaces an error instead of silently parsing an error body as data.
 */
export async function getJson<T = unknown>(url: string): Promise<T> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`GET ${url} failed with ${res.status}`)
  return res.json() as Promise<T>
}
