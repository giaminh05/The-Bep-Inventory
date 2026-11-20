/**
 * Build child-process environment for disposable Next fixtures.
 * @param {string | undefined} origin
 * @param {NodeJS.ProcessEnv} inherited
 */
export function nextFixtureEnvironment(origin, inherited = process.env) {
  // An explicit empty string wins over Next dotenv files; deleting the key does not.
  return { ...inherited, NEXT_TELEMETRY_DISABLED: '1', BEP_API_ORIGIN: origin ?? '' };
}
