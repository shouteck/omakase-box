import { isUuid, ASSIGNMENT_DDL } from './assignments.js';

export const DEFECT_REJECTIONS = ['invalid_input', 'not_found', 'reservation_expired', 'reservation_closed'] as const;
export type DefectRejection = typeof DEFECT_REJECTIONS[number];

/** Fixed safe boundary error: only the code is enumerable on the wire. */
export class DefectRejected extends Error {
  readonly code: DefectRejection;
  constructor(code: DefectRejection) {
    super(code);
    Object.defineProperty(this, 'name', { value: 'DefectRejected', enumerable: false, writable: false, configurable: true });
    this.code = code;
  }
}

export const DEFECT_CATEGORIES = ['missing_context', 'missing_dependency', 'environment_failure', 'documentation_failure', 'other'] as const;
export type DefectCategory = typeof DEFECT_CATEGORIES[number];

export type DefectCaller = { id: string; role: 'contributor' };

export interface DefectInput {
  taskId: unknown;
  taskVersion: unknown;
  reservationId: unknown;
  category: unknown;
  description: unknown;
  idempotencyKey: unknown;
}

export interface DefectReportView {
  schemaVersion: 1;
  id: string;
  taskId: string;
  taskVersion: number;
  reservationId: string;
  category: DefectCategory;
  description: string;
  receivedAt: string;
}

interface DefectRecord {
  id: string;
  taskId: string;
  taskVersion: number;
  reservationId: string;
  contributorId: string;
  category: DefectCategory;
  description: string;
  idempotencyKey: string;
  receivedAtMs: number;
}

export interface DefectReservationSource {
  reservation(caller: DefectCaller, reservationId: unknown, nowMs: number): Promise<{ schemaVersion: 1; taskId: string; taskVersion: number; contributorId: string; state: string; expiresAt: string }>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const MAX_DEFECT_DESCRIPTION = 4000;

export interface DefectReservationView {
  taskId: string;
  taskVersion: number;
  state: string;
  expiresAt: string;
}

/**
 * Structured `package_defect` report store (M6.2). Typed bounded schema,
 * reservation-scoped, idempotent per (contributor, idempotency key). Owner
 * side handling (freeze/withdraw/compensation) stays a later M7 concern;
 * other contributors' reports stay invisible.
 */
export class MemoryDefectReportStore {
  private readonly reports = new Map<string, DefectRecord>();
  private readonly byKey = new Map<string, DefectRecord>();

  constructor(private readonly reservations: DefectReservationSource) {}

  async file(caller: DefectCaller, input: DefectInput, nowMs: number): Promise<DefectReportView> {
    if (typeof caller?.id !== 'string' || caller.role !== 'contributor') throw new DefectRejected('not_found');
    if (!isUuid(input.taskId) || !Number.isSafeInteger(input.taskVersion) || (input.taskVersion as number) < 1 || (input.taskVersion as number) > 2147483647 || !isUuid(input.reservationId) || !isUuid(input.idempotencyKey)) throw new DefectRejected('invalid_input');
    if (typeof input.category !== 'string' || !DEFECT_CATEGORIES.includes(input.category as DefectCategory)) throw new DefectRejected('invalid_input');
    if (typeof input.description !== 'string' || input.description.length < 12 || input.description.length > MAX_DEFECT_DESCRIPTION) throw new DefectRejected('invalid_input');
    const view = await this.reservations.reservation(caller, input.reservationId, nowMs);
    if (view.taskId !== input.taskId || view.taskVersion !== input.taskVersion) throw new DefectRejected('invalid_input');
    if (view.state === 'expired' || !Number.isFinite(Date.parse(view.expiresAt)) || Date.parse(view.expiresAt) <= nowMs) throw new DefectRejected('reservation_expired');
    if (view.state === 'cancelled' || view.state === 'accepted') throw new DefectRejected('reservation_closed');
    const key = `${caller.id}:${input.idempotencyKey as string}`;
    const existing = this.byKey.get(key);
    if (existing) {
      if (existing.taskId !== input.taskId || existing.taskVersion !== input.taskVersion || existing.reservationId !== input.reservationId || existing.category !== input.category || existing.description !== input.description) throw new DefectRejected('invalid_input');
      return projection(existing);
    }
    const id = crypto.randomUUID();
    const record: DefectRecord = {
      id,
      taskId: input.taskId as string,
      taskVersion: input.taskVersion as number,
      reservationId: input.reservationId as string,
      contributorId: caller.id,
      category: input.category as DefectCategory,
      description: input.description as string,
      idempotencyKey: input.idempotencyKey as string,
      receivedAtMs: nowMs
    };
    this.reports.set(id, record);
    this.byKey.set(key, record);
    return projection(record);
  }

  async listOwn(caller: DefectCaller, reservationId: unknown, nowMs: number): Promise<DefectReportView[]> {
    if (typeof caller?.id !== 'string' || caller.role !== 'contributor') throw new DefectRejected('not_found');
    if (!isUuid(reservationId)) throw new DefectRejected('not_found');
    await this.reservations.reservation(caller, reservationId, nowMs);
    const found: DefectReportView[] = [];
    for (const record of this.reports.values()) {
      if (record.reservationId === reservationId && record.contributorId === caller.id) found.push(projection(record));
    }
    return found.sort((left, right) => left.receivedAt.localeCompare(right.receivedAt) || left.id.localeCompare(right.id));
  }
}

function projection(record: DefectRecord): DefectReportView {
  return {
    schemaVersion: 1,
    id: record.id,
    taskId: record.taskId,
    taskVersion: record.taskVersion,
    reservationId: record.reservationId,
    category: record.category,
    description: record.description,
    receivedAt: new Date(record.receivedAtMs).toISOString()
  };
}
