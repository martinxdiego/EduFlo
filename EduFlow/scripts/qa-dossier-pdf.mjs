import { mkdir, writeFile } from 'fs/promises'
import nextEnv from '@next/env'
import jwt from 'jsonwebtoken'

nextEnv.loadEnvConfig(process.cwd())
const token = jwt.sign({ userId: 'qa-export-user', role: 'teacher' }, process.env.JWT_SECRET, { expiresIn: '10m' })
const dossier = {
  title: 'Wasser erforschen', subject: 'Natur und Technik', grade: 6,
  sections: [
    { title: 'Lernziele', type: 'objectives', blocks: [
      { type: 'heading', content: { text: 'Das kann ich nach diesem Dossier', level: 2 } },
      { type: 'objectives_checklist', content: { objectives: [{ code: 'NMG.2.2', text: 'Ich erklaere den Wasserkreislauf.' }, { text: 'Ich werte ein einfaches Experiment aus.' }] } },
    ] },
    { title: 'Grundlagen', type: 'theory', blocks: [
      { type: 'heading', content: { text: 'Wasser veraendert seine Form', level: 2 } },
      { type: 'text', content: { html: 'Wasser kommt fluessig, fest und gasfoermig vor. <b>Sonnenenergie</b> treibt viele Veraenderungen an.' } },
      { type: 'info_box', content: { variant: 'merke', content: 'Beim Verdunsten wird fluessiges Wasser zu Wasserdampf.' } },
      { type: 'table', content: { headers: ['Vorgang', 'Beobachtung'], rows: [['Verdunstung', 'Wasser wird weniger'], ['Kondensation', 'Tropfen entstehen']] } },
    ] },
    { title: 'Ueben', type: 'exercises', blocks: [
      { type: 'question', content: { number: 1, type: 'multiple_choice', question: 'Was treibt die Verdunstung an?', options: ['Sonnenenergie', 'Mondlicht', 'Steine', 'Sand'], answer: 'Sonnenenergie', answerLines: 2 } },
      { type: 'creative_task', content: { instruction: 'Zeichne den Kreislauf und beschrifte die vier wichtigsten Stationen.', space_lines: 6 } },
      { type: 'reflection', content: { questions: ['Was war neu fuer dich?', 'Welche Frage ist noch offen?'] } },
    ] },
    { title: 'Glossar', type: 'glossary', blocks: [
      { type: 'glossary', content: { terms: [{ term: 'Verdunstung', definition: 'Uebergang von fluessigem Wasser zu Wasserdampf.' }, { term: 'Kondensation', definition: 'Uebergang von Wasserdampf zu fluessigem Wasser.' }] } },
    ] },
  ],
}

const response = await fetch(`${process.env.PDF_QA_BASE_URL || 'http://127.0.0.1:3000'}/api/export/dossier/pdf`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify({ dossier, version: 'teacher' }),
})
if (!response.ok) throw new Error(`${response.status}: ${await response.text()}`)
await mkdir('tmp/pdfs', { recursive: true })
await writeFile('tmp/pdfs/dossier-qa.pdf', Buffer.from(await response.arrayBuffer()))
