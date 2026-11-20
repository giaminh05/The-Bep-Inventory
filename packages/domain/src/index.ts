/** Inventory quantities use thousandths of an item's base unit, exactly as the legacy server. */
export const STOCK_SCALE = 1000;
export const MAX_STOCK = 1_000_000_000 * STOCK_SCALE;

export class QuantityError extends Error {
  readonly status = 400;
}

export interface UnitDefinition {
  baseUnit: string;
  units: Readonly<Record<string, number>>;
}

/** Characterizes existing server acceptance; this is not a replacement for backend validation. */
export function quantityToScaled(
  definition: UnitDefinition,
  input: unknown,
  unit: unknown,
  { allowZero = false, maximum = MAX_STOCK }: { allowZero?: boolean; maximum?: number } = {},
): number {
  const text = typeof input === 'number' || typeof input === 'string' ? String(input) : '';
  if (!/^\d{1,10}(\.\d{1,3})?$/.test(text) || typeof unit !== 'string' || !Object.hasOwn(definition.units, unit)) {
    throw new QuantityError('Nhập số lượng hợp lệ và chọn đơn vị của mặt hàng.');
  }
  const [whole, fraction = ''] = text.split('.');
  const amount = (Number(whole) * STOCK_SCALE + Number(fraction.padEnd(3, '0'))) * definition.units[unit];
  if ((!allowZero && !amount) || amount > maximum || (definition.baseUnit === 'each' && amount % STOCK_SCALE)) {
    throw new QuantityError('Số lượng ngoài phạm vi hoặc không quy đổi thành số cái nguyên.');
  }
  return amount;
}

const atlantaDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
});

export function atlantaDay(timestamp: string | number | Date): string {
  return atlantaDate.format(timestamp instanceof Date ? timestamp : new Date(timestamp));
}

export function atlantaWeek(timestamp: string | number | Date): string {
  const date = new Date(atlantaDay(timestamp) + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() - ((date.getUTCDay() + 6) % 7));
  return date.toISOString().slice(0, 10);
}

export interface CountPeriod {
  beginning: number | null;
  ending: number | null;
  purchases?: number;
  incoming?: number;
  outgoing?: number;
}

/** Inputs are canonical API base-unit quantities; count-boundary selection remains on the backend. */
export function usageBetweenCounts({ beginning, ending, purchases = 0, incoming = 0, outgoing = 0 }: CountPeriod): number | null {
  if (beginning === null || ending === null) return null;
  // The legacy report sums scaled integers before dividing, avoiding decimal drift.
  return (Math.round(beginning * STOCK_SCALE) + Math.round(purchases * STOCK_SCALE)
    + Math.round(incoming * STOCK_SCALE) - Math.round(outgoing * STOCK_SCALE)
    - Math.round(ending * STOCK_SCALE)) / STOCK_SCALE;
}
