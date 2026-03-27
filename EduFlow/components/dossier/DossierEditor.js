'use client'

import { useState, useCallback } from 'react'
import { motion, AnimatePresence, Reorder } from 'framer-motion'
import { Button } from '@/ui/button'
import { Input } from '@/ui/input'
import { Card, CardContent } from '@/ui/card'
import { Badge } from '@/ui/badge'
import { Separator } from '@/ui/separator'
import { Textarea } from '@/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/ui/select'
import {
  BookOpen, Save, ArrowLeft, Eye, Edit, Plus, Trash2, GripVertical,
  FileText, Target, Lightbulb, Brain, Palette, BookMarked,
  Download, Loader2, ChevronRight, MoreHorizontal, Copy,
  Info, AlertTriangle, CheckCircle2, Sparkles, ListOrdered
} from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel
} from '@/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/ui/tooltip'
import { ScrollArea } from '@/ui/scroll-area'
import { getThemeById } from '@/data/worksheetThemes'

// Section type definitions
const SECTION_TYPES = [
  { id: 'objectives', label: 'Lernziele', icon: Target, color: 'emerald' },
  { id: 'theory', label: 'Theorie', icon: BookOpen, color: 'blue' },
  { id: 'exercises', label: 'Uebungen', icon: FileText, color: 'orange' },
  { id: 'source_text', label: 'Quellentext', icon: BookMarked, color: 'purple' },
  { id: 'creative', label: 'Kreativaufgabe', icon: Palette, color: 'pink' },
  { id: 'summary', label: 'Zusammenfassung', icon: ListOrdered, color: 'teal' },
  { id: 'glossary', label: 'Glossar', icon: Brain, color: 'amber' },
  { id: 'solutions', label: 'Loesungen', icon: CheckCircle2, color: 'green' },
]

// Info box variants
const INFO_BOX_VARIANTS = [
  { id: 'wusstest_du', label: 'Wusstest du?', color: 'blue', icon: '💡' },
  { id: 'wichtig', label: 'Wichtig!', color: 'red', icon: '⚠️' },
  { id: 'merke', label: 'Merke dir', color: 'green', icon: '📌' },
  { id: 'tipp', label: 'Tipp', color: 'yellow', icon: '💡' },
]

function getSectionIcon(type) {
  const found = SECTION_TYPES.find(s => s.id === type)
  return found ? found.icon : FileText
}

function getSectionColor(type) {
  const colorMap = {
    objectives: 'text-emerald-600 bg-emerald-50',
    theory: 'text-blue-600 bg-blue-50',
    exercises: 'text-orange-600 bg-orange-50',
    source_text: 'text-purple-600 bg-purple-50',
    creative: 'text-pink-600 bg-pink-50',
    summary: 'text-teal-600 bg-teal-50',
    glossary: 'text-amber-600 bg-amber-50',
    solutions: 'text-green-600 bg-green-50',
  }
  return colorMap[type] || 'text-gray-600 bg-gray-50'
}

// ==================== BLOCK RENDERERS ====================

function HeadingBlock({ block, editing, onUpdate }) {
  const content = block.content || {}
  const level = content.level || 2
  const text = content.text || ''
  const sizeClass = level === 1 ? 'text-xl font-bold' : level === 2 ? 'text-lg font-semibold' : 'text-base font-medium'

  if (editing) {
    return (
      <div className="flex items-center gap-2">
        <Select value={String(level)} onValueChange={v => onUpdate({ ...content, level: parseInt(v) })}>
          <SelectTrigger className="w-16 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="1">H1</SelectItem>
            <SelectItem value="2">H2</SelectItem>
            <SelectItem value="3">H3</SelectItem>
          </SelectContent>
        </Select>
        <Input
          value={text}
          onChange={e => onUpdate({ ...content, text: e.target.value })}
          className={`flex-1 ${sizeClass} border-0 border-b-2 border-dashed bg-transparent px-0`}
          placeholder="Ueberschrift..."
        />
      </div>
    )
  }

  return <div className={`${sizeClass} text-gray-900`}>{text || 'Ueberschrift'}</div>
}

