const ACTIONS = new Set(['harder', 'easier', 'to_mc', 'to_open', 'to_fill_blank', 'to_true_false', 'child_friendly', 'swiss_context', 'more_variety', 'better_distractors', 'precise_answer'])
const TYPES = new Set(['multiple_choice', 'true_false', 'open', 'math', 'fill_blank', 'matching', 'ordering', 'either_or', 'image'])
const VIEWS = new Set(['create', 'library', 'upload', 'templates', 'curriculum', 'planner', 'students', 'classes', 'exports', 'settings', 'home'])
const LEVELS = new Set(['easy', 'medium', 'hard'])

export function validateChatToolCall(name, input = {}, context = {}) {
  const args = input && typeof input === 'object' ? input : {}
  switch (name) {
    case 'modify_question': {
      const questionIndex = Number(args.questionIndex)
      if (!Number.isInteger(questionIndex) || questionIndex < 0 || questionIndex >= Number(context.questionCount || 0)) throw new Error('Ungueltiger Fragenindex.')
      if (!ACTIONS.has(args.action)) throw new Error('Unbekannte Bearbeitungsaktion.')
      return { questionIndex, action: args.action, customInstruction: String(args.customInstruction || '').slice(0, 500) }
    }
    case 'add_questions': {
      const count = Number(args.count)
      if (!Number.isInteger(count) || count < 1 || count > 5) throw new Error('Es sind 1 bis 5 neue Fragen erlaubt.')
      if (!TYPES.has(args.type)) throw new Error('Unbekannter Fragetyp.')
      if (args.difficulty && !LEVELS.has(args.difficulty)) throw new Error('Ungueltige Schwierigkeit.')
      return { count, type: args.type, topic: String(args.topic || '').slice(0, 200), difficulty: args.difficulty || 'medium' }
    }
    case 'export_worksheet':
      if (!['pdf', 'docx'].includes(args.format) || !['student', 'teacher'].includes(args.version)) throw new Error('Ungueltiger Export.')
      return { format: args.format, version: args.version }
    case 'navigate_to':
      if (!VIEWS.has(args.view)) throw new Error('Unbekannte Ansicht.')
      return { view: args.view }
    case 'regenerate_worksheet':
      if (!LEVELS.has(args.difficulty)) throw new Error('Ungueltige Schwierigkeit.')
      return { difficulty: args.difficulty, focus: String(args.focus || '').slice(0, 300) }
    case 'create_differentiated_versions': {
      const levels = [...new Set(Array.isArray(args.levels) ? args.levels : [])].filter(level => LEVELS.has(level)).slice(0, 3)
      if (!levels.length) throw new Error('Mindestens eine gueltige Stufe ist erforderlich.')
      return { levels }
    }
    default:
      throw new Error(`Unbekannte Aktion: ${name}`)
  }
}
