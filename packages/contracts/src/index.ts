import { z } from 'zod';

// These schemas describe the existing HTTP wire format. They do not coerce values
// or replace server-side business validation. Preserve additional legacy fields.
const text = z.string();
const nullableText = text.nullable();
const amount = z.number();
const nullableAmount = amount.nullable();
export const integerBooleanSchema = z.union([z.literal(0), z.literal(1)]);
export const healthSchema = z.object({ ok: z.literal(true) }).passthrough();
export const loginSchema = z.object({ token: text, persistent: z.boolean().optional() }).passthrough();
export const userSchema = z.object({ id: text, name: text, role: z.enum(['manager', 'staff']), location_id: nullableText }).passthrough();
export const locationSchema = z.object({ id: text, name: text, kind: text }).passthrough();
export const itemSchema = z.object({
  id: text, sku: text, name: text, category: text, base_unit: text,
  units: z.record(text, amount), supplier: text, pack: text,
  cost: nullableAmount.optional(), system_threshold: nullableAmount.optional(), system_low: z.boolean().optional(),
}).passthrough();
export const stockSchema = z.object({
  location_id: text, item_id: text, on_hand: nullableAmount, threshold: nullableAmount,
  revision: z.number().int(), known: integerBooleanSchema, low: z.boolean(),
  latest_count: z.object({ sheet_id: text, counted: amount, submitted_at: text }).passthrough().nullable(),
}).passthrough();
export const receiptSchema = z.object({
  id: text, quantity: amount, note: nullableText, receiver: nullableText,
  created_at: text, actor_name: text, has_photo: integerBooleanSchema,
}).passthrough();
export const deliveryLineSchema = z.object({
  id: text, delivery_id: text, item_id: text, expected: amount, received: amount, outstanding: amount,
  receipts: z.array(receiptSchema),
}).passthrough();
export const deliverySchema = z.object({
  id: text, location_id: text, supplier: text, note: nullableText, created_at: text, actor: text,
  manager_created: integerBooleanSchema, lines: z.array(deliveryLineSchema),
}).passthrough();
export const transferReceiptSchema = z.object({
  id: text, transfer_id: text, quantity: amount, discrepancy: amount, final: integerBooleanSchema,
  note: nullableText, created_at: text, actor: text, receiver: nullableText, actor_name: text,
}).passthrough();
export const transferSchema = z.object({
  id: text, source: text, destination: text, item_id: text, sent: amount, received: amount, shortage: amount,
  dispatched_at: text, closed_at: nullableText, note: nullableText, actor: text, batch_id: nullableText,
  manager_created: integerBooleanSchema, in_transit: amount, discrepancy: amount,
  receipts: z.array(transferReceiptSchema),
}).passthrough();
export const countSheetSchema = z.object({
  id: text, location_id: text, category: text, actor: text, performed_by: text,
  note: nullableText, submitted_at: text, actor_name: text,
  lines: z.array(z.object({ item_id: text, before: nullableAmount, counted: amount }).passthrough()),
}).passthrough();
export const accountSchema = z.object({ id: text, name: text, location_id: text }).passthrough();
export const snapshotSchema = z.object({
  user: userSchema, locations: z.array(locationSchema), items: z.array(itemSchema), stock: z.array(stockSchema),
  deliveries: z.array(deliverySchema), transfers: z.array(transferSchema), counts: z.array(countSheetSchema),
  accounts: z.array(accountSchema).optional(),
}).passthrough();
export const historyEntrySchema = z.object({
  id: z.number().int(), location_id: text, item_id: text, type: text,
  delta: nullableAmount, balance: nullableAmount, actor: text, reference: nullableText, note: nullableText,
  created_at: text, balance_known: integerBooleanSchema, delta_known: integerBooleanSchema,
  actor_name: text, performed_by: nullableText, already_counted: nullableAmount,
}).passthrough();
export const historySchema = z.object({ entries: z.array(historyEntrySchema), next: z.number().int().nullable() }).passthrough();
export const reportRowSchema = z.object({
  location_id: text, item_id: text, beginning: nullableAmount, ending: nullableAmount, opening: z.boolean(),
  beginningAt: nullableText, endingAt: nullableText, usage: nullableAmount,
  purchases: amount, incoming: amount, outgoing: amount, onHand: nullableAmount, value: nullableAmount,
}).passthrough();
export const reportSchema = z.object({ week: text, rows: z.array(reportRowSchema) }).passthrough();

