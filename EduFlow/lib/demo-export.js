// Browser-local demo exports, adapted from AppContent's existing PDF/Word builders.
// No auth, API, export history, remote images or server data are involved.
import { jsPDF } from 'jspdf'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, BorderStyle, UnderlineType } from 'docx'
import { normalizeWorksheet, answerItems } from './worksheet-answers.js'
import { shuffledMatchingRight, shuffledOrderingItems } from './student-material.js'
import { getThemeById } from '../data/worksheetThemes.js'

const DIFFICULTY_LABELS = { easy: 'Einfach', medium: 'Mittel', hard: 'Schwierig' }
const INLINE_IMAGE = /^data:image\/(png|jpe?g|webp);base64,[A-Za-z0-9+/=\r\n]+$/i

function prepareDemoWorksheet(input) {
  const worksheet = normalizeWorksheet(input, { swissSpelling: true })
  if (!worksheet) throw new Error('Bitte zuerst ein Material auswählen.')
  return {
    ...worksheet,
    content: {
      ...worksheet.content,
      questions: worksheet.content.questions.map((question, index) => ({
        ...question,
        number: index + 1,
        // jsPDF can load URL arguments internally. Only pass validated inline bytes.
        imageUrl: typeof question.imageUrl === 'string' && question.imageUrl.length <= 1_500_000
          && INLINE_IMAGE.test(question.imageUrl) ? question.imageUrl : '',
      })),
    },
  }
}

function inlineImageFormat(value) {
  return /^data:image\/jpe?g;/i.test(value) ? 'JPEG' : /^data:image\/webp;/i.test(value) ? 'WEBP' : 'PNG'
}

