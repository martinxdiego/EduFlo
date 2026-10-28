'use client'

import { useEffect, useRef, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, BookOpen, Check, CheckCircle2, ChevronDown, Copy, Download, FileText, FolderOpen, HardDrive, Image as ImageIcon, Info, Layers, Link2, LoaderCircle, PencilLine, Plus, RotateCcw, Save, ShieldCheck, Trash2, Upload, X } from 'lucide-react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/ui/alert-dialog'
import { FlowMark } from '@/components/EduFlowMotion'
import { DEMO_MAX_BYTES, createDemoLibrary, createDemoQuestion, createDemoWorksheet, parseDemoBackup, readDemoLibrary, saveDemoLibrary, serializeDemoBackup } from '@/lib/demo-store'
import { answerItems, joinAnswerItems, matchingPairs, normalizeQuestion, trueFalseLabel } from '@/lib/worksheet-answers'
import { shuffledMatchingRight, shuffledOrderingItems } from '@/lib/student-material'
import styles from './DemoWorkspace.module.css'

const questionTypes = [
  ['open', 'Offene Frage'], ['multiple_choice', 'Multiple Choice'], ['true_false', 'Wahr oder falsch'],
  ['math', 'Rechenaufgabe'], ['matching', 'Zuordnung'], ['fill_blank', 'Lückentext'],
  ['ordering', 'Reihenfolge'], ['either_or', 'Entweder oder'], ['table', 'Tabelle'],
  ['image', 'Bilderfrage'], ['image_block', 'Bildfeld'],
]
const typeLabel = (type) => questionTypes.find(([id]) => id === type)?.[1] || 'Aufgabe'
const clone = (value) => JSON.parse(JSON.stringify(value))
const withQuestionIds = (state) => ({
  ...state,
  materials: state.materials.map((material) => ({
    ...material,
    content: {
      ...material.content,
      questions: material.content.questions.map((question, index) => ({
        ...question,
        id: question.id || createDemoQuestion(question.type).id,
        number: index + 1,
      })),
    },
  })),
})
const textAnswer = (answer) => answer == null ? '' : typeof answer === 'object' ? joinAnswerItems(answerItems(answer)) : String(answer)
const themes = [{ id: 'classic', name: 'Klassisch', className: styles.classic }, { id: 'natur', name: 'Natur', className: styles.nature }, { id: 'ozean', name: 'Ozean', className: styles.ocean }, { id: 'weltraum', name: 'Weltraum', className: styles.space }]

