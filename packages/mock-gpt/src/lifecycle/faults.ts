/** Finite lifecycle fault plans, resolved once per accepted operation. */
import { resourceError } from './store.js';
export type LifecycleFaultKind =
  | 'reject-before-accept'
  | 'lose-ack'
  | 'reverse-results'
  | 'missing-item'
  | 'duplicate-item'
  | 'fail-item';
export interface LifecycleFault {
  kind: LifecycleFaultKind;
  operation?: number;
  itemId?: string;
}
export const lifecycleFaultCatalog = Object.freeze({
  'reject-before-accept': { stage: 'before-accept' },
  'lose-ack': { stage: 'after-accept' },
  'reverse-results': { stage: 'results' },
  'missing-item': { stage: 'results' },
  'duplicate-item': { stage: 'results' },
  'fail-item': { stage: 'generation' },
} as const);
export function validateFaults(faults: readonly LifecycleFault[]) {
  for (const fault of faults) {
    if (
      !fault ||
      !Object.hasOwn(lifecycleFaultCatalog, fault.kind) ||
      (fault.operation !== undefined &&
        (!Number.isSafeInteger(fault.operation) || fault.operation < 1)) ||
      (fault.itemId !== undefined && typeof fault.itemId !== 'string')
    )
      throw resourceError('MOCK_CONFIG', 'Invalid lifecycle.faults plan');
  }
}
export function faultsAt(faults: readonly LifecycleFault[], operation: number, stage: string) {
  return faults.filter(
    (f) =>
      (f.operation === undefined || f.operation === operation) &&
      lifecycleFaultCatalog[f.kind].stage === stage,
  );
}
