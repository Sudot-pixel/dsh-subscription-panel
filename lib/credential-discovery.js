/**
 * Credential discovery only answers whether a declared credential is usable.
 * Secret material stays inside this module and is never part of the public result.
 */
async function resolveCredential(credentials, keyRef) {
  if (!credentials || typeof credentials.resolve !== "function") {
    return { keyRef, status: "unavailable", value: "" };
  }
  try {
    const resolved = await credentials.resolve(keyRef);
    const value = resolved && typeof resolved.value === "string" ? resolved.value : "";
    return { keyRef, status: value.length > 0 ? "present" : "missing", value };
  } catch {
    return { keyRef, status: "unavailable", value: "" };
  }
}

async function inspectCredential(credentials, keyRef) {
  const resolved = await resolveCredential(credentials, keyRef);
  return { keyRef: resolved.keyRef, status: resolved.status };
}

export { inspectCredential, resolveCredential };
