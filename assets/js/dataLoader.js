/**
 * dataLoader.js — Shared fetch helper for loading JSON data files.
 *
 * Eliminates the repeated fetch-parse-throw boilerplate in every UI's
 * init() method.  Appends a cache-busting timestamp and sets
 * `cache: 'no-store'` so the browser always fetches the latest build.
 *
 * No external dependencies.
 */

/**
 * Fetch and parse a JSON file with cache-busting.
 * @param {string} url - Path to the JSON resource (e.g. "/data/territories.json").
 * @returns {Promise<any>} Parsed JSON.
 * @throws {Error} On HTTP error.
 */
export async function fetchJSON(url) {
  const response = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
  if (!response.ok) {
    throw new Error(`Failed to load ${url}: ${response.status}`);
  }
  return response.json();
}