export type Health = z.infer<typeof healthSchema>;
export type LoginResponse = z.infer<typeof loginSchema>;
export type User = z.infer<typeof userSchema>;
export type Location = z.infer<typeof locationSchema>;
export type Item = z.infer<typeof itemSchema>;
export type Stock = z.infer<typeof stockSchema>;
export type Snapshot = z.infer<typeof snapshotSchema>;
export type HistoryEntry = z.infer<typeof historyEntrySchema>;
export type History = z.infer<typeof historySchema>;
export type ReportRow = z.infer<typeof reportRowSchema>;
export type Report = z.infer<typeof reportSchema>;

export interface LoginInput { username: string; password: string; native?: boolean }
export interface HistoryFilters {
  location?: string | null; before?: number | string | null; q?: string; person?: string;
  from?: string; to?: string; type?: string; order?: 'newest' | 'oldest';
}
export interface ReportParams { location?: string | null; week?: string }
export type QuantityInput = string | number;
export interface QuantityLine { item: string; quantity: QuantityInput; unit: string }
export interface CountLine { item: string; quantity: QuantityInput; unit?: string; revision: number }
export interface CatalogItemInput {
  name: string; category: string; unit: string; sku?: string; caseSize?: QuantityInput; supplier?: string;
}
export interface RemainingLine { id: string; outstanding: number }
export interface ReceiptInput {
  quantity: QuantityInput; unit: string; receiver: string; note?: string; countSheet?: string | null;
}
export interface ActionInputs {
  counts: QuantityLine & { location: string; revision: number; note?: string };
  'count-sheets': { location: string; category: string; performedBy: string; lines: CountLine[]; note?: string };
  thresholds: { location: string; item: string; quantity: QuantityInput | null; unit: string };
  'system-thresholds': { item: string; total: QuantityInput | null; locations: Record<string, QuantityInput | null> };
  prices: { item: string; cost: QuantityInput | null };
  'count-units': { item: string; unit: string };
  items: CatalogItemInput;
  deliveries: { location: string; supplier: string; note?: string;
    lines: Array<{ quantity: QuantityInput; unit: string } & ({ item: string; newItem?: never } | { newItem: CatalogItemInput; item?: never })> };
  receipts: ReceiptInput & { line: string; photo?: string | null };
  'delivery-receipts-all': { delivery: string; receiver: string; lines: RemainingLine[]; note?: string; photo?: string | null };
  transfers: { source: string; destination: string; note?: string } & (QuantityLine | { lines: QuantityLine[] });
  'transfer-receipts': ReceiptInput & { transfer: string; final: boolean };
  'transfer-receipts-all': { transfer: string; receiver: string; lines: RemainingLine[]; note?: string };
  'staff-passwords': { account: string; password: string };
}
export interface DeliveryReceiptResult { id: string; received: number; outstanding: number; onHand: number | null }
export interface TransferReceiptResult { id: string; received: number; inTransit: number; discrepancy: number; onHand: number | null }
export interface TransferResult { id: string; inTransit: number; onHand: number | null }
export interface ActionResults {
  counts: { onHand: number | null; delta: number | null };
  'count-sheets': { id: string; counted: number };
  thresholds: { threshold: number | null; low: boolean };
  'system-thresholds': { ok: true };
  prices: { cost: number | null };
  'count-units': { unit: string };
  items: { id: string };
  deliveries: { id: string; lineIds: string[] };
  receipts: DeliveryReceiptResult;
  'delivery-receipts-all': { receipts: DeliveryReceiptResult[] };
  transfers: TransferResult | { id: string; lines: TransferResult[] };
  'transfer-receipts': TransferReceiptResult;
  'transfer-receipts-all': { receipts: TransferReceiptResult[] };
  'staff-passwords': { ok: true };
}
export type ActionName = keyof ActionInputs;
