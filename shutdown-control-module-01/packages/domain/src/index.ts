import type { z } from 'zod';
import type { activityStatus, dependencyType, operation } from '@shutdown/contracts';

export class DomainError extends Error { constructor(public readonly code: string, message: string, public readonly status = 422) { super(message); } }
export const ensureTransition = (status: z.infer<typeof activityStatus>, op: z.infer<typeof operation>, milestone: boolean): z.infer<typeof activityStatus> => {
  const allowed: Record<typeof op, readonly string[]> = { START:['NOT_STARTED'], PAUSE:['IN_PROGRESS'], RESUME:['PAUSED'], FINISH: milestone ? ['NOT_STARTED','IN_PROGRESS','PAUSED'] : ['IN_PROGRESS','PAUSED'] };
  if (!allowed[op]!.includes(status)) throw new DomainError('INVALID_TRANSITION', `${op} is not allowed from ${status}`);
  return op === 'FINISH' ? 'COMPLETED' : op === 'PAUSE' ? 'PAUSED' : 'IN_PROGRESS';
};
export function assertProgress(currentBp: number, lastObservedAt: Date | null, nextBp: number, observedAt: Date): void { if (nextBp < currentBp) throw new DomainError('PROGRESS_REGRESSION','progress cannot regress'); if (lastObservedAt && observedAt < lastObservedAt) throw new DomainError('STALE_PROGRESS','observedAt precedes the latest effective report',409); }
export function assertNoCycle(edges: ReadonlyArray<{ predecessorId:string; successorId:string }>, predecessorId: string, successorId: string): void { if (predecessorId === successorId) throw new DomainError('SELF_DEPENDENCY','activity cannot depend on itself'); const graph = new Map<string,string[]>(); for (const e of edges) graph.set(e.predecessorId,[...(graph.get(e.predecessorId)??[]),e.successorId]); const seen=new Set<string>(); const visit=(id:string):boolean=>{if(id===predecessorId)return true;if(seen.has(id))return false;seen.add(id);return (graph.get(id)??[]).some(visit);}; if(visit(successorId)) throw new DomainError('DEPENDENCY_CYCLE','dependency would create a cycle',409); }
export const schedulingImpact = (entity: 'activity'|'dependency'|'allocation'|'resource'|'calendar'|'wbs'): boolean => entity !== 'wbs';
export const isWritableRole = (role: string) => role === 'ADMIN' || role === 'PLANNER' || role === 'SUPERVISOR';
export const dependencyTypes: readonly z.infer<typeof dependencyType>[] = ['FS','SS','FF','SF'];
