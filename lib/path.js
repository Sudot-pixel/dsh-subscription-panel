/**
 * Dot-path reader for provider responses.
 *
 * Supports plain keys and array indexes, so both shapes used by real
 * providers can be declared in the registry:
 *
 *   credits.monthlyCredits              (Command Code)
 *   balance_infos[0].total_balance      (DeepSeek official balance endpoint)
 *
 * Any malformed path or missing link resolves to `undefined` instead of
 * throwing: a bad `balancePath` must surface as an `unparsed` platform status,
 * not as a crash of the whole list request.
 */

/** Split one declared path into key/index tokens, or null when malformed. */
function pathTokens(path) {
  const tokens = []
  for (const segment of String(path).split(".")) {
    const match = /^([^[\]]*)((?:\[\d+\])*)$/.exec(segment)
    if (match === null) return null
    if (match[1] !== "") tokens.push(match[1])
    for (const index of match[2].matchAll(/\[(\d+)\]/g)) tokens.push(Number(index[1]))
  }
  return tokens
}

/**
 * Read a declared path out of a decoded JSON value.
 *
 * @param source - decoded response payload.
 * @param path - `a.b.c` / `a[0].b` style path.
 * @returns the value at that path, or `undefined` when absent or malformed.
 */
export function pickPath(source, path) {
  if (!path) return undefined
  const tokens = pathTokens(path)
  if (tokens === null) return undefined
  let current = source
  for (const token of tokens) {
    if (current === null || current === undefined) return undefined
    current = current[token]
  }
  return current
}