const sanitizePdfText = (text) => {
  if (text == null) return ''
  return String(text)
    .replace(/–/g, '-')   // en-dash
    .replace(/—/g, '-')   // em-dash
    .replace(/'/g, "'")   // smart quote
    .replace(/'/g, "'")   // smart quote
    .replace(/"/g, '"')   // smart quote
    .replace(/"/g, '"')   // smart quote
    .replace(/…/g, '...')  // ellipsis
    .replace(/→/g, '->')   // arrow (used in matching)
    .replace(/✓/g, 'X')   // checkmark
    .replace(/•/g, '-')    // bullet
    .replace(/\u2610/g, '[ ]') // ballot box
    // Strip all emojis and symbols outside Latin-1 range
    .replace(/[\u{1F600}-\u{1F9FF}]/gu, '')  // emoticons & supplemental symbols
    .replace(/[\u{2600}-\u{27BF}]/gu, '')     // misc symbols & dingbats
    .replace(/[\u{FE00}-\u{FE0F}]/gu, '')     // variation selectors
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '')   // misc symbols & pictographs
    .replace(/[\u{1FA00}-\u{1FA6F}]/gu, '')   // chess symbols & extended
    .replace(/[\u{1FA70}-\u{1FAFF}]/gu, '')   // symbols extended-A
    .replace(/[\u{200D}]/gu, '')               // zero-width joiner
    .replace(/[\u{20E3}]/gu, '')               // combining enclosing keycap
    .replace(/[\u{E0020}-\u{E007F}]/gu, '')   // tags
    .trim()
}

export function buildDemoPDF(worksheet, { solutions = false } = {}) {
  const version = solutions ? 'teacher' : 'student'
  worksheet = prepareDemoWorksheet(worksheet)
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const isExam = worksheet.resourceType === 'exam' || worksheet.content?.resourceType === 'exam'
  const isQuiz = worksheet.resourceType === 'quiz' || worksheet.content?.resourceType === 'quiz'
  const isVocab = worksheet.resourceType === 'vocabulary' || worksheet.content?.resourceType === 'vocabulary'
  const showPoints = isExam
  const pdfTheme = getThemeById(worksheet.theme || 'classic')
  const tc = pdfTheme.colors
  const tp_pdf = pdfTheme.pdf
  let yPosition = 20

  // Helper: parse hex to RGB
  const hexToRgb = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return [r, g, b]
  }
  const setColor = (hex) => { const [r, g, b] = hexToRgb(hex); doc.setTextColor(r, g, b) }
  const setDrawHex = (hex) => { const [r, g, b] = hexToRgb(hex); doc.setDrawColor(r, g, b) }
  const setFillHex = (hex) => { const [r, g, b] = hexToRgb(hex); doc.setFillColor(r, g, b) }

  const checkPage = (needed = 40) => {
    if (yPosition > pageHeight - needed) {
      if (doc.getNumberOfPages() >= 250) throw new Error('Das Material ist für einen PDF-Export zu umfangreich. Bitte teilen Sie es auf oder verwenden Sie den Word-Export.')
      doc.addPage()
      yPosition = 20
      // Re-draw theme accent line at top of new page
      setFillHex(tc.accent)
      doc.rect(0, 0, pageWidth, 2, 'F')
    }
  }

  // Lay out each line explicitly: a single jsPDF text array cannot span pages.
  const writeLines = (lines, x, lineHeight = 5, options = {}) => {
    for (const line of lines) {
      checkPage(lineHeight + 10)
      doc.text(line, x, yPosition, options)
      yPosition += lineHeight
    }
  }

  // Theme accent bar at top
  setFillHex(tc.accent)
  doc.rect(0, 0, pageWidth, 2.5, 'F')
  yPosition = 14

  // ---- EXAM HEADER ----
  if (isExam) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text('Schule: ___________________________________________', 20, yPosition)
    doc.text(`Datum: ______________`, pageWidth - 70, yPosition)
    yPosition += 10

    doc.setFontSize(18)
    doc.setFont('helvetica', 'bold')
    setColor(tc.primary)
    doc.text('PRÜFUNG', pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 10

    doc.setFontSize(14)
    const titleText = worksheet.title || worksheet.content?.title || 'Prüfung'
    const titleLines = doc.splitTextToSize(titleText, pageWidth - 40)
    writeLines(titleLines, pageWidth / 2, 7, { align: 'center' })
    yPosition += 4

    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    doc.text(`Klasse: ${worksheet.grade} | Fach: ${worksheet.subject} | Schwierigkeit: ${DIFFICULTY_LABELS[worksheet.difficulty] || worksheet.difficulty}`, pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 7

    if (version === 'student') {
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(11)
      doc.text('Vorname / Name: ______________________________________', 20, yPosition)
      yPosition += 8
      // Exam info box with theme color
      setDrawHex(tc.accent)
      doc.setLineWidth(0.8)
      setFillHex(tc.primaryLight)
      doc.roundedRect(20, yPosition, pageWidth - 40, 22, 2, 2, 'FD')
      doc.setFontSize(9)
      doc.setFont('helvetica', 'normal')
      doc.setTextColor(60, 60, 60)
      doc.text(`Anzahl Aufgaben: ${worksheet.content?.questions?.length || '–'}`, 25, yPosition + 7)
      doc.text(`Maximale Punktzahl: ${worksheet.content?.total_points ?? '–'}`, 25, yPosition + 14)
      doc.text(`Zeit: ${worksheet.content?.estimated_time ?? '–'}`, pageWidth / 2, yPosition + 7)
      doc.text('Erreichte Punkte: _______ ', pageWidth / 2, yPosition + 14)
      doc.setLineWidth(0.2)
      yPosition += 28
      // Grading scale
      doc.setFontSize(8)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(120, 120, 120)
      const tp = worksheet.content?.total_points || 0
      if (tp > 0) {
        doc.text(`Notenskala: 6 = ${Math.round(tp * 0.92)}–${tp}P | 5.5 = ${Math.round(tp * 0.84)}–${Math.round(tp * 0.91)}P | 5 = ${Math.round(tp * 0.76)}–${Math.round(tp * 0.83)}P | 4.5 = ${Math.round(tp * 0.68)}–${Math.round(tp * 0.75)}P | 4 = ${Math.round(tp * 0.5)}–${Math.round(tp * 0.67)}P`, 20, yPosition)
        yPosition += 6
      }
    } else {
      doc.setFontSize(9)
      doc.setTextColor(180, 0, 0)
      doc.setFont('helvetica', 'bold')
      doc.text('LEHRERVERSION – MIT LÖSUNGEN', pageWidth / 2, yPosition, { align: 'center' })
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'normal')
      yPosition += 8
    }
  } else {
    // ---- WORKSHEET / QUIZ / VOCAB HEADER (Canva-inspired) ----
    // Subtle header background block
    setFillHex(tc.primaryLight)
    doc.roundedRect(15, yPosition - 8, pageWidth - 30, 32, 3, 3, 'F')

    doc.setFontSize(16)
    doc.setFont('helvetica', 'bold')
    setColor(tc.primary)
    const titleText = worksheet.title || worksheet.content?.title || 'Material'
    const titleLines = doc.splitTextToSize(titleText, pageWidth - 50)
    writeLines(titleLines, pageWidth / 2, 7, { align: 'center' })
    yPosition += 3

    // Metadata badges inline
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.setTextColor(100, 100, 100)
    const metaText = `${worksheet.grade}. Klasse  ·  ${worksheet.subject}  ·  ${DIFFICULTY_LABELS[worksheet.difficulty] || worksheet.difficulty}`
    doc.text(metaText, pageWidth / 2, yPosition, { align: 'center' })
    yPosition += 12

    if (version === 'student') {
      doc.setTextColor(0, 0, 0)
      doc.setFontSize(10)
      doc.setFont('helvetica', 'normal')
      doc.text('Name: ___________________________________________', 20, yPosition)
      doc.text('Datum: ______________', pageWidth - 60, yPosition)
      yPosition += 10
    } else {
      doc.setFontSize(9)
      doc.setTextColor(180, 0, 0)
      doc.setFont('helvetica', 'bold')
      doc.text('LEHRERVERSION – MIT LÖSUNGEN', pageWidth / 2, yPosition, { align: 'center' })
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'normal')
      yPosition += 10
    }
  }

  // Themed divider line
  setDrawHex(tc.accent)
  doc.setLineWidth(tp_pdf.headerLineWidth)
  doc.line(20, yPosition, pageWidth - 20, yPosition)
  doc.setLineWidth(0.2)
  yPosition += 10

  // Questions - type-specific rendering with theme
  worksheet.content?.questions?.forEach((q, qIdx) => {
    checkPage(60)
    const qType = q.type || (q.options ? 'multiple_choice' : 'open')

    // === Image Block: standalone image with size/alignment ===
    if (qType === 'image_block') {
      if (q.question) {
        doc.setFontSize(10.5)
        doc.setFont('helvetica', 'bold')
        doc.setTextColor(30, 30, 30)
        writeLines(doc.splitTextToSize(sanitizePdfText(`${q.number}. ${q.question}`), pageWidth - 40), 20)
        yPosition += 4
      }
      const sizeMap = { small: 40, medium: 80, large: 120, full: pageWidth - 40 }
      const imgW = sizeMap[q.imageSize || 'medium'] || 80
      const imgH = imgW * 0.6 // aspect ratio placeholder
      const align = q.imageAlignment || 'center'
      const imgX = align === 'left' ? 20 : align === 'right' ? pageWidth - 20 - imgW : (pageWidth - imgW) / 2
      checkPage(imgH + 15)

      if (q.imageUrl && q.imageUrl.startsWith('data:image')) {
        try {
          doc.addImage(q.imageUrl, inlineImageFormat(q.imageUrl), imgX, yPosition, imgW, imgH)
        } catch (e) {
          // Fallback: placeholder box
          setDrawHex(tc.accent + '60')
          setFillHex(tc.primaryLight)
          doc.setLineWidth(0.3)
          doc.roundedRect(imgX, yPosition, imgW, imgH, 2, 2, 'FD')
          doc.setFontSize(8)
          doc.setFont('helvetica', 'italic')
          doc.setTextColor(140, 140, 140)
          doc.text('[Bild konnte nicht geladen werden]', imgX + imgW / 2, yPosition + imgH / 2, { align: 'center' })
        }
      } else if (q.imageUrl) {
        // External URL - show placeholder with note
        setDrawHex(tc.accent + '60')
        setFillHex(tc.primaryLight)
        doc.setLineWidth(0.3)
        doc.roundedRect(imgX, yPosition, imgW, imgH, 2, 2, 'FD')
        doc.setFontSize(8)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(140, 140, 140)
        doc.text('[Externes Bild]', imgX + imgW / 2, yPosition + imgH / 2, { align: 'center' })
      } else {
        // Empty placeholder
        setDrawHex(tc.accent + '60')
        setFillHex(tc.primaryLight)
        doc.setLineWidth(0.3)
        doc.roundedRect(imgX, yPosition, imgW, imgH, 2, 2, 'FD')
        doc.setFontSize(8)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(140, 140, 140)
        doc.text('[Bildfeld]', imgX + imgW / 2, yPosition + imgH / 2, { align: 'center' })
      }
      yPosition += imgH + 3
      doc.setLineWidth(0.2)

      // Caption
      if (q.imageCaption) {
        doc.setFontSize(8)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(100, 100, 100)
        const captionX = align === 'left' ? 20 : align === 'right' ? pageWidth - 20 : pageWidth / 2
        const captionAlign = align === 'left' ? 'left' : align === 'right' ? 'right' : 'center'
        writeLines(doc.splitTextToSize(sanitizePdfText(q.imageCaption), imgW), captionX, 5, { align: captionAlign })
        yPosition += 1
      }
      doc.setTextColor(0, 0, 0)
      yPosition += 5
      return // skip normal question rendering
    }

    // Question number in themed circle/badge
    setFillHex(tc.accent)
    doc.circle(22, yPosition - 1, 4, 'F')
    doc.setFontSize(9)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(255, 255, 255)
    doc.text(String(q.number), 22, yPosition + 0.5, { align: 'center' })

    // Keep the points badge on the first question line, then paginate its text.
    if (showPoints) {
      doc.setFontSize(8)
      doc.setFont('helvetica', 'normal')
      setColor(tc.primary)
      setFillHex(tc.primaryLight)
      doc.roundedRect(pageWidth - 30, yPosition - 4, 12, 6, 1, 1, 'F')
      doc.text(`${q.points || 1}P`, pageWidth - 24, yPosition, { align: 'center' })
    }
    doc.setFontSize(10.5)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 30)
    const maxWidth = showPoints ? pageWidth - 65 : pageWidth - 50
    const questionLines = doc.splitTextToSize(sanitizePdfText(q.question), maxWidth)
    for (const line of questionLines) {
      checkPage(15)
      setFillHex(tc.questionBorder)
      doc.rect(15, yPosition - 4, 1.5, 5, 'F')
      doc.text(line, 29, yPosition)
      yPosition += 5
    }
    yPosition += 4

    // === True-False: always exactly Wahr + Falsch boxes ===
    if (qType === 'true_false') {
      checkPage(18)
      yPosition += 4
      const boxWidth = 35
      const boxHeight = 10
      const startX = 30
      const gap = 8
      const tfLabels = ['Wahr', 'Falsch']

      tfLabels.forEach((label, oi) => {
        const xPos = startX + oi * (boxWidth + gap)
        const correct = version === 'teacher' && q.answer === label

        // Student choices are neutral; only the solution marks the correct one.
        doc.setDrawColor(correct ? 0 : 120, 120, correct ? 0 : 120)
        doc.setLineWidth(0.5)
        doc.roundedRect(xPos, yPosition - 3, boxWidth, boxHeight, 2, 2)

        // Circle to mark
        doc.circle(xPos + 5, yPosition + 2, 2.2)
        if (correct) {
          doc.setFillColor(0, 120, 0)
          doc.circle(xPos + 5, yPosition + 2, 1.1, 'F')
        }

        // Label text
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        doc.setTextColor(correct ? 0 : 50, correct ? 120 : 50, correct ? 0 : 50)
        doc.text(label, xPos + 10, yPosition + 3.5)
      })
      yPosition += boxHeight + 5
    }

    // === MC / Either-Or: clean print-friendly style ===
    if (['multiple_choice', 'either_or'].includes(qType) && q.options) {
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      yPosition += 3
      q.options.forEach((option, oi) => {
        checkPage(12)
        const letter = String.fromCharCode(65 + oi)
        const cleanOption = sanitizePdfText(option.replace(/^[A-Z]\)\s*/, ''))
        const optionLines = doc.splitTextToSize(cleanOption, pageWidth - 60)

        // Checkbox square with letter
        doc.setDrawColor(120, 120, 120)
        doc.setLineWidth(0.4)
        doc.rect(30, yPosition - 3.5, 4, 4)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(8)
        doc.setTextColor(100, 100, 100)
        doc.text(letter, 32, yPosition - 0.3, { align: 'center' })

        // Option text
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(10)
        doc.setTextColor(40, 40, 40)
        writeLines(optionLines, 38)
        yPosition += 4
      })
      yPosition += 2
    }

    // === Fill in the blank: inline text with underline gaps ===
    if (qType === 'fill_blank') {
      checkPage(25)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(50, 50, 50)
      const blankedText = sanitizePdfText(q.question).replace(/___+/g, ' ________________ ')
      const fullLines = doc.splitTextToSize(blankedText, pageWidth - 50)
      fullLines.forEach(line => {
        checkPage(10)
        doc.text(line, 25, yPosition)
        yPosition += 6
      })
      if (version === 'student') {
        yPosition += 4
        setDrawHex(tp_pdf.lineColor)
        for (let i = 0; i < 2; i++) {
          checkPage(8)
          doc.line(25, yPosition, pageWidth - 25, yPosition)
          yPosition += 8
        }
      }
      yPosition += 3
    }

    // === Matching: two columns ===
    if (qType === 'matching' && q.answer) {
      checkPage(30)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(50, 50, 50)
      const pairs = answerItems(q.answer).filter(Boolean)
      const colLeft = 25
      const colRight = pageWidth / 2 + 10
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(9)
      setColor(tc.primary)
      doc.text('Begriff', colLeft, yPosition)
      doc.text('Zuordnung', colRight, yPosition)
      yPosition += 3
      setDrawHex(tc.accent)
      doc.setLineWidth(0.4)
      doc.line(colLeft, yPosition, pageWidth - 25, yPosition)
      doc.setLineWidth(0.2)
      yPosition += 5
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(50, 50, 50)
      const rightItems = version === 'student'
        ? shuffledMatchingRight(q).map(item => item.text)
        : pairs.map(pair => pair.split('→')[1]?.trim())
      pairs.forEach((pair, pi) => {
        const [left] = pair.split('→').map(value => value?.trim())
        const right = rightItems[pi]
        const leftLines = doc.splitTextToSize(sanitizePdfText(`${pi + 1}. ${left || ''}`), colRight - colLeft - 8)
        const rightLines = doc.splitTextToSize(sanitizePdfText(version === 'student' ? `___  ${right || ''}` : `${pi + 1}. ${right || ''}`), pageWidth - colRight - 25)
        for (let line = 0; line < Math.max(leftLines.length, rightLines.length); line++) {
          checkPage(15)
          if (leftLines[line]) doc.text(leftLines[line], colLeft, yPosition)
          if (rightLines[line]) doc.text(rightLines[line], colRight, yPosition)
          yPosition += 5
        }
        yPosition += 2
      })
      yPosition += 3
    }

    // === Ordering: numbered items (shuffled for student) ===
    if (qType === 'ordering' && q.answer) {
      checkPage(30)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      doc.setTextColor(50, 50, 50)
      const items = answerItems(q.answer).filter(Boolean)
      const displayItems = version === 'student'
        ? shuffledOrderingItems(q)
        : items
      displayItems.forEach((item, ii) => {
        checkPage(12)
        if (version === 'student') {
          setDrawHex(tc.accent)
          setFillHex(tc.primaryLight)
          doc.setLineWidth(0.3)
          doc.roundedRect(28, yPosition - 4, 8, 5, 1, 1, 'FD')
          doc.setLineWidth(0.2)
          doc.setTextColor(50, 50, 50)
          writeLines(doc.splitTextToSize(sanitizePdfText(item), pageWidth - 65), 40)
        } else {
          doc.setFont('helvetica', 'bold')
          setColor(tc.primary)
          doc.text(`${ii + 1}.`, 28, yPosition)
          doc.setFont('helvetica', 'normal')
          doc.setTextColor(50, 50, 50)
          writeLines(doc.splitTextToSize(sanitizePdfText(item), pageWidth - 61), 36)
        }
        yPosition += 3
      })
      yPosition += 3
    }

    // === Math: equation + answer space ===
    if (qType === 'math') {
      checkPage(45)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(10)
      if (version === 'student') {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(120, 120, 120)
        doc.text('Rechnung / Lösungsweg:', 25, yPosition)
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'normal')
        yPosition += 6
        setDrawHex(tp_pdf.lineColor)
        for (let i = 0; i < 5; i++) {
          checkPage(8)
          doc.line(25, yPosition, pageWidth - 25, yPosition)
          yPosition += 8
        }
        yPosition += 2
        setDrawHex(tc.accent)
        setFillHex(tc.primaryLight)
        doc.setLineWidth(0.5)
        doc.roundedRect(25, yPosition - 1, pageWidth - 50, 10, 2, 2, 'FD')
        doc.setLineWidth(0.2)
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(10)
        setColor(tc.primary)
        doc.text('Antwort:', 28, yPosition + 6)
        doc.setTextColor(0, 0, 0)
        yPosition += 14
      }
    }

    // === Image: placeholder box with better styling ===
    if (qType === 'image') {
      checkPage(60)
      setDrawHex(tc.accent + '80')
      setFillHex(tc.primaryLight)
      doc.setLineWidth(0.3)
      const imgBoxWidth = Math.min(pageWidth - 60, 120)
      const imgBoxX = (pageWidth - imgBoxWidth) / 2
      doc.roundedRect(imgBoxX, yPosition, imgBoxWidth, 40, 3, 3, 'FD')
      // Cross lines to indicate image area
      setDrawHex(tp_pdf.lineColor)
      doc.line(imgBoxX, yPosition, imgBoxX + imgBoxWidth, yPosition + 40)
      doc.line(imgBoxX + imgBoxWidth, yPosition, imgBoxX, yPosition + 40)
      doc.setFontSize(9)
      doc.setFont('helvetica', 'italic')
      doc.setTextColor(140, 140, 140)
      doc.text('[Bild hier einkleben oder einf' + String.fromCharCode(252) + 'gen]', pageWidth / 2, yPosition + 22, { align: 'center' })
      doc.setTextColor(0, 0, 0)
      doc.setLineWidth(0.2)
      yPosition += 46
      // Answer lines
      if (version === 'student') {
        doc.setFontSize(9)
        doc.setFont('helvetica', 'italic')
        doc.setTextColor(120, 120, 120)
        doc.text('Antwort:', 25, yPosition)
        doc.setTextColor(0, 0, 0)
        doc.setFont('helvetica', 'normal')
        yPosition += 4
        setDrawHex(tp_pdf.lineColor)
        for (let i = 0; i < 3; i++) {
          checkPage(8)
          doc.line(25, yPosition, pageWidth - 25, yPosition)
          yPosition += 8
        }
      }
    }

    // Wrap each cell and split an oversized row across pages without dropping text.
    if (qType === 'table' && q.tableHeaders?.length) {
      const headers = q.tableHeaders
      const tableWidth = pageWidth - 50
      const colWidth = tableWidth / headers.length
      if (colWidth < 12) throw new Error('Die Tabelle hat zu viele Spalten für einen lesbaren PDF-Export. Bitte reduzieren Sie die Spaltenzahl oder verwenden Sie den Word-Export.')
      const startX = 25
      doc.setFontSize(9)
      doc.setTextColor(50, 50, 50)
      for (const [rowIndex, row] of [headers, ...(q.tableRows || [])].entries()) {
        doc.setFont('helvetica', rowIndex === 0 ? 'bold' : 'normal')
        const cells = headers.map((_, column) => doc.splitTextToSize(sanitizePdfText(row[column] ?? ''), colWidth - 4))
        const lineCount = Math.max(1, ...cells.map(lines => lines.length))
        let offset = 0
        while (offset < lineCount) {
          checkPage(18)
          const capacity = Math.max(1, Math.floor((pageHeight - 20 - yPosition - 4) / 5))
          const count = Math.min(capacity, lineCount - offset)
          const height = count * 5 + 4
          doc.setDrawColor(160, 160, 160)
          doc.setLineWidth(0.3)
          if (rowIndex === 0) doc.setFillColor(240, 240, 240)
          doc.rect(startX, yPosition, tableWidth, height, rowIndex === 0 ? 'FD' : 'S')
          for (let column = 0; column < headers.length; column++) {
            if (column) doc.line(startX + column * colWidth, yPosition, startX + column * colWidth, yPosition + height)
            for (let line = 0; line < count; line++) {
              const text = cells[column][offset + line]
              if (text) doc.text(text, startX + column * colWidth + 2, yPosition + 5 + line * 5)
            }
          }
          yPosition += height
          offset += count
        }
      }
      doc.setLineWidth(0.2)
      yPosition += 4
    }

    // === Open questions: writing lines ===
    if (qType === 'open' && version === 'student') {
      const pts = q.points || 1
      const lineCount = q.lineCount || (pts >= 3 ? 5 : pts >= 2 ? 3 : 2)
      setDrawHex(tp_pdf.lineColor)
      for (let i = 0; i < lineCount; i++) {
        checkPage(10)
        yPosition += 8
        doc.line(25, yPosition, pageWidth - 25, yPosition)
      }
      yPosition += 5
    }

    // Generic writing lines for types without specific handler
    if (!['multiple_choice', 'true_false', 'either_or', 'fill_blank', 'matching', 'ordering', 'math', 'image', 'open', 'table'].includes(qType) && version === 'student' && !q.options) {
      const pts = q.points || 1
      const lineCount = pts >= 3 ? 5 : pts >= 2 ? 3 : 2
      setDrawHex(tp_pdf.lineColor)
      for (let i = 0; i < lineCount; i++) {
        checkPage(10)
        yPosition += 8
        doc.line(25, yPosition, pageWidth - 25, yPosition)
      }
      yPosition += 5
    }

    // A long solution is split into complete, bounded boxes on successive pages.
    if (version === 'teacher' && q.answer) {
      const answerLabel = qType === 'fill_blank' ? 'Lücken' : qType === 'matching' ? 'Zuordnung' : qType === 'ordering' ? 'Reihenfolge' : 'Lösung'
      doc.setFontSize(9)
      doc.setFont('helvetica', 'bold')
      doc.setTextColor(0, 120, 0)
      const answerLines = doc.splitTextToSize(sanitizePdfText(`${answerLabel}: ${q.answer}`), pageWidth - 55)
      let offset = 0
      while (offset < answerLines.length) {
        checkPage(20)
        const capacity = Math.max(1, Math.floor((pageHeight - 20 - yPosition - 6) / 5))
        const count = Math.min(capacity, answerLines.length - offset)
        const height = count * 5 + 6
        doc.setFillColor(240, 255, 240)
        doc.setDrawColor(0, 160, 0)
        doc.setLineWidth(0.3)
        doc.roundedRect(23, yPosition - 3, pageWidth - 46, height, 2, 2, 'FD')
        doc.setLineWidth(0.2)
        for (let line = 0; line < count; line++) doc.text(answerLines[offset + line], 27, yPosition + 2 + line * 5)
        yPosition += height + 3
        offset += count
      }
      doc.setTextColor(0, 0, 0)
      doc.setFont('helvetica', 'normal')
    }

    yPosition += 6

    // Themed separator between questions
    if (isExam) {
      checkPage(10)
      setDrawHex(tp_pdf.lineColor)
      doc.setLineWidth(0.3)
      doc.line(20, yPosition, pageWidth - 20, yPosition)
      doc.setLineWidth(0.2)
      yPosition += 6
    }
  })

  // Teacher notes (teacher version only)
  if (version === 'teacher' && worksheet.content?.teacher_notes) {
    checkPage(40)
    yPosition += 10
    doc.setDrawColor(200, 200, 200)
    doc.line(20, yPosition, pageWidth - 20, yPosition)
    yPosition += 10
    doc.setFontSize(13)
    doc.setFont('helvetica', 'bold')
    doc.text('Lehrernotizen', 20, yPosition)
    yPosition += 8
    doc.setFontSize(10)
    doc.setFont('helvetica', 'normal')
    const notesLines = doc.splitTextToSize(sanitizePdfText(worksheet.content.teacher_notes), pageWidth - 40)
    notesLines.forEach(line => {
      checkPage(10)
      doc.text(line, 20, yPosition)
      yPosition += 5
    })
  }

  // Footer with theme — Canva-style info bar
  checkPage(25)
  yPosition += 10
  setFillHex(tc.primaryLight)
  setDrawHex(tc.accent + '40')
  doc.setLineWidth(0.3)
  doc.roundedRect(15, yPosition - 2, pageWidth - 30, 14, 2, 2, 'FD')
  doc.setLineWidth(0.2)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'bold')
  setColor(tc.primary)
  if (showPoints) {
    doc.text(`Total: ${worksheet.content?.total_points ?? '–'} Punkte`, 22, yPosition + 6)
    doc.setFont('helvetica', 'normal')
    doc.text(`Geschätzte Zeit: ${worksheet.content?.estimated_time ?? '–'}`, pageWidth - 22, yPosition + 6, { align: 'right' })
  } else {
    doc.text(`Geschätzte Zeit: ${worksheet.content?.estimated_time ?? '–'}`, pageWidth / 2, yPosition + 6, { align: 'center' })
  }
  doc.setTextColor(0, 0, 0)

  // Exam: add note signature line at bottom
  if (isExam && version === 'student') {
    checkPage(30)
    yPosition += 15
    doc.setFontSize(9)
    doc.setFont('helvetica', 'normal')
    doc.text('Note: ________     Unterschrift Lehrperson: ________________________________', 20, yPosition)
    yPosition += 8
    doc.text('Unterschrift Eltern: ____________________________________________', 20, yPosition)
  }

  return doc
}

