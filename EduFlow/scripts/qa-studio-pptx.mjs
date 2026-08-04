import { mkdir, writeFile } from 'fs/promises'
import { buildStudioPresentation } from '../lib/server/studio-presentation.js'

const artifact = {
  title: 'Der Wasserkreislauf verstehen',
  subject: 'Natur und Technik',
  grade: '6. Klasse',
  summary: 'Wasser bewegt sich in einem Kreislauf zwischen Erdoberflaeche und Atmosphaere. Sonnenenergie treibt Verdunstung, Kondensation und Niederschlag an; Versickerung und Abfluss schliessen den Kreislauf.',
  learningGoals: [
    'Die Lernenden beschreiben die vier zentralen Phasen des Wasserkreislaufs.',
    'Die Lernenden erklaeren die Rolle der Sonnenenergie.',
    'Die Lernenden wenden das Modell auf ein lokales Wetterbeispiel an.',
  ],
  teachingNotes: 'Start mit einer beschlagenen Flasche. Lernende formulieren Vermutungen, ordnen anschliessend Prozesskarten und erklaeren den Kreislauf in Partnerarbeit.',
  slides: [
    { title: 'Die Sonne setzt Wasser in Bewegung', bullets: ['Sonnenenergie erwaermt Oberflaechenwasser', 'Fluessiges Wasser wird zu Wasserdampf', 'Auch Pflanzen geben Wasser ab'], visualPrompt: 'Klare Illustration von Sonne, See und aufsteigendem Wasserdampf', speakerNotes: 'Die Verdunstung ist der Motor des Kreislaufs.' },
    { title: 'In kalter Luft entstehen Wolken', bullets: ['Wasserdampf steigt auf', 'Die Luft kuehlt ab', 'Kleine Tropfen bilden Wolken'], visualPrompt: 'Wolkenbildung ueber einer Berglandschaft', speakerNotes: 'Kondensation ist der umgekehrte Phasenwechsel.' },
    { title: 'Niederschlag bringt Wasser zurueck', bullets: ['Tropfen wachsen und werden schwer', 'Regen oder Schnee faellt', 'Wasser versickert oder fliesst ab'], visualPrompt: 'Regen ueber Bergen mit Bach und Grundwasser', speakerNotes: 'Die Form haengt von der Temperatur ab.' },
  ],
  quiz: [
    { question: 'Was treibt den Wasserkreislauf hauptsaechlich an?', options: ['Sonnenenergie', 'Mondlicht', 'Wind allein', 'Bodenwaerme allein'], answer: 'Sonnenenergie', explanation: 'Die Sonne liefert die Energie fuer die Verdunstung.' },
    { question: 'Wie heisst der Uebergang von Wasserdampf zu Tropfen?', options: ['Kondensation', 'Verdunstung', 'Versickerung', 'Niederschlag'], answer: 'Kondensation', explanation: 'Beim Abkuehlen kondensiert Wasserdampf.' },
  ],
}

await mkdir('tmp/pptx', { recursive: true })
await writeFile('tmp/pptx/studio-qa.pptx', await buildStudioPresentation(artifact))
