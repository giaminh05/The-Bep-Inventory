# @bep/domain

Pure TypeScript helpers characterized against the current inventory backend. The backend remains the authority and does not import this package yet.

- `quantityToScaled({baseUnit, units}, input, unit, {allowZero?, maximum?})` returns integer thousandths using the existing decimal syntax, item-specific factors, whole-piece and range rules. It throws a status400 `QuantityError` for the same invalid quantity cases as the existing count action. Unit definitions are trusted catalog data, not a replacement for backend catalog validation.
- `atlantaDay(timestamp)` and `atlantaWeek(timestamp)` use `America/New_York` regardless of process/device timezone. The week key is Monday's date.
- `usageBetweenCounts({beginning, ending, purchases?, incoming?, outgoing?})` accepts canonical base-unit API quantities, calculates using scaled integers, retains null boundaries and negative results. It does not choose report boundaries, select movements, link counted receipts, or substitute current stock for historical counts.

Run `npm run test:shared` at the repository root. Tests compare literal quantity/date/usage fixtures with the real legacy count/history/report implementation on disposable in-memory databases. No production source, stock calculation or database schema is replaced by this package.