export function createDemoDOCX(worksheet, { solutions = false } = {}) {
  const version = solutions ? 'teacher' : 'student'
  worksheet = prepareDemoWorksheet(worksheet)
  const isExam = worksheet.resourceType === 'exam' || worksheet.content?.resourceType === 'exam'
  const showPoints = isExam
  const questions = worksheet.content?.questions || []
  const tp = worksheet.content?.total_points || 0

  const noBorder = {
    top: { style: BorderStyle.NONE, size: 0 },
    bottom: { style: BorderStyle.NONE, size: 0 },
    left: { style: BorderStyle.NONE, size: 0 },
    right: { style: BorderStyle.NONE, size: 0 },
  }

  const thinBorder = {
    top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
    right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
  }

  const children = []

  // ---- HEADER ----
  if (isExam) {
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: 'Schule: ___________________________________________', size: 20 }),
          new TextRun({ text: '     Datum: ______________', size: 20 }),
        ],
        spacing: { after: 200 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'PRÜFUNG', bold: true, size: 36 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [new TextRun({ text: worksheet.title || worksheet.content?.title || 'Prüfung', bold: true, size: 28 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `Klasse: ${worksheet.grade} | Fach: ${worksheet.subject} | Schwierigkeit: ${DIFFICULTY_LABELS[worksheet.difficulty] || worksheet.difficulty}`, size: 20 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    )

    if (version === 'student') {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Vorname / Name: ______________________________________', size: 22 })],
          spacing: { after: 200 },
        }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          borders: {
            top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
            left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
            right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
            insideHorizontal: { style: BorderStyle.NONE, size: 0 },
            insideVertical: { style: BorderStyle.NONE, size: 0 },
          },
          rows: [
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: `Anzahl Aufgaben: ${questions.length || '–'}`, size: 18 })], spacing: { before: 40, after: 40 } })],
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: noBorder,
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: `Zeit: ${worksheet.content?.estimated_time ?? '–'}`, size: 18 })], spacing: { before: 40, after: 40 } })],
                  width: { size: 50, type: WidthType.PERCENTAGE },
                  borders: noBorder,
                }),
              ],
            }),
            new TableRow({
              children: [
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: `Maximale Punktzahl: ${tp ?? '–'}`, size: 18 })], spacing: { before: 40, after: 40 } })],
                  borders: noBorder,
                }),
                new TableCell({
                  children: [new Paragraph({ children: [new TextRun({ text: 'Erreichte Punkte: _______', size: 18 })], spacing: { before: 40, after: 40 } })],
                  borders: noBorder,
                }),
              ],
            }),
          ],
        })
      )

      if (tp > 0) {
        children.push(
          new Paragraph({
            children: [new TextRun({
              text: `Notenskala: 6 = ${Math.round(tp * 0.92)}–${tp}P | 5.5 = ${Math.round(tp * 0.84)}–${Math.round(tp * 0.91)}P | 5 = ${Math.round(tp * 0.76)}–${Math.round(tp * 0.83)}P | 4.5 = ${Math.round(tp * 0.68)}–${Math.round(tp * 0.75)}P | 4 = ${Math.round(tp * 0.5)}–${Math.round(tp * 0.67)}P`,
              size: 16, italics: true,
            })],
            spacing: { before: 100, after: 200 },
          })
        )
      }
    } else {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'LEHRERVERSION – MIT LÖSUNGEN', bold: true, size: 18, color: 'B40000' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 200 },
        })
      )
    }
  } else {
    // Worksheet / Quiz / Vocab header
    children.push(
      new Paragraph({
        children: [new TextRun({ text: worksheet.title || worksheet.content?.title || 'Material', bold: true, size: 36 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 },
      }),
      new Paragraph({
        children: [new TextRun({ text: `Klasse: ${worksheet.grade} | Fach: ${worksheet.subject} | Schwierigkeit: ${DIFFICULTY_LABELS[worksheet.difficulty] || worksheet.difficulty}`, size: 20 })],
        alignment: AlignmentType.CENTER,
        spacing: { after: 200 },
      })
    )

    if (version === 'student') {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'Name: ____________________________________________     Datum: ______________', size: 22 })],
          spacing: { after: 300 },
        })
      )
    } else {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: 'LEHRERVERSION – MIT LÖSUNGEN', bold: true, size: 18, color: 'B40000' })],
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
        })
      )
    }
  }

  // Separator
  children.push(
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
      spacing: { after: 200 },
    })
  )

  // ---- QUESTIONS ----
  questions.forEach((q) => {
    const qType = q.type || (q.options ? 'multiple_choice' : 'open')
    const pointsSuffix = showPoints ? `  (${q.points || 1}P)` : ''

    // === Image Block: standalone image placeholder ===
    if (qType === 'image_block') {
      if (q.question) {
        children.push(new Paragraph({
          children: [new TextRun({ text: `${q.number}. ${q.question}`, bold: true, size: 22 })],
          spacing: { before: 240, after: 120 },
        }))
      }
      const alignMap = { left: AlignmentType.LEFT, center: AlignmentType.CENTER, right: AlignmentType.RIGHT }
      children.push(
        new Paragraph({
          children: [new TextRun({ text: '[Bildfeld]', italics: true, size: 20, color: '999999' })],
          alignment: alignMap[q.imageAlignment || 'center'] || AlignmentType.CENTER,
          spacing: { before: 200, after: 60 },
          border: thinBorder,
        })
      )
      if (q.imageCaption) {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: q.imageCaption, italics: true, size: 16, color: '666666' })],
            alignment: alignMap[q.imageAlignment || 'center'] || AlignmentType.CENTER,
            spacing: { after: 120 },
          })
        )
      }
      return
    }

    // Question text
    children.push(
      new Paragraph({
        children: [
          new TextRun({ text: `${q.number}. ${q.question}`, bold: true, size: 22 }),
          ...(showPoints ? [new TextRun({ text: pointsSuffix, size: 16 })] : []),
        ],
        spacing: { before: 240, after: 120 },
      })
    )

    // === MC / True-False / Either-Or ===
    if (['multiple_choice', 'true_false', 'either_or'].includes(qType) && q.options) {
      q.options.forEach((option, oi) => {
        const letter = String.fromCharCode(65 + oi)
        const cleanOption = option.replace(/^[A-Z]\)\s*/, '')
        if (isExam) {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: '\u2610 ', size: 20 }),
                new TextRun({ text: `${letter}) `, bold: true, size: 20 }),
                new TextRun({ text: cleanOption, size: 20 }),
              ],
              indent: { left: 360 },
              spacing: { after: 60 },
            })
          )
        } else {
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: `\u25CB  ${letter}) `, bold: true, size: 20 }),
                new TextRun({ text: cleanOption, size: 20 }),
              ],
              indent: { left: 360 },
              spacing: { after: 60 },
            })
          )
        }
      })
    }

    // === Fill in the blank ===
    if (qType === 'fill_blank') {
      const parts = q.question.split(/___+/)
      const runs = []
      parts.forEach((part, pi) => {
        if (part.trim()) runs.push(new TextRun({ text: part.trim(), size: 20 }))
        if (pi < parts.length - 1) {
          runs.push(new TextRun({ text: ' ________________________ ', size: 20, underline: { type: UnderlineType.SINGLE } }))
        }
      })
      children.push(
        new Paragraph({
          children: runs,
          indent: { left: 360 },
          spacing: { after: 120 },
        })
      )
    }

    // === Matching ===
    if (qType === 'matching' && q.answer) {
      const pairs = answerItems(q.answer).filter(Boolean)
      const rightItems = version === 'student'
        ? shuffledMatchingRight(q).map(item => item.text)
        : pairs.map(pair => pair.split('→')[1]?.trim())

      const tableRows = [
        new TableRow({
          children: [
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Begriff', bold: true, size: 18 })], spacing: { before: 40, after: 40 } })],
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: thinBorder,
            }),
            new TableCell({
              children: [new Paragraph({ children: [new TextRun({ text: 'Zuordnung', bold: true, size: 18 })], spacing: { before: 40, after: 40 } })],
              width: { size: 50, type: WidthType.PERCENTAGE },
              borders: thinBorder,
            }),
          ],
        }),
      ]

      pairs.forEach((pair, pi) => {
        const [left] = pair.split('\u2192').map(s => s?.trim())
        const right = rightItems[pi]
        tableRows.push(
          new TableRow({
            children: [
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: `${pi + 1}. ${left || ''}`, size: 20 })], spacing: { before: 40, after: 40 } })],
                borders: thinBorder,
              }),
              new TableCell({
                children: [new Paragraph({ children: [new TextRun({ text: version === 'student' ? `___  ${right || ''}` : `${pi + 1}. ${right || ''}`, size: 20 })], spacing: { before: 40, after: 40 } })],
                borders: thinBorder,
              }),
            ],
          })
        )
      })

      children.push(
        new Table({
          width: { size: 90, type: WidthType.PERCENTAGE },
          rows: tableRows,
        })
      )
    }

    // === Ordering ===
    if (qType === 'ordering' && q.answer) {
      const items = answerItems(q.answer).filter(Boolean).map(s => s.trim())
      const displayItems = version === 'student' ? shuffledOrderingItems(q) : items
      displayItems.forEach((item, ii) => {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: version === 'student' ? `___  ${item}` : `${ii + 1}.  ${item}`, size: 20 })],
            indent: { left: 540 },
            spacing: { after: 60 },
          })
        )
      })
    }

    // === Math ===
    if (qType === 'math') {
      if (version === 'student') {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: 'Rechnung:', size: 20 })],
            indent: { left: 360 },
            spacing: { after: 60 },
          })
        )
        for (let i = 0; i < 4; i++) {
          children.push(
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' } },
              indent: { left: 360 },
              spacing: { after: 120 },
              children: [new TextRun({ text: ' ', size: 20 })],
            })
          )
        }
        children.push(
          new Paragraph({
            children: [new TextRun({ text: 'Antwort: _________________________________', bold: true, size: 20 })],
            indent: { left: 360 },
            spacing: { after: 120 },
          })
        )
      }
    }

    // === Image ===
    if (qType === 'image') {
      children.push(
        new Paragraph({
          children: [new TextRun({ text: '[Bild wird hier eingefügt]', italics: true, size: 18, color: '999999' })],
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 200 },
          border: {
            top: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
            left: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
            right: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' },
          },
        })
      )
      if (version === 'student') {
        for (let i = 0; i < 3; i++) {
          children.push(
            new Paragraph({
              border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' } },
              indent: { left: 360 },
              spacing: { after: 120 },
              children: [new TextRun({ text: ' ', size: 20 })],
            })
          )
        }
      }
    }

    // Tables use the same normalized headers/cells as the browser preview.
  if (qType === 'table' && q.tableHeaders?.length) {
    const grid = [q.tableHeaders, ...(q.tableRows || [])]
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: grid.map((row, rowIndex) => new TableRow({
        children: q.tableHeaders.map((_, columnIndex) => new TableCell({
          borders: thinBorder,
          children: [new Paragraph({
            children: [new TextRun({ text: String(row[columnIndex] ?? ''), bold: rowIndex === 0, size: 18 })],
            spacing: { before: 60, after: 60 },
          })],
        })),
      })),
    }))
  }

  // === Open questions: writing lines ===
    if (qType === 'open' && version === 'student') {
      const pts = q.points || 1
      const lineCount = q.lineCount || (pts >= 3 ? 5 : pts >= 2 ? 3 : 2)
      for (let i = 0; i < lineCount; i++) {
        children.push(
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' } },
            indent: { left: 360 },
            spacing: { after: 120 },
            children: [new TextRun({ text: ' ', size: 20 })],
          })
        )
      }
    }

    // Generic writing lines for unknown types
    if (!['multiple_choice', 'true_false', 'either_or', 'fill_blank', 'matching', 'ordering', 'math', 'image', 'open', 'table'].includes(qType) && version === 'student' && !q.options) {
      const pts = q.points || 1
      const lineCount = pts >= 3 ? 5 : pts >= 2 ? 3 : 2
      for (let i = 0; i < lineCount; i++) {
        children.push(
          new Paragraph({
            border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'BBBBBB' } },
            indent: { left: 360 },
            spacing: { after: 120 },
            children: [new TextRun({ text: ' ', size: 20 })],
          })
        )
      }
    }

    // Teacher version: show answer
    if (version === 'teacher' && q.answer) {
      const answerLabel = qType === 'fill_blank' ? 'Lücken' : qType === 'matching' ? 'Zuordnung' : qType === 'ordering' ? 'Reihenfolge' : 'Lösung'
      children.push(
        new Paragraph({
          children: [new TextRun({ text: `${answerLabel}: ${q.answer}`, bold: true, size: 18, color: '008000' })],
          indent: { left: 360 },
          spacing: { before: 80, after: 80 },
          shading: { type: 'clear', fill: 'F0FFF0' },
          border: {
            top: { style: BorderStyle.SINGLE, size: 1, color: '00A000' },
            bottom: { style: BorderStyle.SINGLE, size: 1, color: '00A000' },
            left: { style: BorderStyle.SINGLE, size: 1, color: '00A000' },
            right: { style: BorderStyle.SINGLE, size: 1, color: '00A000' },
          },
        })
      )
    }

    // Exam separator
    if (isExam) {
      children.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'DDDDDD' } },
          spacing: { after: 120 },
        })
      )
    }
  })

  // ---- TEACHER NOTES ----
  if (version === 'teacher' && worksheet.content?.teacher_notes) {
    children.push(
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
        spacing: { before: 300, after: 200 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Lehrernotizen', bold: true, size: 26 })],
        spacing: { after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: worksheet.content.teacher_notes, size: 20 })],
        spacing: { after: 200 },
      })
    )
  }

  // ---- FOOTER ----
  children.push(
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CCCCCC' } },
      spacing: { before: 200, after: 120 },
    })
  )

  if (showPoints) {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Total: ${worksheet.content?.total_points ?? '–'} Punkte | Geschätzte Zeit: ${worksheet.content?.estimated_time ?? '–'}`, bold: true, size: 20 })],
        spacing: { after: 120 },
      })
    )
  } else {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: `Geschätzte Zeit: ${worksheet.content?.estimated_time ?? '–'}`, bold: true, size: 20 })],
        spacing: { after: 120 },
      })
    )
  }

  // Exam signature lines
  if (isExam && version === 'student') {
    children.push(
      new Paragraph({
        children: [new TextRun({ text: 'Note: ________     Unterschrift Lehrperson: ________________________________', size: 18 })],
        spacing: { before: 300, after: 120 },
      }),
      new Paragraph({
        children: [new TextRun({ text: 'Unterschrift Eltern: ____________________________________________', size: 18 })],
        spacing: { after: 120 },
      })
    )
  }

  return new Document({
    sections: [{
      properties: {
        page: {
          margin: { top: 720, bottom: 720, left: 720, right: 720 },
        },
      },
      children,
    }],
  })
}

function demoFilename(worksheet, solutions, extension) {
  const title = String(worksheet?.title || worksheet?.content?.title || 'EduFlow-Demo')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').trim().slice(0, 80) || 'EduFlow-Demo'
  return `${title}_${solutions ? 'mit_Loesungen' : 'ohne_Loesungen'}.${extension}`
}

function downloadDemoBlob(blob, filename) {
  if (typeof document === 'undefined') throw new Error('Der Download ist nur im Browser verfügbar.')
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export async function buildDemoDOCXBlob(worksheet, options = {}) {
  return Packer.toBlob(createDemoDOCX(worksheet, options))
}

export async function exportDemoPDF(worksheet, { solutions = false } = {}) {
  const blob = buildDemoPDF(worksheet, { solutions }).output('blob')
  const filename = demoFilename(worksheet, solutions, 'pdf')
  downloadDemoBlob(blob, filename)
  return { filename, blob }
}

export async function exportDemoDOCX(worksheet, { solutions = false } = {}) {
  const blob = await buildDemoDOCXBlob(worksheet, { solutions })
  const filename = demoFilename(worksheet, solutions, 'docx')
  downloadDemoBlob(blob, filename)
  return { filename, blob }
}
