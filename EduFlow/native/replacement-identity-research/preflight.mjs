import { fixturePlan, RESULTS } from './model.mjs'
if (process.argv.length !== 3 || process.argv[2] !== '--describe') {
  console.error('Only --describe is supported. No experiment execution entry point exists.')
  process.exitCode = 3
} else {
  console.log(JSON.stringify({
    HARNESS_IMPLEMENTATION: 'INCOMPLETE', EXPERIMENT_TARGET: 'NOT_PROVISIONED', EXPERIMENT_EXECUTION: 'NOT_PERFORMED',
    fixture_plan: fixturePlan(), result_classes: RESULTS,
    outstanding: ['native actor/coordinator and persistent raw sink integration', 'independent candidate correlation producer', 'reviewed notification end-boundary evidence'],
    QI_04: 'BLOCKED', QI_05: 'INCOMPLETE', outside_root_mutations: 'UNPROVEN', paid_authority: false,
  }, null, 2))
}
