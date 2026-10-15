import type { SchedulingEngine, SchedulingInput, SchedulingOutput } from '@shutdown/contracts';
export class EngineUnavailableError extends Error { readonly code = 'ENGINE_UNAVAILABLE'; constructor(){ super('Scheduling engine is unavailable'); } }
export class UnavailableSchedulingEngine implements SchedulingEngine { async calculate(_input: SchedulingInput): Promise<SchedulingOutput> { throw new EngineUnavailableError(); } }
