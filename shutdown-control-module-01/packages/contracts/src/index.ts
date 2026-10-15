import { z } from 'zod';

export const uuid = z.string().uuid();
export const instant = z.string().datetime({ offset: true, precision: 3 });
export const commandId = uuid.brand<'CommandId'>();
export const decimal = z.string().regex(/^\d+(?:\.\d{1,6})?$/, 'decimal string');
export const nonNegativeDecimal = decimal.refine((x) => BigInt(x.replace('.', '')) >= 0n);
export const version = z.number().int().min(0).max(2_147_483_647);
export const operation = z.enum(['START', 'PAUSE', 'RESUME', 'FINISH']);
export const dependencyType = z.enum(['FS', 'SS', 'FF', 'SF']);
export const role = z.enum(['ADMIN', 'PLANNER', 'SUPERVISOR', 'OPERATOR', 'VIEWER']);
export const activityStatus = z.enum(['NOT_STARTED', 'IN_PROGRESS', 'PAUSED', 'COMPLETED', 'ARCHIVED']);
export const blockerKind = z.enum(['INFORMATIONAL', 'BLOCKING']);

const common = z.object({ commandId, expectedVersion: version.optional() }).strict();
export const createShutdown = common.extend({ id: uuid, code: z.string().trim().min(1).max(64), name: z.string().trim().min(1).max(240), timezone: z.string().min(1).max(80) }).strict();
export const createActivity = common.extend({ id: uuid, wbsId: uuid.optional(), code: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(240), isMilestone: z.boolean().default(false), plannedDurationMinutes: z.number().int().min(0).max(10_000_000).optional(), weight: decimal.optional() }).strict();
export const updateActivity = common.extend({ name: z.string().trim().min(1).max(240).optional(), code: z.string().trim().min(1).max(80).optional(), archived: z.boolean().optional(), plannedDurationMinutes: z.number().int().min(0).max(10_000_000).nullable().optional() }).strict().refine((x) => Object.keys(x).some((k) => !['commandId', 'expectedVersion'].includes(k)), 'no changes');
export const createDependency = common.extend({ predecessorId: uuid, successorId: uuid, type: dependencyType, lagWorkingMinutes: z.number().int().min(-1_000_000).max(1_000_000).default(0) }).strict();
export const createProgress = common.extend({ progressBp: z.number().int().min(0).max(9_999), hoursIncrement: nonNegativeDecimal.default('0'), remainingDurationMinutes: z.number().int().min(0).max(10_000_000).nullable().optional(), note: z.string().trim().max(2_000).optional(), observedAt: instant, evidenceIds: z.array(uuid).max(10).default([]) }).strict();
export const correction = common.extend({ replacesReportId: uuid, progressBp: z.number().int().min(0).max(10_000), hoursIncrement: nonNegativeDecimal, note: z.string().trim().min(5).max(2_000), justification: z.string().trim().min(5).max(2_000), observedAt: instant }).strict();
export const transition = common.extend({ operation, observedAt: instant, note: z.string().trim().max(2_000).optional() }).strict();
export const createBlocker = common.extend({ id: uuid, kind: blockerKind, title: z.string().trim().min(1).max(240), description: z.string().trim().max(2_000).optional(), observedAt: instant }).strict();
export const resolveBlocker = common.extend({ justification: z.string().trim().min(5).max(2_000), observedAt: instant }).strict();
export const membershipUpdate = common.extend({ role, active: z.boolean() }).strict();
export const subscribe = z.object({ shutdownId: uuid, after: z.coerce.number().int().min(0).default(0) }).strict();

export type CreateShutdown = z.infer<typeof createShutdown>;
export type CreateActivity = z.infer<typeof createActivity>;
export type CreateProgress = z.infer<typeof createProgress>;
export type DomainEvent<T = unknown> = { shutdownId: string; sequence: bigint; type: string; occurredAt: string; payload: T };
export type RealtimeEvent = { kind: 'event'; event: DomainEvent } | { kind: 'sync.required'; headSequence: bigint } | { kind: 'access.revoked'; shutdownId: string };
export type ApiError = { code: string; message: string; requestId: string; details?: unknown };
export interface SchedulingInput { shutdownId: string; inputRevision: bigint; activities: ReadonlyArray<{ id: string; durationMinutes: number | null }>; dependencies: ReadonlyArray<{ predecessorId: string; successorId: string; type: z.infer<typeof dependencyType>; lagWorkingMinutes: number }>; }
export interface SchedulingOutput { inputRevision: bigint; activities: ReadonlyArray<{ activityId: string; startAt: string; finishAt: string; totalFloatMinutes: number; critical: boolean }>; }
export interface SchedulingEngine { calculate(input: SchedulingInput): Promise<SchedulingOutput>; }
export interface EvidenceStorage { confirm(evidenceIds: readonly string[]): Promise<readonly string[]>; }
