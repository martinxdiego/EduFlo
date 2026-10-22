import { nonProduction, result } from './contracts.mjs'

export const REQUIRED_GATES = Object.freeze(['collector', 'ledger', 'launcher', 'observer_controls', 'oracle', 'matrix', 'durability_protocol',
  'evidence', 'cleanup', 'release_truth', 'no_paid_authority', 'production_closed'])
export function qualificationDeploymentReadiness() {
  nonProduction()
  // No caller supplied booleans or synthetic receipts can cross the actual-lab gate.
  return Object.freeze({ ...result('BLOCKED', 'INDEPENDENT_COMPONENT_LAB_AND_TARGET_BINDINGS_REQUIRED'),
    real_component_lab_verification: 'NOT_PERFORMED', missing: REQUIRED_GATES })
}
