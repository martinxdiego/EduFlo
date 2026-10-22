import { LEHRPLAN_CYCLES } from '../data/lehrplan21.js'
import { VERIFIED_CURRICULUM } from '../data/verified-curriculum.js'

// Historical planning ideas remain available, but never acquire source authority
// from matching an official-looking code or appearing beside a verified stage.
export function curriculumCycles({ drafts = false } = {}) {
  return LEHRPLAN_CYCLES.map(cycle => ({
    ...cycle,
    areas: cycle.areas.map(area => ({
      ...area,
      competencies: drafts
        ? (area.competencies || []).map(item => ({ ...item, cycle: cycle.id, subject: area.name, sourceVerified: false, level: 'Ungeprüfter Entwurf' }))
        : VERIFIED_CURRICULUM.filter(item => item.cycle === cycle.id && item.subject === area.name)
          .map(item => ({ ...item, level: 'Quellengeprüfte Stufe' })),
    })).filter(area => area.competencies.length),
  })).filter(cycle => cycle.areas.length)
}