function downloadBackup(text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `EduFlow-Demo-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function ImagePlaceholder({ caption }) {
  return <div className={styles.imagePlaceholder}>
    <svg viewBox="0 0 300 125" aria-hidden="true"><circle cx="219" cy="32" r="13" fill="#f4dca9" /><path d="m0 119 74-75 65 62 48-39 113 52H0Z" fill="#d4e3e4" /><path d="m0 119 76-40 88 40H0Z" fill="#b6d1cf" /><path d="M73 24c-4-12-22-14-29-2-14-3-22 5-18 14h67c5-11-8-19-20-12Z" fill="#e5edf8" /></svg>
    <span><ImageIcon aria-hidden="true" /> {caption || 'Platz für eine eigene Zeichnung'}</span>
    <small>Bildplatzhalter · in dieser Demo werden keine Bilder hochgeladen.</small>
  </div>
}

function QuestionPreview({ source, index, solutions }) {
  const question = normalizeQuestion({ ...source, number: index + 1 })
  const isChoices = ['multiple_choice', 'true_false', 'either_or'].includes(question.type)
  const pairs = question.type === 'matching' ? matchingPairs(question.answer) : []
  const rightSide = question.type === 'matching' ? (solutions ? pairs.map((pair) => ({ text: pair[1] })) : shuffledMatchingRight(question)) : []
  const ordering = question.type === 'ordering' ? (solutions ? answerItems(question.answer) : shuffledOrderingItems(question)) : []

  return <section className={styles.previewQuestion}>
    <div className={styles.previewQuestionTitle}><span>{String(index + 1).padStart(2, '0')}</span><h3>{question.question || 'Aufgabentext ergänzen'}</h3><small>{typeLabel(question.type)}</small></div>
    {isChoices ? <div className={styles.choiceList}>{(question.options || (question.type === 'true_false' ? ['Wahr', 'Falsch'] : [])).map((option, optionIndex) => <div key={optionIndex} className={solutions && option === question.answer ? styles.correctChoice : ''}><span>{solutions && option === question.answer ? <Check aria-hidden="true" /> : null}</span>{option}</div>)}</div> : null}
    {question.type === 'matching' ? <div className={styles.matchingPreview}>{pairs.map((pair, pairIndex) => <div key={pairIndex}><span>{pair[0]}</span><i>↔</i><span>{rightSide[pairIndex]?.text || ''}</span></div>)}</div> : null}
    {question.type === 'ordering' ? <ol className={styles.orderingPreview}>{ordering.map((item, itemIndex) => <li key={itemIndex}><span>{solutions ? itemIndex + 1 : '·'}</span>{item}</li>)}</ol> : null}
    {question.type === 'fill_blank' ? <p className={styles.wordBank}>Wortliste: {(solutions ? answerItems(question.answer) : shuffledOrderingItems(question)).join(' · ') || 'Noch keine Wörter eingetragen'}</p> : null}
    {question.type === 'table' ? <div className={styles.tableScroll}><table><thead><tr>{(question.tableHeaders || []).map((header, column) => <th key={column}>{header || `Spalte ${column + 1}`}</th>)}</tr></thead><tbody>{(question.tableRows || []).map((row, rowIndex) => <tr key={rowIndex}>{row.map((cell, column) => <td key={column}>{cell || <span aria-label="Leeres Feld">&nbsp;</span>}</td>)}</tr>)}</tbody></table></div> : null}
    {['image', 'image_block'].includes(question.type) ? <ImagePlaceholder caption={question.imageCaption || question.caption} /> : null}
    {!solutions && ['open', 'math', 'image'].includes(question.type) ? <div className={styles.writingLines} aria-label="Platz für eine Antwort"><span /><span /><span /></div> : null}
    {solutions && question.answer && !['matching', 'ordering'].includes(question.type) ? <div className={styles.solutionBox}><CheckCircle2 aria-hidden="true" /><div><strong>Lösungshinweis</strong><p>{question.type === 'fill_blank' ? answerItems(question.answer).join(' · ') : String(question.answer)}</p></div></div> : null}
    {solutions && question.explanation ? <p className={styles.explanation}>{question.explanation}</p> : null}
  </section>
}

function QuestionEditor({ question, index, total, onChange, onMove, onDelete, onTypeChange }) {
  const pairs = question.type === 'matching' ? matchingPairs(question.answer) : []
  const updatePair = (pairIndex, side, value) => {
    const nextPairs = pairs.map((pair) => [...pair])
    nextPairs[pairIndex][side] = value
    onChange({ answer: nextPairs.map(([left, right]) => ({ left, right })) })
  }
  const scalarAnswer = ['true_false'].includes(question.type) ? trueFalseLabel(question.answer) : textAnswer(question.answer)

  return <div className={styles.questionEditor}>
    <div className={styles.editorCardTop}><span className={styles.questionNumber}>AUFGABE {String(index + 1).padStart(2, '0')}</span><div className={styles.iconActions}><button type="button" onClick={() => onMove(-1)} disabled={index === 0} aria-label="Aufgabe nach oben verschieben"><ArrowUp /></button><button type="button" onClick={() => onMove(1)} disabled={index === total - 1} aria-label="Aufgabe nach unten verschieben"><ArrowDown /></button><button type="button" onClick={onDelete} aria-label="Aufgabe entfernen" className={styles.dangerIcon}><Trash2 /></button></div></div>
    <div className={styles.field}><label htmlFor="demo-question-type">Aufgabentyp</label><select id="demo-question-type" value={question.type} onChange={(event) => onTypeChange(event.target.value)}>{questionTypes.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></div>
    <div className={styles.field}><label htmlFor="demo-question-text">{question.type === 'image_block' ? 'Überschrift oder Arbeitsauftrag' : 'Aufgabentext'}</label><textarea id="demo-question-text" value={question.question} maxLength={6000} onChange={(event) => onChange({ question: event.target.value })} placeholder="Was soll deine Klasse entdecken?" rows={4} /></div>
    {['multiple_choice', 'either_or'].includes(question.type) ? <div className={styles.field}><label htmlFor="demo-options">Antwortmöglichkeiten</label><textarea id="demo-options" rows={4} value={(question.options || []).join('\n')} onChange={(event) => onChange({ options: event.target.value.split('\n').slice(0, 20).map((item) => item.slice(0, 1000)) })} maxLength={20_000} /><p>Eine Antwortmöglichkeit pro Zeile. Höchstens 20.</p></div> : null}
    {question.type === 'matching' ? <div className={styles.pairsEditor}><div className={styles.labelRow}><h3>Zuordnungspaare</h3><span>{pairs.length} / 12</span></div>{pairs.map((pair, pairIndex) => <div className={styles.pairRow} key={pairIndex}><input value={pair[0]} aria-label={`Begriff ${pairIndex + 1}`} maxLength={1000} onChange={(event) => updatePair(pairIndex, 0, event.target.value)} placeholder="Begriff" /><span aria-hidden="true">→</span><input value={pair[1]} aria-label={`Erklärung ${pairIndex + 1}`} maxLength={1000} onChange={(event) => updatePair(pairIndex, 1, event.target.value)} placeholder="Erklärung" /><button type="button" className={styles.smallIconButton} onClick={() => onChange({ answer: pairs.filter((_, itemIndex) => itemIndex !== pairIndex).map(([left, right]) => ({ left, right })) })} aria-label={`Zuordnungspaar ${pairIndex + 1} entfernen`}><X /></button></div>)}<button type="button" className={styles.subtleButton} onClick={() => onChange({ answer: [...pairs.map(([left, right]) => ({ left, right })), { left: '', right: '' }] })} disabled={pairs.length >= 12}><Plus /> Paar hinzufügen</button></div> : null}
    {['ordering', 'fill_blank'].includes(question.type) ? <div className={styles.field}><label htmlFor="demo-answer-list">{question.type === 'ordering' ? 'Schritte in der richtigen Reihenfolge' : 'Lösungswörter in der Reihenfolge der Lücken'}</label><textarea id="demo-answer-list" rows={4} value={answerItems(question.answer).join('\n')} onChange={(event) => onChange({ answer: event.target.value.split('\n').slice(0, 50) })} maxLength={6000} /><p>Ein Eintrag pro Zeile. Die Schüleransicht mischt Reihenfolgen automatisch.</p></div> : null}
    {question.type === 'true_false' ? <div className={styles.field}><label htmlFor="demo-true-false">Richtige Antwort</label><select id="demo-true-false" value={scalarAnswer || 'Falsch'} onChange={(event) => onChange({ answer: event.target.value === 'Wahr', options: ['Wahr', 'Falsch'] })}><option value="Wahr">Wahr</option><option value="Falsch">Falsch</option></select></div> : null}
    {!['ordering', 'fill_blank', 'matching', 'true_false', 'image_block'].includes(question.type) ? <div className={styles.field}><label htmlFor="demo-answer">Musterlösung</label><textarea id="demo-answer" rows={3} value={scalarAnswer} onChange={(event) => onChange({ answer: event.target.value })} maxLength={6000} placeholder="Dein Lösungshinweis" /><p>In der Schüleransicht bleibt die Musterlösung verborgen.</p></div> : null}
    {question.type === 'table' ? <><div className={styles.field}><label htmlFor="demo-table-headers">Tabellenspalten</label><textarea id="demo-table-headers" rows={3} value={(question.tableHeaders || []).join('\n')} maxLength={8000} onChange={(event) => onChange({ tableHeaders: event.target.value.split('\n').slice(0, 8).map((item) => item.slice(0, 1000)) })} /><p>Eine Spaltenüberschrift pro Zeile, höchstens acht.</p></div><div className={styles.field}><label htmlFor="demo-table-rows">Tabellenzeilen</label><textarea id="demo-table-rows" rows={4} value={(question.tableRows || []).map((row) => row.join(' | ')).join('\n')} maxLength={20_000} onChange={(event) => onChange({ tableRows: event.target.value.split('\n').slice(0, 20).map((row) => row.split('|').slice(0, 8).map((cell) => cell.trim().slice(0, 1000))) })} /><p>Eine Tabellenzeile pro Zeile. Trenne Spalten mit |. Tabelleninhalte sind auch in der Schüleransicht sichtbar.</p></div></> : null}
    {['image', 'image_block'].includes(question.type) ? <><div className={styles.field}><label htmlFor="demo-image-caption">Bildunterschrift</label><input id="demo-image-caption" value={question.imageCaption || ''} maxLength={6000} onChange={(event) => onChange({ imageCaption: event.target.value })} placeholder="Platz für eine eigene Zeichnung" /></div><div className={styles.inlineHint}><ImageIcon /><p>Du bearbeitest hier den Arbeitsauftrag und die Bildunterschrift. Bilddateien werden in der öffentlichen Demo nicht geladen.</p></div></> : null}
  </div>
}

export default function DemoWorkspace() {
  const [library, setLibrary] = useState(null)
  const [draft, setDraft] = useState(null)
  const [ready, setReady] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [mode, setMode] = useState('edit')
  const [solutions, setSolutions] = useState(false)
  const [selectedQuestionId, setSelectedQuestionId] = useState('')
  const [questionType, setQuestionType] = useState('open')
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [notice, setNotice] = useState('')
  const [warning, setWarning] = useState('')
  const [error, setError] = useState('')
  const [exporting, setExporting] = useState('')
  const [pendingAction, setPendingAction] = useState(null)
  const importInput = useRef(null)
  const allowLeaveRef = useRef(false)

  useEffect(() => {
    let storage
    try { storage = window.localStorage } catch { storage = undefined }
    const result = readDemoLibrary(storage)
    const initialState = withQuestionIds(result.state)
    const initialMaterial = initialState.materials.find((material) => material.id === initialState.selectedId) || initialState.materials[0]
    setLibrary(initialState)
    setDraft(clone(initialMaterial))
    setSelectedQuestionId(initialMaterial.content.questions[0]?.id || '')
    setWarning(result.warning || '')
    setReady(true)
  }, [])

  useEffect(() => {
    if (!dirty) return
    const handleBeforeUnload = (event) => {
      if (allowLeaveRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [dirty])

  const selectMaterial = (material, nextLibrary = library, markDirty = false) => {
    // The library contains saved snapshots only. A new, dirty material is rendered
    // alongside it until an explicit save includes that material in the snapshot.
    setLibrary({ ...nextLibrary, selectedId: nextLibrary.materials.some((item) => item.id === material.id) ? material.id : nextLibrary.selectedId })
    setDraft(clone(material))
    setSelectedQuestionId(material.content.questions[0]?.id || '')
    setDirty(markDirty)
    setError('')
    setNotice('')
    setLibraryOpen(false)
  }

  const updateDraft = (patch) => {
    setDraft((previous) => ({ ...previous, ...patch, updated_at: new Date().toISOString() }))
    setDirty(true)
    setNotice('')
    setError('')
  }

  const updateQuestions = (questions) => updateDraft({ content: { ...draft.content, questions: questions.map((question, index) => ({ ...question, number: index + 1 })) } })
  const draftLibrary = () => {
    const currentMaterial = { ...draft, content: { ...draft.content, title: draft.title }, updated_at: new Date().toISOString() }
    const exists = library.materials.some((material) => material.id === draft.id)
    return {
      ...library,
      selectedId: draft.id,
      materials: exists ? library.materials.map((material) => material.id === draft.id ? currentMaterial : material) : [...library.materials, currentMaterial],
    }
  }

  const persist = (nextLibrary) => {
    try {
      const result = saveDemoLibrary(window.localStorage, nextLibrary)
      if (!result.ok) throw new Error(result.error || 'Lokales Speichern ist nicht möglich.')
      return true
    } catch {
      setError('Speichern auf diesem Gerät ist fehlgeschlagen. Dein Entwurf bleibt geöffnet. Lade eine JSON-Sicherung herunter und versuche es erneut.')
      return false
    }
  }

  const save = () => {
    if (!ready || !draft) return
    if (!draft.title.trim()) { setError('Bitte gib deinem Material einen Titel. Dein Entwurf bleibt erhalten.'); return }
    const nextLibrary = draftLibrary()
    if (!persist(nextLibrary)) return
    setLibrary(nextLibrary)
    setDraft(clone(nextLibrary.materials.find((material) => material.id === draft.id)))
    setDirty(false)
    setWarning('')
    setError('')
    setNotice('Auf diesem Gerät gespeichert. Deine Änderungen sind nach dem Neuladen wieder da.')
  }

  const addExample = (kind) => {
    if (library.materials.length >= 20) { setError('Du kannst höchstens 20 Materialien aufbewahren. Sichere deine Bibliothek als JSON-Datei.'); return }
    const material = createDemoWorksheet(kind)
    selectMaterial(material, library, true)
    setMode('edit')
  }

  const requestExample = (kind) => dirty ? setPendingAction({ kind: 'example', example: kind }) : addExample(kind)
  const requestMaterial = (id) => {
    if (id === draft.id) { setLibraryOpen(false); return }
    if (dirty) setPendingAction({ kind: 'switch', id })
    else selectMaterial(library.materials.find((material) => material.id === id))
  }

  const duplicate = () => {
    if (library.materials.length >= 20) { setError('Deine Demo enthält bereits 20 Materialien.'); return }
    const template = createDemoWorksheet('water')
    const copy = { ...clone(draft), id: template.id, title: `${draft.title.slice(0, 190)} (Kopie)`, created_at: template.created_at, updated_at: template.updated_at, content: { ...clone(draft.content), questions: draft.content.questions.map((question) => ({ ...clone(question), id: createDemoQuestion(question.type).id })) } }
    copy.content.title = copy.title
    selectMaterial(copy, library, true)
    setNotice('Kopie erstellt. Mit «Lokal speichern» bewahrst du sie auf diesem Gerät auf.')
  }

  const backup = () => {
    if (!draft.title.trim()) { setError('Bitte gib deinem Material zuerst einen Titel, damit es gesichert werden kann.'); return }
    try { downloadBackup(serializeDemoBackup(draftLibrary())); setNotice('JSON-Sicherung mit deinen aktuellen Änderungen heruntergeladen.'); setError('') } catch { setError('Die Sicherung konnte nicht erstellt werden. Prüfe die Eingaben und die Grösse deiner Bibliothek. Erlaubt sind höchstens 500 KB. Dein Entwurf bleibt hier geöffnet.') }
  }

  const importBackup = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > DEMO_MAX_BYTES) { setError('Die JSON-Datei ist zu gross. Erlaubt sind höchstens 500 KB.'); return }
    try { const state = withQuestionIds(parseDemoBackup(await file.text())); setPendingAction({ kind: 'import', state }) } catch { setError('Diese Datei ist keine gültige EduFlow-Demo-Sicherung. Deine bisherigen Materialien bleiben erhalten.') }
  }

  const confirmAction = () => {
    const action = pendingAction
    setPendingAction(null)
    if (action.kind === 'leave') {
      allowLeaveRef.current = true
      try { window.location.assign('/') } catch {
        allowLeaveRef.current = false
        setError('Die Startseite konnte nicht geöffnet werden. Dein Entwurf bleibt hier.')
      }
      return
    }
    if (action.kind === 'switch') selectMaterial(library.materials.find((material) => material.id === action.id))
    if (action.kind === 'example') addExample(action.example)
    if (action.kind === 'reset' || action.kind === 'import') {
      const nextLibrary = action.kind === 'reset' ? createDemoLibrary() : action.state
      if (!persist(nextLibrary)) return
      selectMaterial(nextLibrary.materials.find((material) => material.id === nextLibrary.selectedId), nextLibrary)
      setWarning('')
      setNotice(action.kind === 'reset' ? 'Demo zurückgesetzt. Das Wasserkreislauf-Beispiel ist wieder bereit.' : 'Sicherung importiert und auf diesem Gerät gespeichert.')
    }
    if (action.kind === 'delete-material') {
      const remaining = library.materials.filter((material) => material.id !== draft.id)
      const nextLibrary = remaining.length ? { ...library, materials: remaining, selectedId: remaining[0].id } : createDemoLibrary()
      if (!persist(nextLibrary)) return
      selectMaterial(nextLibrary.materials[0], nextLibrary)
      setNotice('Material von diesem Gerät entfernt.')
    }
  }

  const exportMaterial = async (format) => {
    if (exporting || !ready) return
    setExporting(format)
    setError('')
    try {
      const exporter = await import('@/lib/demo-export')
      if (format === 'PDF') await exporter.exportDemoPDF(clone(draft), { solutions })
      else await exporter.exportDemoDOCX(clone(draft), { solutions })
      setNotice(`${format}-Datei ${solutions ? 'mit Lösungshinweisen' : 'als Schülerfassung'} zum Download bereitgestellt.`)
    } catch { setError('Der Export konnte nicht abgeschlossen werden. Dein Entwurf ist weiterhin hier. Versuche es erneut oder sichere ihn als JSON-Datei.') } finally { setExporting('') }
  }

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(`${window.location.origin}/demo`); setNotice('Demo-Link kopiert. Freunde starten mit ihren eigenen Beispieldaten auf ihrem Gerät.') } catch { setError('Kopieren ist hier nicht möglich. Du kannst die Adresse dieser Seite aus der Adresszeile kopieren.') }
  }

  const requestLeave = (event) => {
    if (!dirty) return
    event.preventDefault()
    setPendingAction({ kind: 'leave' })
  }

  if (!ready || !library || !draft) return <main className={styles.startup}><FlowMark /><h1>Dein Demo-Arbeitsraum.</h1><p role="status">Die lokal gespeicherten Beispiele werden gelesen …</p></main>

  const questions = draft.content.questions
  const selectedIndex = Math.max(0, questions.findIndex((question) => question.id === selectedQuestionId))
  const selectedQuestion = questions[selectedIndex]
  const visibleMaterials = library.materials.some((material) => material.id === draft.id) ? library.materials : [...library.materials, draft]
  const themeClass = themes.find((theme) => theme.id === draft.theme)?.className || styles.classic
  const hasPendingReplacement = ['import', 'reset', 'delete-material'].includes(pendingAction?.kind)

  return <main className={`${styles.workspace} ${themeClass}`}>
    <a href="#demo-content" className={styles.skipLink}>Direkt zum Material</a>
    <header className={styles.header}><a href="/" className={styles.brand} onClick={requestLeave}><FlowMark /><span>EduFlow<span className={styles.brandSuffix}> / Demo</span></span></a><div className={styles.headerActions}><a href="/" className={styles.homeLink} onClick={requestLeave}><ArrowLeft /> Startseite</a><button type="button" className={styles.shareLink} onClick={copyLink}><Link2 /> Link kopieren</button></div></header>
    <div className={styles.demoBanner}><span><ShieldCheck /> Öffentliche Demo</span><p>Nur Beispieldaten · auf diesem Gerät gespeichert</p><span className={styles.zeroCost}>Ohne Anmeldung</span></div>
    <div className={styles.safetyNote}><Info /><p>Bitte keine echten Schülerdaten eintragen. Die Demo nutzt keine KI und verbindet sich mit keiner Datenbank. Dein Link teilt die Demo, nicht deine Materialien.</p></div>
    <div className={styles.mobileLibraryBar}><button type="button" onClick={() => setLibraryOpen((value) => !value)} aria-expanded={libraryOpen} aria-controls="demo-library"><FolderOpen /> Materialien ({visibleMaterials.length})<ChevronDown /></button><span>{dirty ? 'Ungespeichert' : 'Lokal bereit'}</span></div>
    <div className={styles.workspaceBody}>
      <aside id="demo-library" className={`${styles.sidebar} ${libraryOpen ? styles.sidebarOpen : ''}`} aria-label="Demo-Bibliothek">
        <div className={styles.sidebarHeading}><div><p>DEIN ARBEITSRAUM</p><h2>Materialien<span>{visibleMaterials.length}</span></h2></div><FolderOpen aria-hidden="true" /></div>
        <div className={styles.libraryList}>{visibleMaterials.map((material) => <button type="button" key={material.id} className={material.id === draft.id ? styles.materialSelected : ''} onClick={() => requestMaterial(material.id)} aria-pressed={material.id === draft.id}><span className={styles.materialIcon}><FileText /></span><span><strong>{material.id === draft.id ? draft.title || 'Ohne Titel' : material.title}</strong><small>{material.subject} · {material.grade}. Klasse</small></span>{material.id === draft.id ? <span className={styles.selectionDot} /> : null}</button>)}</div>
        <div className={styles.exampleChoices}><p>BEISPIELE HINZUFÜGEN</p><button type="button" onClick={() => requestExample('water')} disabled={library.materials.length >= 20}><span>💧</span> Wasserkreislauf<Plus /></button><button type="button" onClick={() => requestExample('math')} disabled={library.materials.length >= 20}><span>＋</span> Mathematik<Plus /></button><button type="button" onClick={() => requestExample('german')} disabled={library.materials.length >= 20}><span>Aa</span> Deutsch<Plus /></button></div>
        <div className={styles.localCard}><HardDrive /><strong>Dein Gerät. Dein Entwurf.</strong><p>Speichere ausdrücklich lokal. Im privaten Browsermodus oder nach dem Löschen der Browserdaten können Materialien verloren gehen.</p><button type="button" onClick={backup}><Download /> JSON-Sicherung</button></div>
        <div className={styles.sidebarTools}><input ref={importInput} type="file" accept="application/json,.json" className={styles.hiddenInput} onChange={importBackup} aria-label="EduFlow-Demo-Sicherung importieren" /><button type="button" onClick={() => importInput.current?.click()}><Upload /> Sicherung importieren</button><button type="button" onClick={() => setPendingAction({ kind: 'reset' })}><RotateCcw /> Demo zurücksetzen</button></div>
      </aside>
      <div id="demo-content" className={styles.mainContent}>
        <div className={styles.workspaceHeading}><div><p className={styles.eyebrow}>AUSPROBIEREN. ANPASSEN. MITNEHMEN.</p><h1>Dein eigener Flow.</h1><p>Ein echtes Material zum Bearbeiten – ohne Konto und ohne Wartezeit.</p></div><span className={`${styles.saveBadge} ${dirty ? styles.unsavedBadge : ''}`}>{dirty ? <PencilLine /> : <CheckCircle2 />}{dirty ? 'Änderungen ungespeichert' : 'Arbeitsraum bereit'}</span></div>
        {warning ? <div className={styles.warning} role="status"><Info /><p>{warning}</p></div> : null}
        {error ? <div className={styles.error} role="alert"><Info /><p>{error}</p><button type="button" aria-label="Fehlermeldung schliessen" onClick={() => setError('')}><X /></button></div> : null}
        {notice ? <div className={styles.success} role="status"><CheckCircle2 /><p>{notice}</p><button type="button" aria-label="Hinweis schliessen" onClick={() => setNotice('')}><X /></button></div> : null}
        <section className={styles.materialHeader} aria-label="Materialeinstellungen"><div className={styles.titleField}><label htmlFor="demo-title">MATERIALTITEL</label><input id="demo-title" value={draft.title} maxLength={200} onChange={(event) => updateDraft({ title: event.target.value, content: { ...draft.content, title: event.target.value } })} placeholder="Gib deinem Material einen Titel" /></div><div className={styles.materialMeta}><label>Fach<input aria-label="Fach" value={draft.subject} maxLength={100} onChange={(event) => updateDraft({ subject: event.target.value })} /></label><label>Klasse<input aria-label="Klassenstufe" value={draft.grade} maxLength={20} onChange={(event) => updateDraft({ grade: event.target.value })} /></label><label>Design<select aria-label="Design" value={draft.theme} onChange={(event) => updateDraft({ theme: event.target.value })}>{themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}</select></label></div><div className={styles.materialActions}><button type="button" className={styles.primaryButton} onClick={save}><Save /> Lokal speichern</button><button type="button" className={styles.outlineButton} onClick={duplicate} disabled={library.materials.length >= 20}><Copy /> Duplizieren</button><button type="button" className={styles.iconButton} onClick={() => setPendingAction({ kind: 'delete-material' })} aria-label="Material von diesem Gerät entfernen"><Trash2 /></button></div></section>
        <div className={styles.modeToolbar}><div className={styles.modeSwitch} aria-label="Bearbeitung oder Vorschau"><button type="button" onClick={() => setMode('edit')} aria-pressed={mode === 'edit'} className={mode === 'edit' ? styles.activeMode : ''}><PencilLine /> Bearbeiten</button><button type="button" onClick={() => setMode('preview')} aria-pressed={mode === 'preview'} className={mode === 'preview' ? styles.activeMode : ''}><Layers /> Vorschau</button></div><div className={styles.exportControls}><label className={styles.solutionsToggle}><input type="checkbox" checked={solutions} onChange={(event) => setSolutions(event.target.checked)} /> Mit Lösungen</label><button type="button" onClick={() => exportMaterial('PDF')} className={styles.exportButton} disabled={Boolean(exporting)}>{exporting === 'PDF' ? <LoaderCircle className={styles.spinner} /> : <Download />} PDF</button><button type="button" onClick={() => exportMaterial('Word')} className={styles.exportButton} disabled={Boolean(exporting)}>{exporting === 'Word' ? <LoaderCircle className={styles.spinner} /> : <FileText />} Word</button></div></div>
        {mode === 'edit' ? <div className={styles.editLayout}><aside className={styles.questionRail} aria-label="Aufgaben auswählen"><div className={styles.questionRailTitle}><h2>Aufgaben</h2><span>{questions.length}</span></div><div className={styles.questionList}>{questions.map((question, index) => <button type="button" key={question.id || index} onClick={() => setSelectedQuestionId(question.id)} aria-pressed={index === selectedIndex} className={index === selectedIndex ? styles.selectedQuestion : ''}><span>{String(index + 1).padStart(2, '0')}</span><span><strong>{question.question || 'Neue Aufgabe'}</strong><small>{typeLabel(question.type)}</small></span></button>)}</div><div className={styles.addQuestion}><label htmlFor="demo-new-question">Neue Aufgabe</label><select id="demo-new-question" value={questionType} onChange={(event) => setQuestionType(event.target.value)}>{questionTypes.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select><button type="button" onClick={() => { if (questions.length >= 60) return; const question = createDemoQuestion(questionType); updateQuestions([...questions, question]); setSelectedQuestionId(question.id) }} disabled={questions.length >= 60}><Plus /> Hinzufügen</button><small>Bis zu 60 Aufgaben in dieser Demo.</small></div></aside><div className={styles.editorArea}>{selectedQuestion ? <QuestionEditor key={selectedQuestion.id || selectedIndex} question={selectedQuestion} index={selectedIndex} total={questions.length} onChange={(patch) => updateQuestions(questions.map((question, index) => index === selectedIndex ? { ...question, ...patch } : question))} onTypeChange={(type) => { const replacement = createDemoQuestion(type); updateQuestions(questions.map((question, index) => index === selectedIndex ? { ...replacement, id: question.id || replacement.id, question: question.question } : question)) }} onMove={(direction) => { const nextQuestions = [...questions]; const target = selectedIndex + direction; [nextQuestions[selectedIndex], nextQuestions[target]] = [nextQuestions[target], nextQuestions[selectedIndex]]; updateQuestions(nextQuestions) }} onDelete={() => { const remaining = questions.filter((_, index) => index !== selectedIndex); updateQuestions(remaining); setSelectedQuestionId(remaining[Math.max(0, selectedIndex - 1)]?.id || '') }} /> : <div className={styles.emptyEditor}><FileText /><h2>Platz für deine nächste Frage.</h2><p>Wähle einen Aufgabentyp und füge deine erste Aufgabe hinzu.</p></div>}<details className={styles.teacherNotes}><summary><BookOpen /> Hinweise für Lehrpersonen <ChevronDown /></summary><div className={styles.field}><label htmlFor="demo-teacher-notes">Diese Notizen erscheinen nur in der Lösungsfassung.</label><textarea id="demo-teacher-notes" value={draft.content.teacher_notes} maxLength={6000} rows={4} onChange={(event) => updateDraft({ content: { ...draft.content, teacher_notes: event.target.value } })} /></div></details><div className={styles.editorFooter}><span>{dirty ? 'Du hast ungespeicherte Änderungen.' : 'Ändere eine Frage und probiere die Vorschau aus.'}</span><button type="button" onClick={() => setMode('preview')}>Zur Vorschau <ArrowRight /></button></div></div></div> : <div className={styles.previewStage}><div className={styles.previewHint}><span>{solutions ? <ShieldCheck /> : <BookOpen />}{solutions ? 'Lösungsfassung' : 'Schülerfassung'}</span><p>Vorschau · Antworten werden hier nicht abgegeben.</p></div><article className={styles.paper} aria-label={solutions ? 'Lösungsvorschau' : 'Schülervorschau'}><div className={styles.paperTopline}><span>EDUFLOW · BEISPIELMATERIAL</span><span>{draft.subject} · {draft.grade}. Klasse</span></div><h2>{draft.title || 'Material ohne Titel'}</h2><p className={styles.paperSubtitle}>{solutions ? 'Lösungshinweise für Lehrpersonen' : 'Entdecken. Verstehen. Weiterdenken.'}</p>{!solutions ? <div className={styles.studentLine}>Name: <span /> Datum: <span /></div> : null}{questions.map((question, index) => <QuestionPreview key={question.id || index} source={question} index={index} solutions={solutions} />)}{solutions && draft.content.teacher_notes ? <section className={styles.teacherNotesPreview}><h3>Hinweise für Lehrpersonen</h3><p>{draft.content.teacher_notes}</p></section> : null}<footer className={styles.paperFooter}><span>Öffentliche EduFlow-Demo · synthetisches Beispiel</span><span>{questions.length} Aufgaben</span></footer></article></div>}
        <div className={styles.workspaceBottom}><span><HardDrive /> Deine Materialien bleiben in diesem Browser.</span><button type="button" onClick={backup}><Download /> Sicherung herunterladen</button></div>
      </div>
    </div>
    <AlertDialog open={Boolean(pendingAction)} onOpenChange={(open) => { if (!open) setPendingAction(null) }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>{pendingAction?.kind === 'leave' ? 'Arbeitsraum verlassen?' : pendingAction?.kind === 'reset' ? 'Lokale Demo zurücksetzen?' : pendingAction?.kind === 'import' ? 'Sicherung importieren?' : pendingAction?.kind === 'delete-material' ? 'Material entfernen?' : 'Ungespeicherte Änderungen verwerfen?'}</AlertDialogTitle><AlertDialogDescription>{pendingAction?.kind === 'leave' ? 'Dein Entwurf ist noch nicht lokal gespeichert. Wenn du zur Startseite wechselst, gehen diese Änderungen verloren. Brich ab und speichere zuerst, wenn du sie behalten möchtest.' : pendingAction?.kind === 'reset' ? 'Deine lokal gespeicherte Demo-Bibliothek wird durch das ursprüngliche Beispiel ersetzt. Lade vorher eine JSON-Sicherung herunter, wenn du deine Materialien behalten möchtest.' : pendingAction?.kind === 'import' ? 'Die importierte Sicherung ersetzt deine bisherige Demo-Bibliothek auf diesem Gerät. Noch nicht gesicherte Änderungen gehen dabei verloren.' : pendingAction?.kind === 'delete-material' ? 'Dieses Material wird aus deiner lokalen Demo-Bibliothek entfernt. Deine anderen Materialien bleiben erhalten. Wenn es das letzte Material ist, erscheint ein frisches Beispiel.' : 'Dein aktueller Entwurf ist noch nicht lokal gespeichert. Brich ab und speichere ihn, wenn du deine Änderungen behalten möchtest.'}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel className={styles.dialogButton}>Abbrechen</AlertDialogCancel><AlertDialogAction onClick={confirmAction} className={styles.dialogConfirm}>{pendingAction?.kind === 'leave' ? 'Verwerfen und zur Startseite' : hasPendingReplacement ? pendingAction?.kind === 'import' ? 'Importieren und ersetzen' : pendingAction?.kind === 'reset' ? 'Demo zurücksetzen' : 'Material entfernen' : 'Änderungen verwerfen'}</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
  </main>
}
