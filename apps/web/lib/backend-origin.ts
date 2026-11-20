/** Validate an explicitly selected backend without inventing an operational default. */
export function parseBackendOrigin(
  value: string | undefined,
): string | undefined {
  if (value === undefined || value === "") return undefined;
  const invalid = () =>
    new Error(
      "BEP_API_ORIGIN must be an HTTPS origin or a loopback HTTP origin, without credentials, path, query or fragment.",
    );
  // Check syntax before URL normalization can erase dot segments or backslashes.
  if (!/^https?:\/\/[^/\\?#\s]+\/?$/.test(value)) throw invalid();
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw invalid();
  }
  const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (
    (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
    url.username ||
    url.password ||
    url.pathname !== "/"
  )
    throw invalid();
  return url.origin;
}