function TextBlock({ block, editing, onUpdate }) {
  const content = block.content || {}
  const html = content.html || ''

  if (editing) {
    return (
      <Textarea
        value={html.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')}
        onChange={e => {
          const formatted = e.target.value
            .split('\n')
            .map(line => line.trim() ? `<p>${line}</p>` : '<br/>')
            .join('')
          onUpdate({ html: formatted || e.target.value })
        }}
        placeholder="Text eingeben..."
        className="min-h-[80px] text-sm"
      />
    )
  }

  // Simple HTML rendering for preview
  const plainText = html.replace(/<br\s*\/?>/g, '\n').replace(/<[^>]+>/g, '')
  return <div className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">{plainText || 'Textblock'}</div>
}

function InfoBoxBlock({ block, editing, onUpdate }) {
  const content = block.content || {}
  const variant = content.variant || 'tipp'
  const title = content.title || ''
  const boxContent = content.content || ''

  const colorMap = {
    wusstest_du: 'bg-blue-50 border-blue-300 text-blue-800',
    wichtig: 'bg-red-50 border-red-300 text-red-800',
    merke: 'bg-green-50 border-green-300 text-green-800',
    tipp: 'bg-yellow-50 border-yellow-300 text-yellow-800',
  }

  const iconMap = { wusstest_du: '💡', wichtig: '⚠️', merke: '📌', tipp: '💡' }

  if (editing) {
    return (
      <div className={`border-l-4 rounded-lg p-4 space-y-2 ${colorMap[variant]}`}>
        <div className="flex items-center gap-2">
          <Select value={variant} onValueChange={v => onUpdate({ ...content, variant: v })}>
            <SelectTrigger className="w-40 h-8 text-xs bg-white/50">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INFO_BOX_VARIANTS.map(v => (
                <SelectItem key={v.id} value={v.id}>{v.icon} {v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={title}
            onChange={e => onUpdate({ ...content, title: e.target.value })}
            placeholder="Titel..."
            className="flex-1 h-8 text-xs bg-white/50"
          />
        </div>
        <Textarea
          value={boxContent}
          onChange={e => onUpdate({ ...content, content: e.target.value })}
          placeholder="Inhalt der Infobox..."
          className="min-h-[60px] text-sm bg-white/50"
        />
      </div>
    )
  }

  return (
    <div className={`border-l-4 rounded-lg p-4 ${colorMap[variant]}`}>
      <div className="flex items-center gap-2 font-semibold text-sm mb-1">
        <span>{iconMap[variant]}</span>
        <span>{title || INFO_BOX_VARIANTS.find(v => v.id === variant)?.label || 'Info'}</span>
      </div>
      <div className="text-sm">{boxContent}</div>
    </div>
  )
}

function QuestionBlock({ block, editing, onUpdate }) {
  const content = block.content || {}
  const qType = content.type || 'open'
  const question = content.question || ''
  const options = content.options || []
  const answer = content.answer || ''
  const answerLines = content.answerLines || 3

  if (editing) {
    return (
      <div className="space-y-2 border-l-4 border-blue-400 pl-4">
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-xs">{content.number || '?'}</Badge>
          <Select value={qType} onValueChange={v => onUpdate({ ...content, type: v })}>
            <SelectTrigger className="w-36 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="multiple_choice">Multiple Choice</SelectItem>
              <SelectItem value="open">Offene Frage</SelectItem>
              <SelectItem value="fill_blank">Lueckentext</SelectItem>
              <SelectItem value="matching">Zuordnung</SelectItem>
              <SelectItem value="ordering">Reihenfolge</SelectItem>
              <SelectItem value="true_false">Wahr/Falsch</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Textarea
          value={question}
          onChange={e => onUpdate({ ...content, question: e.target.value })}
          placeholder="Fragetext..."
          className="min-h-[60px] text-sm"
        />
        {qType === 'multiple_choice' && (
          <Textarea
            value={options.join('\n')}
            onChange={e => onUpdate({ ...content, options: e.target.value.split('\n').filter(o => o.trim()) })}
            placeholder="Option A&#10;Option B&#10;Option C&#10;Option D"
            className="min-h-[60px] text-sm"
          />
        )}
        <div className="flex gap-2">
          <Input
            value={answer}
            onChange={e => onUpdate({ ...content, answer: e.target.value })}
            placeholder="Loesung"
            className="flex-1 h-7 text-xs"
          />
          <Input
            type="number"
            min="0"
            max="10"
            value={answerLines}
            onChange={e => onUpdate({ ...content, answerLines: parseInt(e.target.value) || 3 })}
            className="w-16 h-7 text-xs"
            placeholder="Zeilen"
          />
        </div>
      </div>
    )
  }

  return (
    <div className="border-l-4 border-blue-400 pl-4">
      <div className="flex items-center gap-2 mb-1">
        <Badge variant="outline" className="text-xs">{content.number || '?'}</Badge>
        <Badge className="text-xs bg-blue-50 text-blue-700 border-0">{qType}</Badge>
      </div>
      <div className="text-sm font-medium text-gray-800">{question || 'Frage...'}</div>
      {qType === 'multiple_choice' && options.length > 0 && (
        <div className="ml-4 mt-1 space-y-1">
          {options.map((opt, i) => (
            <div key={i} className="text-sm text-gray-600 flex items-center gap-2">
              <span className="w-5 h-5 rounded-full border-2 border-gray-300 flex items-center justify-center text-xs">
                {String.fromCharCode(65 + i)}
              </span>
              {opt}
            </div>
          ))}
        </div>
      )}
      {qType !== 'multiple_choice' && (
        <div className="mt-2 space-y-1">
          {Array.from({ length: answerLines }).map((_, i) => (
            <div key={i} className="border-b border-gray-300 h-6" />
          ))}
        </div>
      )}
    </div>
  )
}

function TableBlock({ block, editing, onUpdate }) {
  const content = block.content || {}
  const headers = content.headers || []
  const rows = content.rows || []

  if (editing) {
    return (
      <div className="space-y-2">
        <div className="text-xs text-gray-500">Kopfzeile (kommagetrennt):</div>
        <Input
          value={headers.join(', ')}
          onChange={e => onUpdate({ ...content, headers: e.target.value.split(',').map(h => h.trim()) })}
          className="h-7 text-xs"
          placeholder="Spalte 1, Spalte 2, Spalte 3"
        />
        <div className="text-xs text-gray-500">Zeilen (eine pro Zeile, Spalten kommagetrennt):</div>
        <Textarea
          value={rows.map(r => r.join(', ')).join('\n')}
          onChange={e => onUpdate({
            ...content,
            rows: e.target.value.split('\n').filter(l => l.trim()).map(l => l.split(',').map(c => c.trim()))
          })}
          className="min-h-[60px] text-xs font-mono"
          placeholder="Wert 1, Wert 2, Wert 3&#10;Wert 4, Wert 5, Wert 6"
        />
      </div>
    )
  }

  if (!headers.length && !rows.length) return <div className="text-sm text-gray-400 italic">Leere Tabelle</div>

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        {headers.length > 0 && (
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={i} className="border border-gray-200 bg-gray-50 px-3 py-1.5 text-left font-semibold text-gray-700">{h}</th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} className="border border-gray-200 px-3 py-1.5 text-gray-600">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function ObjectivesBlock({ block, editing, onUpdate }) {
  const content = block.content || {}
  const objectives = content.objectives || []

  if (editing) {
    return (
      <div className="space-y-2">
        <Textarea
          value={objectives.map(o => `${o.code ? o.code + ': ' : ''}${o.text}`).join('\n')}
          onChange={e => {
            const newObjectives = e.target.value.split('\n').filter(l => l.trim()).map(line => {
              const colonIdx = line.indexOf(':')
              if (colonIdx > 0 && colonIdx < 15) {
                return { code: line.substring(0, colonIdx).trim(), text: line.substring(colonIdx + 1).trim(), checked: false }
              }
              return { code: '', text: line.trim(), checked: false }
            })
            onUpdate({ objectives: newObjectives })
          }}
          className="min-h-[80px] text-sm"
          placeholder="D.2.B.1: Texte verstehen und darueber nachdenken&#10;Schueler koennen Ergebnisse praesentieren"
        />
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {objectives.map((obj, i) => (
        <div key={i} className="flex items-start gap-2 text-sm">
          <div className="w-5 h-5 border-2 border-gray-300 rounded mt-0.5 flex-shrink-0" />
          <div>
            {obj.code && <span className="font-mono text-xs text-blue-600 mr-2">{obj.code}</span>}
            <span className="text-gray-700">{obj.text}</span>
          </div>
        </div>
      ))}
      {objectives.length === 0 && <div className="text-sm text-gray-400 italic">Keine Lernziele</div>}
    </div>
  )
}

function GlossaryBlock({ block, editing, onUpdate }) {
  const content = block.content || {}
  const terms = content.terms || []

  if (editing) {
    return (
      <Textarea
        value={terms.map(t => `${t.term}: ${t.definition}`).join('\n')}
        onChange={e => {
          const newTerms = e.target.value.split('\n').filter(l => l.trim()).map(line => {
            const colonIdx = line.indexOf(':')
            if (colonIdx > 0) {
              return { term: line.substring(0, colonIdx).trim(), definition: line.substring(colonIdx + 1).trim() }
            }
            return { term: line.trim(), definition: '' }
          })
          onUpdate({ terms: newTerms })
        }}
        className="min-h-[80px] text-sm"
        placeholder="Begriff: Definition&#10;Wort: Erklaerung"
      />
    )
  }

  return (
    <div className="space-y-3">
      {terms.map((t, i) => (
        <div key={i}>
          <div className="text-sm font-semibold text-gray-800">{t.term}</div>
          <div className="text-sm text-gray-600 ml-4">{t.definition}</div>
        </div>
      ))}
      {terms.length === 0 && <div className="text-sm text-gray-400 italic">Leeres Glossar</div>}
    </div>
  )
}

function ReflectionBlock({ block, editing, onUpdate }) {
  const content = block.content || {}
  const prompts = content.prompts || []

  if (editing) {
    return (
      <Textarea
        value={prompts.join('\n')}
        onChange={e => onUpdate({ prompts: e.target.value.split('\n').filter(l => l.trim()) })}
        className="min-h-[60px] text-sm"
        placeholder="Was habe ich gelernt?&#10;Was fiel mir schwer?&#10;Was moechte ich noch wissen?"
      />
    )
  }

  return (
    <div className="space-y-3">
      {prompts.map((p, i) => (
        <div key={i}>
          <div className="text-sm font-medium text-gray-700">• {p}</div>
          <div className="ml-4 mt-1 space-y-1">
            {[0, 1].map(j => <div key={j} className="border-b border-gray-300 h-6" />)}
          </div>
        </div>
      ))}
    </div>
  )
}

function CreativeTaskBlock({ block, editing, onUpdate }) {
  const content = block.content || {}

  if (editing) {
    return (
      <div className="space-y-2">
        <Textarea
          value={content.instruction || ''}
          onChange={e => onUpdate({ ...content, instruction: e.target.value })}
          className="min-h-[60px] text-sm"
          placeholder="Aufgabenbeschreibung..."
        />
        <div className="flex gap-2">
          <Select value={content.type || 'writing'} onValueChange={v => onUpdate({ ...content, type: v })}>
            <SelectTrigger className="w-32 h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="writing">Schreiben</SelectItem>
              <SelectItem value="drawing">Zeichnen</SelectItem>
              <SelectItem value="project">Projekt</SelectItem>
            </SelectContent>
          </Select>
          <Input
            type="number"
            min="2"
            max="20"
            value={content.space_lines || 8}
            onChange={e => onUpdate({ ...content, space_lines: parseInt(e.target.value) || 8 })}
            className="w-20 h-7 text-xs"
            placeholder="Zeilen"
          />
        </div>
      </div>
    )
  }

  return (
    <div>
      <div className="text-sm text-gray-700 mb-2">{content.instruction || 'Kreativaufgabe'}</div>
      <div className="space-y-1">
        {Array.from({ length: content.space_lines || 8 }).map((_, i) => (
          <div key={i} className="border-b border-gray-300 h-6" />
        ))}
      </div>
    </div>
  )
}

// ==================== BLOCK EDITOR WRAPPER ====================

function BlockEditor({ block, editing, onUpdate, onDelete, onMoveUp, onMoveDown, isFirst, isLast }) {
  const [isEditing, setIsEditing] = useState(false)
  const blockType = block.type

  const renderBlock = () => {
    const props = {
      block,
      editing: editing && isEditing,
      onUpdate: (newContent) => onUpdate(block.id, newContent)
    }

    switch (blockType) {
      case 'heading': return <HeadingBlock {...props} />
      case 'text': return <TextBlock {...props} />
      case 'info_box': return <InfoBoxBlock {...props} />
      case 'question': return <QuestionBlock {...props} />
      case 'table': return <TableBlock {...props} />
      case 'objectives_checklist': return <ObjectivesBlock {...props} />
      case 'glossary': return <GlossaryBlock {...props} />
      case 'reflection': return <ReflectionBlock {...props} />
      case 'creative_task': return <CreativeTaskBlock {...props} />
      case 'page_break': return <div className="border-t-2 border-dashed border-gray-300 my-2 text-xs text-gray-400 text-center py-1">Seitenumbruch</div>
      case 'divider': return <Separator className="my-2" />
      default: return <div className="text-sm text-gray-400">Unbekannter Block: {blockType}</div>
    }
  }

  const blockTypeLabel = {
    heading: 'Ueberschrift', text: 'Text', info_box: 'Infobox', question: 'Frage',
    table: 'Tabelle', objectives_checklist: 'Lernziele', glossary: 'Glossar',
    reflection: 'Reflexion', creative_task: 'Kreativaufgabe', page_break: 'Seitenumbruch', divider: 'Trenner'
  }

  return (
    <div
      className={`group relative rounded-lg transition-all ${
        editing ? 'hover:bg-gray-50/50 border border-transparent hover:border-gray-200' : ''
      } ${isEditing && editing ? 'bg-white border border-blue-200 shadow-sm' : ''} p-3`}
      onClick={() => editing && !isEditing && setIsEditing(true)}
    >
      {editing && (
        <div className="absolute -top-2 -right-2 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">{blockTypeLabel[blockType] || blockType}</Badge>
          {isEditing && (
            <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); setIsEditing(false) }}>
              <CheckCircle2 className="h-3 w-3 text-green-500" />
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={(e) => { e.stopPropagation(); onDelete(block.id) }}>
            <Trash2 className="h-3 w-3 text-red-400" />
          </Button>
        </div>
      )}
      {renderBlock()}
    </div>
  )
}

// ==================== ADD BLOCK MENU ====================

const BLOCK_TYPES_MENU = [
  { type: 'heading', label: 'Ueberschrift', icon: '📝' },
  { type: 'text', label: 'Text', icon: '📄' },
  { type: 'info_box', label: 'Infobox', icon: '💡' },
  { type: 'question', label: 'Frage', icon: '❓' },
  { type: 'table', label: 'Tabelle', icon: '📊' },
  { type: 'objectives_checklist', label: 'Lernziele', icon: '🎯' },
  { type: 'glossary', label: 'Glossar', icon: '📖' },
  { type: 'reflection', label: 'Reflexion', icon: '🤔' },
  { type: 'creative_task', label: 'Kreativaufgabe', icon: '🎨' },
  { type: 'divider', label: 'Trenner', icon: '➖' },
  { type: 'page_break', label: 'Seitenumbruch', icon: '📃' },
]

function AddBlockButton({ onAdd }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="w-full border-dashed text-gray-400 hover:text-gray-600">
          <Plus className="h-4 w-4 mr-2" />
          Block hinzufuegen
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-48">
        <DropdownMenuLabel>Block-Typ</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {BLOCK_TYPES_MENU.map(bt => (
          <DropdownMenuItem key={bt.type} onClick={() => onAdd(bt.type)}>
            <span className="mr-2">{bt.icon}</span> {bt.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ==================== MAIN DOSSIER EDITOR ====================

export default function DossierEditor({
  dossier,
  onSave,
  onBack,
  onExportPDF,
  saving = false,
  apiBase = ''
}) {
  const [editedDossier, setEditedDossier] = useState(dossier)
  const [activeSection, setActiveSection] = useState(0)
  const [editMode, setEditMode] = useState(true)
  const [exporting, setExporting] = useState(false)

  const theme = getThemeById(editedDossier?.theme || 'classic')
  const sections = editedDossier?.sections || []
  const currentSection = sections[activeSection] || null

  // Update a block's content
  const updateBlockContent = useCallback((blockId, newContent) => {
    setEditedDossier(prev => {
      const newSections = [...prev.sections]
      const sec = { ...newSections[activeSection] }
      sec.blocks = sec.blocks.map(b =>
        b.id === blockId ? { ...b, content: newContent } : b
      )
      newSections[activeSection] = sec
      return { ...prev, sections: newSections }
    })
  }, [activeSection])

  // Delete a block
  const deleteBlock = useCallback((blockId) => {
    setEditedDossier(prev => {
      const newSections = [...prev.sections]
      const sec = { ...newSections[activeSection] }
      sec.blocks = sec.blocks.filter(b => b.id !== blockId)
      newSections[activeSection] = sec
      return { ...prev, sections: newSections }
    })
  }, [activeSection])

  // Add a block
  const addBlock = useCallback((blockType) => {
    const newBlock = {
      id: `b_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type: blockType,
      content: getDefaultContent(blockType),
      order: currentSection?.blocks?.length || 0
    }
    setEditedDossier(prev => {
      const newSections = [...prev.sections]
      const sec = { ...newSections[activeSection] }
      sec.blocks = [...(sec.blocks || []), newBlock]
      newSections[activeSection] = sec
      return { ...prev, sections: newSections }
    })
  }, [activeSection, currentSection])

  // Add a new section
  const addSection = useCallback(() => {
    const newSection = {
      id: `sec_new_${Date.now()}`,
      type: 'theory',
      title: 'Neue Sektion',
      order: sections.length,
      blocks: []
    }
    setEditedDossier(prev => ({
      ...prev,
      sections: [...prev.sections, newSection]
    }))
    setActiveSection(sections.length)
  }, [sections.length])

  // Delete a section
  const deleteSection = useCallback((sectionIdx) => {
    setEditedDossier(prev => ({
      ...prev,
      sections: prev.sections.filter((_, i) => i !== sectionIdx)
    }))
    if (activeSection >= sectionIdx && activeSection > 0) {
      setActiveSection(activeSection - 1)
    }
  }, [activeSection])

  // Update section metadata
  const updateSection = useCallback((sectionIdx, updates) => {
    setEditedDossier(prev => {
      const newSections = [...prev.sections]
      newSections[sectionIdx] = { ...newSections[sectionIdx], ...updates }
      return { ...prev, sections: newSections }
    })
  }, [])

  // Reorder sections
  const reorderSections = useCallback((newOrder) => {
    setEditedDossier(prev => ({ ...prev, sections: newOrder }))
  }, [])

  // Handle save
  const handleSave = async () => {
    if (onSave) {
      await onSave(editedDossier)
    }
  }

  // Handle PDF export
  const handleExport = async (version) => {
    if (!onExportPDF) return
    setExporting(true)
    try {
      await onExportPDF(editedDossier, version)
    } finally {
      setExporting(false)
    }
  }

  if (!editedDossier) return null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
      {/* Left Sidebar: Section List */}
      <div className="lg:col-span-3 space-y-4">
        <Card>
          <CardContent className="py-3 px-3">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Sektionen</h3>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={addSection}>
                <Plus className="h-3 w-3 mr-1" /> Neu
              </Button>
            </div>
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-1">
                {sections.map((section, idx) => {
                  const Icon = getSectionIcon(section.type)
                  const isActive = idx === activeSection
                  return (
                    <div
                      key={section.id}
                      className={`flex items-center gap-2 px-2 py-2 rounded-lg cursor-pointer transition-all text-sm ${
                        isActive
                          ? 'bg-blue-50 text-blue-700 font-medium'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                      onClick={() => setActiveSection(idx)}
                    >
                      <div className={`w-6 h-6 rounded flex items-center justify-center flex-shrink-0 ${getSectionColor(section.type)}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <span className="truncate flex-1">{section.title}</span>
                      {editMode && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                            <Button size="sm" variant="ghost" className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100">
                              <MoreHorizontal className="h-3 w-3" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent>
                            <DropdownMenuItem onClick={() => deleteSection(idx)} className="text-red-600">
                              <Trash2 className="h-3 w-3 mr-2" /> Loeschen
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Export */}
        <Card>
          <CardContent className="py-3 px-3 space-y-2">
            <h3 className="text-sm font-semibold text-gray-700">Export</h3>
            <Button
              size="sm"
              className="w-full bg-blue-600 hover:bg-blue-700 text-xs"
              onClick={() => handleExport('student')}
              disabled={exporting}
            >
              {exporting ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Download className="h-3 w-3 mr-1" />}
              PDF (Schueler)
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="w-full text-xs"
              onClick={() => handleExport('teacher')}
              disabled={exporting}
            >
              <Download className="h-3 w-3 mr-1" />
              PDF (Lehrer mit Loesungen)
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Main Content Area */}
      <div className="lg:col-span-9 space-y-4">
        {/* Toolbar */}
        <Card className="sticky top-20 z-20 bg-white">
          <CardContent className="py-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={onBack}>
                  <ArrowLeft className="h-4 w-4 mr-1" /> Zurueck
                </Button>
                <Separator orientation="vertical" className="h-6" />
                <Badge variant="outline" className="text-xs">
                  {sections.length} Sektionen
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  Dossier
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={editMode ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setEditMode(!editMode)}
                >
                  {editMode ? <Eye className="h-4 w-4 mr-1" /> : <Edit className="h-4 w-4 mr-1" />}
                  {editMode ? 'Vorschau' : 'Bearbeiten'}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                  Speichern
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Document */}
        <Card className="bg-white shadow-lg">
          <CardContent className="p-8">
            {/* Dossier Title */}
            <div className="mb-6">
              {editMode ? (
                <Input
                  value={editedDossier.title}
                  onChange={e => setEditedDossier({ ...editedDossier, title: e.target.value })}
                  className="text-2xl font-bold border-0 border-b-2 border-dashed focus:border-blue-500 bg-transparent px-0 h-auto py-2"
                />
              ) : (
                <h1 className="text-2xl font-bold text-gray-900">{editedDossier.title}</h1>
              )}
              <div className="flex flex-wrap gap-2 mt-3">
                <Badge variant="outline">{editedDossier.grade}. Klasse</Badge>
                <Badge variant="outline">{editedDossier.subject}</Badge>
                <Badge variant="outline">
                  {editedDossier.difficulty === 'easy' ? 'Einfach' : editedDossier.difficulty === 'medium' ? 'Mittel' : 'Schwierig'}
                </Badge>
                <Badge className="bg-amber-50 text-amber-700 border-amber-200">Dossier</Badge>
              </div>
            </div>

            <Separator className="mb-6" />

            {/* Current Section */}
            {currentSection && (
              <div>
                {/* Section Header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${getSectionColor(currentSection.type)}`}>
                    {(() => { const Icon = getSectionIcon(currentSection.type); return <Icon className="h-4 w-4" /> })()}
                  </div>
                  {editMode ? (
                    <div className="flex items-center gap-2 flex-1">
                      <Input
                        value={currentSection.title}
                        onChange={e => updateSection(activeSection, { title: e.target.value })}
                        className="text-lg font-semibold border-0 border-b border-dashed bg-transparent px-0 h-auto py-1 flex-1"
                      />
                      <Select
                        value={currentSection.type}
                        onValueChange={v => updateSection(activeSection, { type: v })}
                      >
                        <SelectTrigger className="w-36 h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {SECTION_TYPES.map(st => (
                            <SelectItem key={st.id} value={st.id}>{st.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  ) : (
                    <h2 className="text-lg font-semibold text-gray-900">{currentSection.title}</h2>
                  )}
                </div>

                {/* Blocks */}
                <div className="space-y-3">
                  {(currentSection.blocks || []).map((block, blockIdx) => (
                    <BlockEditor
                      key={block.id}
                      block={block}
                      editing={editMode}
                      onUpdate={updateBlockContent}
                      onDelete={deleteBlock}
                      isFirst={blockIdx === 0}
                      isLast={blockIdx === currentSection.blocks.length - 1}
                    />
                  ))}
                </div>

                {/* Add Block */}
                {editMode && (
                  <div className="mt-4">
                    <AddBlockButton onAdd={addBlock} />
                  </div>
                )}
              </div>
            )}

            {!currentSection && (
              <div className="text-center py-12 text-gray-400">
                <BookOpen className="h-12 w-12 mx-auto mb-3 opacity-50" />
                <p>Keine Sektionen vorhanden</p>
                <Button variant="outline" size="sm" className="mt-3" onClick={addSection}>
                  <Plus className="h-4 w-4 mr-1" /> Erste Sektion erstellen
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

// Default content for new blocks
function getDefaultContent(blockType) {
  switch (blockType) {
    case 'heading': return { text: '', level: 2 }
    case 'text': return { html: '' }
    case 'info_box': return { variant: 'tipp', title: '', content: '' }
    case 'question': return { id: `q_${Date.now()}`, number: 1, type: 'open', question: '', answer: '', explanation: '', answerLines: 3 }
    case 'table': return { headers: ['Spalte 1', 'Spalte 2'], rows: [['', '']] }
    case 'objectives_checklist': return { objectives: [] }
    case 'glossary': return { terms: [] }
    case 'reflection': return { prompts: [] }
    case 'creative_task': return { instruction: '', type: 'writing', space_lines: 8 }
    case 'page_break': return {}
    case 'divider': return { style: 'line' }
    default: return {}
  }
}