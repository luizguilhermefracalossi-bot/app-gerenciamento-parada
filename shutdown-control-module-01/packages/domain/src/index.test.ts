import { describe, expect, it } from 'vitest'; import { assertNoCycle, ensureTransition } from './index.js';
describe('domain invariants',()=>{it('rejects cycle',()=>expect(()=>assertNoCycle([{predecessorId:'a',successorId:'b'}],'b','a')).toThrow('cycle'));it('permits lifecycle',()=>expect(ensureTransition('NOT_STARTED','START',false)).toBe('IN_PROGRESS'));});
