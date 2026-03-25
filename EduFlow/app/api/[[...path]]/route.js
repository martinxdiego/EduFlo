import { MongoClient } from 'mongodb'
import { v4 as uuidv4 } from 'uuid'
import { NextResponse } from 'next/server'
import OpenAI from 'openai'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

// MongoDB connection
let client
let db

async function connectToMongo() {
  if (!client) {
    client = new MongoClient(process.env.MONGO_URL)
    await client.connect()
    db = client.db(process.env.DB_NAME)
  }
  return db
}

// OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
})

// Helper function to handle CORS
function handleCORS(response) {
  response.headers.set('Access-Control-Allow-Origin', process.env.CORS_ORIGINS || '*')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  response.headers.set('Access-Control-Allow-Credentials', 'true')
  return response
}

// OPTIONS handler for CORS
export async function OPTIONS() {
  return handleCORS(new NextResponse(null, { status: 200 }))
}

// Auth middleware
async function verifyToken(request) {
  const authHeader = request.headers.get('authorization')
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return null
  }
  
  const token = authHeader.substring(7)
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET)
    return decoded
  } catch (error) {
    return null
  }
}

// Swiss curriculum system prompt
function getSystemPrompt(grade, subject, difficulty) {
  const difficultyDescriptions = {
    easy: 'einfach (basic understanding, simple recall)',
    medium: 'mittel (application and analysis)',
    hard: 'schwierig (synthesis and evaluation)'
  }

  return `You are an expert Swiss primary school teacher creating worksheets aligned with Lehrplan 21 (Swiss curriculum).

Grade Level: ${grade} (Primarschule)
Subject: ${subject}
Difficulty: ${difficultyDescriptions[difficulty]}

Create age-appropriate questions that:
- Use clear, simple German suitable for grade ${grade}
- Align with Lehrplan 21 competencies
- Include varied question types (multiple choice, short answer, problem-solving)
- Are engaging and relevant to Swiss students
- Consider Swiss cultural context

Format your response as a JSON object with:
{
  "title": "Worksheet title in German",
  "questions": [
    {
      "number": 1,
      "type": "multiple_choice" | "short_answer" | "problem_solving",
      "question": "Question text",
      "options": ["A", "B", "C", "D"] (for multiple choice only),
      "answer": "Correct answer",
      "points": 1-3
    }
  ],
  "teacher_notes": "Tips for grading and common student mistakes",
  "total_points": sum of all points,
  "estimated_time": "20-30 minutes"
}`
}

// Route handler function
async function handleRoute(request, { params }) {
  const { path = [] } = params
  const route = `/${path.join('/')}`
  const method = request.method

  try {
    const db = await connectToMongo()

    // Root endpoint
    if (route === '/' && method === 'GET') {
      return handleCORS(NextResponse.json({ message: "TeacherTime API v1.0" }))
    }

    // ========== AUTH ENDPOINTS ==========
    
    // Register - POST /api/auth/register
    if (route === '/auth/register' && method === 'POST') {
      const body = await request.json()
      const { email, password, name } = body

      if (!email || !password || !name) {
        return handleCORS(NextResponse.json(
          { error: "Email, password, and name are required" },
          { status: 400 }
        ))
      }

      // Check if user exists
      const existingUser = await db.collection('users').findOne({ email })
      if (existingUser) {
        return handleCORS(NextResponse.json(
          { error: "User already exists" },
          { status: 400 }
        ))
      }

      // Hash password
      const password_hash = await bcrypt.hash(password, 10)

      // Create user
      const user = {
        id: uuidv4(),
        email,
        password_hash,
        name,
        subscription_tier: 'free',
        worksheets_used_this_month: 0,
        created_at: new Date(),
        month_reset_date: new Date()
      }

      await db.collection('users').insertOne(user)

      // Generate token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      )

      const { password_hash: _, ...userWithoutPassword } = user
      return handleCORS(NextResponse.json({ user: userWithoutPassword, token }))
    }

    // Login - POST /api/auth/login
    if (route === '/auth/login' && method === 'POST') {
      const body = await request.json()
      const { email, password } = body

      if (!email || !password) {
        return handleCORS(NextResponse.json(
          { error: "Email and password are required" },
          { status: 400 }
        ))
      }

      // Find user
      const user = await db.collection('users').findOne({ email })
      if (!user) {
        return handleCORS(NextResponse.json(
          { error: "Invalid credentials" },
          { status: 401 }
        ))
      }

      // Verify password
      const valid = await bcrypt.compare(password, user.password_hash)
      if (!valid) {
        return handleCORS(NextResponse.json(
          { error: "Invalid credentials" },
          { status: 401 }
        ))
      }

      // Generate token
      const token = jwt.sign(
        { userId: user.id, email: user.email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      )

      const { password_hash: _, ...userWithoutPassword } = user
      return handleCORS(NextResponse.json({ user: userWithoutPassword, token }))
    }

    // Get current user - GET /api/auth/me
    if (route === '/auth/me' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      const user = await db.collection('users').findOne({ id: decoded.userId })
      if (!user) {
        return handleCORS(NextResponse.json(
          { error: "User not found" },
          { status: 404 }
        ))
      }

      // Reset monthly count if needed
      const now = new Date()
      const lastReset = new Date(user.month_reset_date)
      if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
        await db.collection('users').updateOne(
          { id: user.id },
          { $set: { worksheets_used_this_month: 0, month_reset_date: now } }
        )
        user.worksheets_used_this_month = 0
      }

      const { password_hash: _, ...userWithoutPassword } = user
      return handleCORS(NextResponse.json(userWithoutPassword))
    }

    // ========== WORKSHEET GENERATION ==========

    // Generate worksheet - POST /api/generate-worksheet
    if (route === '/generate-worksheet' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      const user = await db.collection('users').findOne({ id: decoded.userId })
      
      // Check usage limits
      if (user.subscription_tier === 'free' && user.worksheets_used_this_month >= 5) {
        return handleCORS(NextResponse.json(
          { error: "Monthly limit reached. Please upgrade to Premium." },
          { status: 403 }
        ))
      }

      const body = await request.json()
      const { topic, grade, subject, difficulty, questionCount } = body

      if (!topic || !grade || !subject || !difficulty) {
        return handleCORS(NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 }
        ))
      }

      // Generate with OpenAI
      const systemPrompt = getSystemPrompt(grade, subject, difficulty)
      const userPrompt = `Create a worksheet with ${questionCount || 10} questions about: ${topic}\n\nMake it engaging and appropriate for ${grade}. Klasse students in Switzerland.`

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      })

      const worksheetContent = JSON.parse(completion.choices[0].message.content)

      // Save worksheet
      const worksheet = {
        id: uuidv4(),
        user_id: user.id,
        title: worksheetContent.title,
        topic,
        grade,
        subject,
        difficulty,
        question_count: questionCount || 10,
        content: worksheetContent,
        created_at: new Date()
      }

      await db.collection('worksheets').insertOne(worksheet)

      // Update usage count
      await db.collection('users').updateOne(
        { id: user.id },
        { $inc: { worksheets_used_this_month: 1 } }
      )

      return handleCORS(NextResponse.json(worksheet))
    }

    // STREAMING Generate worksheet - POST /api/generate-worksheet-stream
    if (route === '/generate-worksheet-stream' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      const user = await db.collection('users').findOne({ id: decoded.userId })
      
      // Check usage limits
      if (user.subscription_tier === 'free' && user.worksheets_used_this_month >= 5) {
        return handleCORS(NextResponse.json(
          { error: "Monthly limit reached. Please upgrade to Premium." },
          { status: 403 }
        ))
      }

      const body = await request.json()
      const { topic, grade, subject, difficulty, questionCount, questionTypes, resourceType } = body

      if (!topic || !grade || !subject || !difficulty) {
        return handleCORS(NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 }
        ))
      }

      // Create a streaming response
      const encoder = new TextEncoder()
      const stream = new ReadableStream({
        async start(controller) {
          try {
            // Send initial status
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'status',
              message: 'Analysiere Thema...',
              progress: 10
            })}\n\n`))

            await new Promise(resolve => setTimeout(resolve, 500))

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'status',
              message: 'Lehrplan 21 wird konsultiert...',
              progress: 20
            })}\n\n`))

            await new Promise(resolve => setTimeout(resolve, 500))

            controller.enqueue(encoder.encode(`data: ${JSON.stringify({
              type: 'status',
              message: 'KI generiert Fragen...',
              progress: 30
            })}\n\n`))

            // Build question type instructions
            const questionTypeMap = {
              multiple_choice: 'Multiple-Choice-Frage (4 Optionen A-D, eine richtig)',
              true_false: 'Wahr-oder-Falsch-Frage (Aussage bewerten)',
              open: 'Offene Frage (Freitext-Antwort)',
              math: 'Rechenfrage (mathematische Aufgabe)',
              image: 'Bilderfrage (Bild beschreiben oder zuordnen)',
              matching: 'Zuordnungsfrage (Begriffe zuordnen)',
              fill_blank: 'Lückentext-Frage (fehlende Wörter ergänzen)',
              ordering: 'Reihenfolge-Frage (Elemente ordnen)',
              either_or: 'Entweder-Oder-Frage (zwischen zwei Optionen wählen)',
            }
            let questionTypeInstruction = ''
            if (questionTypes && questionTypes.length > 0) {
              const typeNames = questionTypes.map(t => questionTypeMap[t] || t).join(', ')
              questionTypeInstruction = `\n\nWICHTIG: Verwende NUR diese Fragetypen: ${typeNames}. Mische die Typen abwechslungsreich. Gib bei jeder Frage den Typ als "type" Feld an.`
            } else {
              questionTypeInstruction = '\n\nMische verschiedene Fragetypen für Abwechslung: Multiple Choice, offene Fragen, Wahr/Falsch, Lückentext etc. Gib bei jeder Frage den Typ als "type" Feld an (z.B. "multiple_choice", "open", "true_false", "fill_blank").'
            }

            const materialType = resourceType === 'exam' ? 'eine formale Prüfung' : resourceType === 'quiz' ? 'ein Quiz' : resourceType === 'vocabulary' ? 'eine Wortschatzübung' : 'ein Arbeitsblatt'

            // Stream from OpenAI
            const systemPrompt = getSystemPrompt(grade, subject, difficulty)
            const pointsInstruction = resourceType === 'exam'
              ? 'Dies ist eine formale Prüfung. Vergib sinnvolle Punkte pro Aufgabe: einfache Fragen 1P, mittlere 2P, komplexe 3P. Berechne total_points als Summe. Das Format muss professionell und prüfungstauglich sein.'
              : 'Setze "points" bei jeder Frage auf 1 (Arbeitsblätter zeigen keine Punkte an). Setze total_points auf die Anzahl Fragen.'

            const userPrompt = `Erstelle ${materialType} mit ${questionCount || 10} Fragen zum Thema: ${topic}\n\nDas Material ist für die ${grade}. Klasse in der Schweiz. Formuliere die Fragen klar, abwechslungsreich und didaktisch sinnvoll. Die Sprache soll natürlich klingen, nicht wie ein KI-Generator.${questionTypeInstruction}\n\n${pointsInstruction}`

            const stream = await openai.chat.completions.create({
              model: "gpt-4o-mini",
              messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
              ],
              temperature: 0.7,
              response_format: { type: "json_object" },
              stream: true
            })

            let fullContent = ''
            let currentQuestionCount = 0

            for await (const chunk of stream) {
              const content = chunk.choices[0]?.delta?.content || ''
              fullContent += content

              // Try to parse partial JSON to extract questions
              try {
                // Look for complete question objects in the stream
                const questionMatches = fullContent.match(/"question":\s*"([^"]+)"/g)
                if (questionMatches && questionMatches.length > currentQuestionCount) {
                  currentQuestionCount = questionMatches.length
                  const lastQuestion = questionMatches[questionMatches.length - 1]
                    .replace(/"question":\s*"/, '')
                    .replace(/"$/, '')
                  
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                    type: 'question', 
                    question: lastQuestion,
                    number: currentQuestionCount,
                    progress: 30 + (currentQuestionCount * 5)
                  })}\n\n`))
                }
              } catch (e) {
                // Ignore partial parsing errors
              }
            }

            // Parse final content
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'status', 
              message: 'Lösungen werden erstellt...', 
              progress: 85 
            })}\n\n`))

            await new Promise(resolve => setTimeout(resolve, 800))

            const worksheetContent = JSON.parse(fullContent)

            // Save worksheet
            const worksheet = {
              id: uuidv4(),
              user_id: user.id,
              title: worksheetContent.title,
              topic,
              grade,
              subject,
              difficulty,
              resourceType: resourceType || 'worksheet',
              question_count: questionCount || 10,
              content: { ...worksheetContent, resourceType: resourceType || 'worksheet' },
              created_at: new Date()
            }

            await db.collection('worksheets').insertOne(worksheet)

            // Update usage count
            await db.collection('users').updateOne(
              { id: user.id },
              { $inc: { worksheets_used_this_month: 1 } }
            )

            // Send completion
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'complete', 
              worksheet,
              progress: 100 
            })}\n\n`))

            controller.close()
          } catch (error) {
            console.error('Streaming error:', error)
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
              type: 'error', 
              message: error.message 
            })}\n\n`))
            controller.close()
          }
        }
      })

      const response = new NextResponse(stream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        }
      })

      return handleCORS(response)
    }

    // Get user's worksheets - GET /api/worksheets
    if (route === '/worksheets' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      const worksheets = await db.collection('worksheets')
        .find({ user_id: decoded.userId })
        .sort({ created_at: -1 })
        .limit(100)
        .toArray()

      const cleanedWorksheets = worksheets.map(({ _id, ...rest }) => rest)
      return handleCORS(NextResponse.json(cleanedWorksheets))
    }

    // Get single worksheet - GET /api/worksheets/:id
    if (route.startsWith('/worksheets/') && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      const worksheetId = path[1]
      const worksheet = await db.collection('worksheets').findOne({ 
        id: worksheetId,
        user_id: decoded.userId 
      })

      if (!worksheet) {
        return handleCORS(NextResponse.json(
          { error: "Worksheet not found" },
          { status: 404 }
        ))
      }

      const { _id, ...cleanedWorksheet } = worksheet
      return handleCORS(NextResponse.json(cleanedWorksheet))
    }

    // Delete worksheet - DELETE /api/worksheets/:id
    if (route.startsWith('/worksheets/') && method === 'DELETE') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      const worksheetId = path[1]
      const result = await db.collection('worksheets').deleteOne({ 
        id: worksheetId,
        user_id: decoded.userId 
      })

      if (result.deletedCount === 0) {
        return handleCORS(NextResponse.json(
          { error: "Worksheet not found" },
          { status: 404 }
        ))
      }

      return handleCORS(NextResponse.json({ success: true }))
    }

    // Regenerate worksheet with different difficulty - POST /api/regenerate-worksheet
    if (route === '/regenerate-worksheet' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      const body = await request.json()
      const { worksheetId, newDifficulty } = body

      // Get original worksheet
      const original = await db.collection('worksheets').findOne({ 
        id: worksheetId,
        user_id: decoded.userId 
      })

      if (!original) {
        return handleCORS(NextResponse.json(
          { error: "Worksheet not found" },
          { status: 404 }
        ))
      }

      // Generate new version
      const systemPrompt = getSystemPrompt(original.grade, original.subject, newDifficulty)
      const userPrompt = `Create a worksheet with ${original.question_count} questions about: ${original.topic}\n\nMake it engaging and appropriate for ${original.grade}. Klasse students in Switzerland.`

      const completion = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt }
        ],
        temperature: 0.7,
        response_format: { type: "json_object" }
      })

      const worksheetContent = JSON.parse(completion.choices[0].message.content)

      // Save new worksheet
      const worksheet = {
        id: uuidv4(),
        user_id: decoded.userId,
        title: worksheetContent.title,
        topic: original.topic,
        grade: original.grade,
        subject: original.subject,
        difficulty: newDifficulty,
        question_count: original.question_count,
        content: worksheetContent,
        created_at: new Date(),
        regenerated_from: worksheetId
      }

      await db.collection('worksheets').insertOne(worksheet)

      return handleCORS(NextResponse.json(worksheet))
    }

    // ========== SUBSCRIPTION MANAGEMENT ==========

    // Upgrade to premium (MOCK - Stripe integration placeholder)
    if (route === '/subscribe/premium' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      // Mock payment success
      await db.collection('users').updateOne(
        { id: decoded.userId },
        { $set: { subscription_tier: 'premium' } }
      )

      return handleCORS(NextResponse.json({ 
        success: true, 
        message: "Upgraded to Premium! (Mock payment - Stripe integration coming soon)" 
      }))
    }

    // ========== FILE ANALYSIS ==========

    // Analyze uploaded file - POST /api/analyze-upload
    if (route === '/analyze-upload' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      }

      try {
        const formData = await request.formData()
        const file = formData.get('file')
        const instructions = formData.get('instructions') || ''

        if (!file) {
          return handleCORS(NextResponse.json({ error: "No file provided" }, { status: 400 }))
        }

        const fileName = file.name || 'unknown'
        const fileType = file.type || ''
        const fileSize = file.size || 0

        // Read file content
        const buffer = Buffer.from(await file.arrayBuffer())

        let analysisPrompt = ''
        let messages = []

        if (fileType.startsWith('image/') || fileType === 'application/pdf') {
          // Use Vision API for images and PDFs
          const base64 = buffer.toString('base64')
          const mediaType = fileType.startsWith('image/') ? fileType : 'image/png'

          messages = [
            {
              role: 'system',
              content: `Du bist ein erfahrener Schweizer Lehrperson-Assistent. Analysiere das hochgeladene Dokument/Bild und extrahiere den Lehrinhalt daraus.

Antworte als JSON:
{
  "title": "Erkannter Titel oder Thema",
  "subject": "Erkanntes Fach (Deutsch/Mathematik/NMG/Englisch/Französisch/etc.)",
  "grade_suggestion": "Empfohlene Klassenstufe (1-9)",
  "content_summary": "Kurze Zusammenfassung des Inhalts (2-3 Sätze)",
  "key_topics": ["Thema 1", "Thema 2", "Thema 3"],
  "suggested_questions": ["Mögliche Frage 1", "Mögliche Frage 2", "Mögliche Frage 3"],
  "difficulty_suggestion": "easy/medium/hard",
  "material_type_suggestion": "worksheet/exam/quiz/vocabulary"
}${instructions ? `\n\nZusätzliche Anweisungen: ${instructions}` : ''}`
            },
            {
              role: 'user',
              content: [
                { type: 'text', text: `Analysiere dieses Dokument: "${fileName}" (${(fileSize/1024).toFixed(0)} KB)` },
                { type: 'image_url', image_url: { url: `data:${mediaType};base64,${base64}` } }
              ]
            }
          ]
        } else {
          // For text-based files (txt, docx content, csv etc.), extract text and send to GPT
          let textContent = ''

          if (fileType === 'text/plain' || fileName.endsWith('.txt') || fileName.endsWith('.csv')) {
            textContent = buffer.toString('utf-8').substring(0, 8000)
          } else if (fileName.endsWith('.rtf')) {
            textContent = buffer.toString('utf-8').replace(/\\[a-z]+\d*\s?/g, '').replace(/[{}]/g, '').substring(0, 8000)
          } else {
            // For binary files (docx, pptx, xlsx, audio, video), extract what we can
            textContent = `[Binärdatei: ${fileName}, Typ: ${fileType}, Grösse: ${(fileSize/1024).toFixed(0)} KB. Textextraktion nicht möglich – bitte beschreiben Sie den gewünschten Inhalt in den Anweisungen.]`
          }

          messages = [
            {
              role: 'system',
              content: `Du bist ein erfahrener Schweizer Lehrperson-Assistent. Analysiere den folgenden Textinhalt eines hochgeladenen Dokuments und extrahiere den Lehrinhalt daraus.

Antworte als JSON:
{
  "title": "Erkannter Titel oder Thema",
  "subject": "Erkanntes Fach",
  "grade_suggestion": "Empfohlene Klassenstufe (1-9)",
  "content_summary": "Kurze Zusammenfassung des Inhalts (2-3 Sätze)",
  "key_topics": ["Thema 1", "Thema 2", "Thema 3"],
  "suggested_questions": ["Mögliche Frage 1", "Mögliche Frage 2", "Mögliche Frage 3"],
  "difficulty_suggestion": "easy/medium/hard",
  "material_type_suggestion": "worksheet/exam/quiz/vocabulary"
}${instructions ? `\n\nZusätzliche Anweisungen: ${instructions}` : ''}`
            },
            {
              role: 'user',
              content: `Datei: "${fileName}" (${fileType}, ${(fileSize/1024).toFixed(0)} KB)\n\nInhalt:\n${textContent}`
            }
          ]
        }

        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.5,
          response_format: { type: 'json_object' },
          max_tokens: 1000,
        })

        const analysis = JSON.parse(completion.choices[0].message.content)
        return handleCORS(NextResponse.json({ analysis }))
      } catch (analyzeError) {
        console.error('File analysis error:', analyzeError)
        return handleCORS(NextResponse.json({
          error: 'Analyse fehlgeschlagen.',
          analysis: {
            title: 'Hochgeladenes Material',
            subject: 'Allgemein',
            grade_suggestion: '5',
            content_summary: 'Die Datei konnte nicht vollständig analysiert werden. Bitte geben Sie das Thema manuell ein.',
            key_topics: [],
            suggested_questions: [],
            difficulty_suggestion: 'medium',
            material_type_suggestion: 'worksheet'
          }
        }))
      }
    }

    // ========== AI CHAT ASSISTANT ==========

    // Chat - POST /api/chat
    if (route === '/chat' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      }

      const body = await request.json()
      const { message, worksheetContext, chatHistory = [] } = body

      if (!message) {
        return handleCORS(NextResponse.json({ error: "Message is required" }, { status: 400 }))
      }

      const wsContext = worksheetContext
        ? `\n\nAktuelles Material: "${worksheetContext.title}" (${worksheetContext.subject}, ${worksheetContext.grade}. Klasse, ${worksheetContext.difficulty})\nAnzahl Fragen: ${worksheetContext.questionCount}\nFragetypen: ${worksheetContext.questionTypes || 'gemischt'}`
        : ''

      const systemMsg = `Du bist der EduFlow-Assistent – ein freundlicher, kompetenter pädagogischer Helfer für Schweizer Lehrpersonen. Du sprichst Schweizer Hochdeutsch (nicht Dialekt, aber natürlich).

Deine Persönlichkeit:
- Motivierend und warmherzig, aber professionell
- Kompetent in Didaktik und Lehrplan 21
- Gibt konkrete, umsetzbare Tipps
- Schlägt aktiv Verbesserungen vor
- Nutzt gelegentlich passende Emojis (sparsam)
- Antworte IMMER auf Deutsch

Du kannst helfen bei:
- Fragen erstellen, bearbeiten, vereinfachen, erschweren
- Fragetypen umwandeln (MC ↔ offen ↔ Lückentext etc.)
- Differenzierung (leichter/schwieriger)
- Lehrplan-21-Bezug herstellen
- Material exportieren und formatieren
- Didaktische Tipps geben
- Aufgaben kindgerechter formulieren

WICHTIG: Halte deine Antworten kurz und hilfreich (max. 3-4 Sätze). Biete am Ende immer 1-2 konkrete nächste Schritte an.${wsContext}`

      const messages = [
        { role: 'system', content: systemMsg },
        ...chatHistory.slice(-10).map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: message }
      ]

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages,
          temperature: 0.8,
          max_tokens: 500,
        })

        const reply = completion.choices[0].message.content
        return handleCORS(NextResponse.json({ reply }))
      } catch (aiError) {
        console.error('Chat AI error:', aiError)
        return handleCORS(NextResponse.json({ error: 'KI-Fehler. Bitte versuchen Sie es erneut.' }, { status: 500 }))
      }
    }

    // ========== AI QUESTION ACTIONS ==========

    // KI Action on question - POST /api/ki-action
    if (route === '/ki-action' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      }

      const body = await request.json()
      const { question, actionId, worksheetContext } = body

      if (!question || !actionId) {
        return handleCORS(NextResponse.json({ error: "Question and actionId are required" }, { status: 400 }))
      }

      const actionPrompts = {
        harder: 'Mache diese Frage deutlich anspruchsvoller. Erhöhe die kognitive Anforderung (Analyse/Synthese statt Wissen). Behalte den Fragetyp bei.',
        easier: 'Vereinfache diese Frage deutlich. Reduziere die Komplexität, verwende einfachere Sprache, mache sie für schwächere Schüler zugänglich. Behalte den Fragetyp bei.',
        to_mc: 'Wandle diese Frage in eine Multiple-Choice-Frage um. Erstelle 4 Optionen (A-D), eine davon korrekt. Die Falschantworten sollen plausibel sein.',
        to_open: 'Wandle diese Frage in eine offene Frage um. Entferne alle Optionen. Die Frage soll eine ausführliche Textantwort erfordern.',
        more_options: 'Füge 2 weitere plausible Antwortoptionen hinzu. Die neuen Optionen sollen gute Distraktoren sein.',
        better_distractors: 'Verbessere die falschen Antwortoptionen. Sie sollen plausibler und didaktisch wertvoller sein (typische Fehlvorstellungen der Schüler).',
        precise_answer: 'Formuliere die Lösung präziser und vollständiger. Ergänze bei Bedarf einen kurzen Lösungsweg.',
        child_friendly: 'Formuliere die Frage kindgerechter. Einfachere Sprache, kürzere Sätze, konkrete Beispiele aus dem Alltag der Kinder.',
        swiss_context: 'Passe die Frage an den Schweizer Schulkontext an. Verwende Schweizer Beispiele, Orte, Kultur, CHF statt EUR etc.',
        more_variety: 'Schreibe die Frage komplett um – anderer Blickwinkel, andere Formulierung, aber gleiches Thema und gleiche Schwierigkeit.',
      }

      const actionPrompt = actionPrompts[actionId] || 'Verbessere diese Frage.'

      const systemMsg = `Du bist ein erfahrener Schweizer Primarlehrer-Assistent. Du bearbeitest eine einzelne Frage.

WICHTIG: Antworte NUR mit einem JSON-Objekt. Kein Text davor oder danach.

Das JSON muss genau diese Struktur haben:
{
  "question": "Neuer Fragetext",
  "type": "question_type",
  "options": ["A) ...", "B) ...", "C) ...", "D) ..."],
  "answer": "Korrekte Antwort",
  "points": 1
}

- "options" nur bei multiple_choice, true_false, either_or (bei anderen Typen weglassen)
- "type" muss einer von: multiple_choice, true_false, open, math, image, matching, fill_blank, ordering, either_or sein
- Bei matching: answer = "links1→rechts1, links2→rechts2"
- Bei ordering: answer = "element1, element2, element3" (korrekte Reihenfolge)
- Bei fill_blank: Lücken im question mit ___ markieren, answer = "wort1, wort2"`

      const userMsg = `Aktuelle Frage:
${JSON.stringify(question, null, 2)}

${worksheetContext ? `Kontext: ${worksheetContext.subject}, ${worksheetContext.grade}. Klasse, ${worksheetContext.difficulty}` : ''}

Aktion: ${actionPrompt}`

      try {
        const completion = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: systemMsg },
            { role: 'user', content: userMsg }
          ],
          temperature: 0.7,
          response_format: { type: 'json_object' },
        })

        const updatedQuestion = JSON.parse(completion.choices[0].message.content)
        return handleCORS(NextResponse.json({ question: updatedQuestion }))
      } catch (aiError) {
        console.error('KI Action error:', aiError)
        return handleCORS(NextResponse.json({ error: 'KI-Aktion fehlgeschlagen.' }, { status: 500 }))
      }
    }

    // Update worksheet - PUT /api/worksheets/:id
    if (route.startsWith('/worksheets/') && method === 'PUT') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        ))
      }

      const worksheetId = path[1]
      const body = await request.json()
      const { content, title, status: wsStatus } = body

      const updateFields = {}
      if (content) updateFields.content = content
      if (title) updateFields.title = title
      if (wsStatus) updateFields.status = wsStatus
      updateFields.updated_at = new Date()

      const result = await db.collection('worksheets').updateOne(
        { id: worksheetId, user_id: decoded.userId },
        { $set: updateFields }
      )

      if (result.matchedCount === 0) {
        return handleCORS(NextResponse.json(
          { error: "Worksheet not found" },
          { status: 404 }
        ))
      }

      const updated = await db.collection('worksheets').findOne({ id: worksheetId })
      const { _id, ...cleanedWorksheet } = updated
      return handleCORS(NextResponse.json(cleanedWorksheet))
    }

    // ========== AI IMAGE GENERATION ==========

    // Generate image - POST /api/generate-image
    if (route === '/generate-image' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) {
        return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      }

      const body = await request.json()
      const { prompt, style = 'educational', size = '1024x1024' } = body

      if (!prompt) {
        return handleCORS(NextResponse.json({ error: "Prompt is required" }, { status: 400 }))
      }

      try {
        const styleMap = {
          educational: 'clean educational illustration, professional, suitable for classroom materials, clear and well-organized',
          cartoon: 'colorful cartoon illustration, child-friendly, bright colors, fun and engaging for children',
          realistic: 'realistic photograph style, clear and simple, high quality',
          diagram: 'clean educational diagram, labeled, simple lines, scientific illustration style',
          'line-art': 'black and white line art drawing, clean outlines, no shading, simple and clear, suitable for coloring',
          'schwarz-weiss': 'black and white illustration, high contrast, print-friendly, clear shapes, no gradients',
          kindgerecht: 'simple child-friendly illustration, cute style, large shapes, bright primary colors, suitable for ages 6-10',
          druckfreundlich: 'print-friendly illustration, clean lines, limited colors, clear shapes, works well when printed on paper'
        }
        const styleDesc = styleMap[style] || styleMap.educational
        const enhancedPrompt = `Educational illustration for Swiss school classroom: ${prompt}. Style: ${styleDesc}. No text or words in the image. The image should be pedagogically useful, clear, and age-appropriate.`

        const response = await openai.images.generate({
          model: 'dall-e-3',
          prompt: enhancedPrompt,
          n: 1,
          size: size,
          quality: 'standard',
        })

        const imageUrl = response.data[0]?.url
        if (!imageUrl) {
          return handleCORS(NextResponse.json({ error: 'Bildgenerierung fehlgeschlagen' }, { status: 500 }))
        }

        return handleCORS(NextResponse.json({ imageUrl, revisedPrompt: response.data[0]?.revised_prompt }))
      } catch (imgError) {
        console.error('Image generation error:', imgError)
        return handleCORS(NextResponse.json({ error: imgError.message || 'Bildgenerierung fehlgeschlagen' }, { status: 500 }))
      }
    }

    // ========== STUDENT MODE (Schüler-Modus) ==========

    // ========== CLASS MANAGEMENT ==========

    // Create/update class - POST /api/classes
    if (route === '/classes' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { name, students } = body
      if (!name) return handleCORS(NextResponse.json({ error: "Klassenname erforderlich" }, { status: 400 }))
      const existingClass = await db.collection('classes').findOne({ name, teacher_id: decoded.userId })
      if (existingClass) {
        await db.collection('classes').updateOne({ id: existingClass.id }, { $set: { students: students || existingClass.students, updated_at: new Date() } })
        return handleCORS(NextResponse.json({ ...existingClass, students: students || existingClass.students }))
      }
      const newClass = {
        id: uuidv4(),
        name,
        teacher_id: decoded.userId,
        students: students || [],
        created_at: new Date(),
        updated_at: new Date()
      }
      await db.collection('classes').insertOne(newClass)
      return handleCORS(NextResponse.json(newClass))
    }

    // Get teacher's classes - GET /api/classes
    if (route === '/classes' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const classes = await db.collection('classes').find({ teacher_id: decoded.userId }).sort({ name: 1 }).toArray()
      const cleaned = classes.map(({ _id, ...c }) => c)
      return handleCORS(NextResponse.json(cleaned))
    }

    // Delete class - DELETE /api/classes/:id
    if (route.match(/^\/classes\/[^/]+$/) && method === 'DELETE') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const classId = path[1]
      await db.collection('classes').deleteOne({ id: classId, teacher_id: decoded.userId })
      return handleCORS(NextResponse.json({ success: true }))
    }

    // Share worksheet as assignment - POST /api/assignments/share
    if (route === '/assignments/share' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { worksheetId, className, deadline, status: assignmentStatus, studentNames } = body
      if (!worksheetId) return handleCORS(NextResponse.json({ error: "Material-ID erforderlich" }, { status: 400 }))
      const worksheet = await db.collection('worksheets').findOne({ id: worksheetId })
      if (!worksheet) return handleCORS(NextResponse.json({ error: "Material nicht gefunden" }, { status: 404 }))
      const code = Math.random().toString(36).substring(2, 8).toUpperCase()
      const assignment = {
        id: uuidv4(),
        code,
        worksheet_id: worksheetId,
        worksheet_title: worksheet.title || 'Unbenannt',
        teacher_id: decoded.userId,
        class_name: className || '',
        student_names: studentNames || [],
        deadline: deadline || null,
        created_at: new Date(),
        status: assignmentStatus || 'active',
        access_url: `/schueler?code=${code}`
      }
      await db.collection('assignments').insertOne(assignment)
      return handleCORS(NextResponse.json({ code, assignmentId: assignment.id, accessUrl: assignment.access_url }))
    }

    // Get assignment by code (student access, no auth needed) - GET /api/student/assignment/:code
    if (route.startsWith('/student/assignment/') && method === 'GET') {
      const code = path[2]
      const assignment = await db.collection('assignments').findOne({ code, status: 'active' })
      if (!assignment) return handleCORS(NextResponse.json({ error: 'Aufgabe nicht gefunden oder nicht mehr aktiv.' }, { status: 404 }))
      if (assignment.deadline && new Date(assignment.deadline) < new Date()) {
        return handleCORS(NextResponse.json({ error: 'Die Abgabefrist ist abgelaufen.' }, { status: 410 }))
      }
      const worksheet = await db.collection('worksheets').findOne({ id: assignment.worksheet_id })
      if (!worksheet) return handleCORS(NextResponse.json({ error: 'Material nicht gefunden.' }, { status: 404 }))
      // Return worksheet without answers for student view
      const studentContent = {
        ...worksheet.content,
        questions: (worksheet.content?.questions || []).map(q => ({
          number: q.number, type: q.type, question: q.question,
          options: q.options, points: q.points, imageUrl: q.imageUrl,
          // Don't send answer to students
        }))
      }
      return handleCORS(NextResponse.json({
        title: worksheet.title, subject: worksheet.subject, grade: worksheet.grade,
        content: studentContent, assignmentId: assignment.id, className: assignment.class_name
      }))
    }

    // Submit student answers - POST /api/student/submit
    if (route === '/student/submit' && method === 'POST') {
      const body = await request.json()
      const { assignmentCode, studentName, answers, duration } = body
      const assignment = await db.collection('assignments').findOne({ code: assignmentCode, status: 'active' })
      if (!assignment) return handleCORS(NextResponse.json({ error: 'Aufgabe nicht gefunden.' }, { status: 404 }))
      const worksheet = await db.collection('worksheets').findOne({ id: assignment.worksheet_id })
      if (!worksheet) return handleCORS(NextResponse.json({ error: 'Material nicht gefunden.' }, { status: 404 }))

      // Auto-grade where possible
      const questions = worksheet.content?.questions || []
      let correctCount = 0
      const questionResults = questions.map((q, i) => {
        const studentAnswer = answers[i]
        let isCorrect = null
        if (['multiple_choice', 'true_false', 'either_or'].includes(q.type)) {
          isCorrect = studentAnswer === q.answer
          if (isCorrect) correctCount++
        } else if (q.type === 'math') {
          const cleanStudent = String(studentAnswer || '').trim().replace(/\s/g, '')
          const cleanAnswer = String(q.answer || '').trim().replace(/\s/g, '')
          isCorrect = cleanStudent === cleanAnswer
          if (isCorrect) correctCount++
        } else if (q.type === 'fill_blank') {
          const correctWords = (q.answer || '').split(',').map(w => w.trim().toLowerCase())
          const studentWords = (studentAnswer || []).map(w => (w || '').trim().toLowerCase())
          isCorrect = correctWords.every((w, wi) => studentWords[wi] === w)
          if (isCorrect) correctCount++
        }
        return { questionNumber: q.number, type: q.type, studentAnswer, correctAnswer: q.answer, isCorrect }
      })

      const submission = {
        id: uuidv4(),
        assignment_id: assignment.id,
        student_name: studentName,
        answers,
        question_results: questionResults,
        correct_count: correctCount,
        total_questions: questions.length,
        score_percentage: questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0,
        duration,
        submitted_at: new Date()
      }
      await db.collection('submissions').insertOne(submission)
      return handleCORS(NextResponse.json({ correctCount, totalQuestions: questions.length, duration, submissionId: submission.id }))
    }

    // Get submissions for an assignment (teacher view) - GET /api/assignments/:id/submissions
    if (route.match(/^\/assignments\/[^/]+\/submissions$/) && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const assignmentId = path[1]
      const assignment = await db.collection('assignments').findOne({ id: assignmentId, teacher_id: decoded.userId })
      if (!assignment) return handleCORS(NextResponse.json({ error: 'Aufgabe nicht gefunden.' }, { status: 404 }))
      const submissions = await db.collection('submissions').find({ assignment_id: assignmentId }).sort({ submitted_at: -1 }).toArray()
      const cleaned = submissions.map(({ _id, ...s }) => s)
      return handleCORS(NextResponse.json({ assignment: { ...assignment, _id: undefined }, submissions: cleaned }))
    }

    // Get teacher's assignments - GET /api/assignments
    if (route === '/assignments' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const assignments = await db.collection('assignments').find({ teacher_id: decoded.userId }).sort({ created_at: -1 }).toArray()
      // Enrich with worksheet titles and submission counts
      const enriched = await Promise.all(assignments.map(async (a) => {
        const { _id, ...clean } = a
        if (!clean.worksheet_title) {
          const ws = await db.collection('worksheets').findOne({ id: clean.worksheet_id })
          clean.worksheet_title = ws?.title || 'Unbenannt'
        }
        const subCount = await db.collection('submissions').countDocuments({ assignment_id: clean.id })
        clean.submission_count = subCount
        return clean
      }))
      return handleCORS(NextResponse.json(enriched))
    }

    // Update assignment status - PUT /api/assignments/:id
    if (route.match(/^\/assignments\/[^/]+$/) && method === 'PUT') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const assignmentId = path[1]
      const body = await request.json()
      const { status: newStatus, deadline } = body
      const updateFields = { updated_at: new Date() }
      if (newStatus) updateFields.status = newStatus
      if (deadline !== undefined) updateFields.deadline = deadline
      await db.collection('assignments').updateOne(
        { id: assignmentId, teacher_id: decoded.userId },
        { $set: updateFields }
      )
      const updated = await db.collection('assignments').findOne({ id: assignmentId })
      return handleCORS(NextResponse.json({ ...(updated || {}), _id: undefined }))
    }

    // ========== FEHLERANALYSE (Error Analysis) ==========

    // Analyze submissions for patterns - POST /api/analyze-errors
    if (route === '/analyze-errors' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { assignmentId } = body
      const submissions = await db.collection('submissions').find({ assignment_id: assignmentId }).toArray()
      if (submissions.length === 0) return handleCORS(NextResponse.json({ error: 'Keine Abgaben vorhanden.' }, { status: 404 }))
      const assignment = await db.collection('assignments').findOne({ id: assignmentId })
      const worksheet = await db.collection('worksheets').findOne({ id: assignment?.worksheet_id })

      // Build analysis
      const questions = worksheet?.content?.questions || []
      const questionAnalysis = questions.map((q, qi) => {
        const results = submissions.map(s => s.question_results?.[qi]).filter(Boolean)
        const correctCount = results.filter(r => r.isCorrect === true).length
        const incorrectCount = results.filter(r => r.isCorrect === false).length
        const unanswered = results.filter(r => r.isCorrect === null).length
        const errorRate = results.length > 0 ? Math.round((incorrectCount / results.length) * 100) : 0
        // Collect wrong answers for pattern detection
        const wrongAnswers = results.filter(r => r.isCorrect === false).map(r => r.studentAnswer)
        const answerFrequency = {}
        wrongAnswers.forEach(a => { const key = JSON.stringify(a); answerFrequency[key] = (answerFrequency[key] || 0) + 1 })
        const commonErrors = Object.entries(answerFrequency).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([answer, count]) => ({ answer: JSON.parse(answer), count }))
        return { questionNumber: q.number, question: q.question, type: q.type, correctCount, incorrectCount, unanswered, errorRate, commonErrors, totalResponses: results.length }
      })

      // AI-powered analysis
      let aiAnalysis = ''
      try {
        const analysisPrompt = `Analysiere die folgenden Prüfungsergebnisse einer Schweizer Schulklasse und gib pädagogisch wertvolle Hinweise auf Deutsch:

Prüfung: ${worksheet?.title}
Fach: ${worksheet?.subject}, ${worksheet?.grade}. Klasse
Anzahl Schüler: ${submissions.length}

Fragenanalyse:
${questionAnalysis.map(qa => `- Frage ${qa.questionNumber} (${qa.type}): "${qa.question}" - ${qa.errorRate}% Fehlerquote${qa.commonErrors.length > 0 ? `, häufige falsche Antworten: ${qa.commonErrors.map(e => JSON.stringify(e.answer)).join(', ')}` : ''}`).join('\n')}

Gesamtdurchschnitt: ${submissions.length > 0 ? Math.round(submissions.reduce((s, sub) => s + sub.score_percentage, 0) / submissions.length) : 0}%

Bitte gib:
1. Eine kurze Zusammenfassung der Klassenleistung
2. Identifizierte Lernlücken und Fehlermuster
3. Konkrete Förderhinweise
4. Vorschläge für Wiederholungsübungen`
        const aiRes = await openai.chat.completions.create({
          model: 'gpt-4o-mini',
          messages: [{ role: 'user', content: analysisPrompt }],
          max_tokens: 1000
        })
        aiAnalysis = aiRes.choices[0]?.message?.content || ''
      } catch (e) { console.error('AI analysis error:', e) }

      return handleCORS(NextResponse.json({
        totalSubmissions: submissions.length,
        averageScore: submissions.length > 0 ? Math.round(submissions.reduce((s, sub) => s + sub.score_percentage, 0) / submissions.length) : 0,
        questionAnalysis,
        aiAnalysis,
        classResults: submissions.map(s => ({ name: s.student_name, score: s.score_percentage, duration: s.duration }))
      }))
    }

    // ========== PRÜFUNGSANALYSE (Exam Analysis from Upload) ==========

    // Analyze uploaded exam photo/scan - POST /api/analyze-exam-scan
    if (route === '/analyze-exam-scan' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { imageBase64, worksheetId } = body

      let worksheetContext = ''
      if (worksheetId) {
        const ws = await db.collection('worksheets').findOne({ id: worksheetId })
        if (ws) {
          worksheetContext = `\n\nOriginal-Prüfung: "${ws.title}"\nFragen:\n${(ws.content?.questions || []).map(q => `${q.number}. ${q.question} (Lösung: ${q.answer})`).join('\n')}`
        }
      }

      try {
        const messages = [{
          role: 'user',
          content: [
            { type: 'text', text: `Analysiere dieses Bild einer ausgefüllten Schulprüfung eines Schweizer Schülers. Erkenne die Antworten und bewerte sie.${worksheetContext}\n\nBitte gib zurück:\n1. Erkannte Antworten pro Frage\n2. Bewertung (richtig/falsch/unsicher)\n3. Vorgeschlagene Punktzahl\n4. Bei unsicheren Erkennungen: klar markieren\n\nFormat als JSON: { "answers": [{ "question": 1, "recognized_answer": "...", "correct": true/false/null, "confidence": "high"/"medium"/"low", "points": 1 }], "total_points": 0, "notes": "..." }` },
            { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${imageBase64}` } }
          ]
        }]
        const response = await openai.chat.completions.create({ model: 'gpt-4o-mini', messages, max_tokens: 2000 })
        const content = response.choices[0]?.message?.content || '{}'
        let parsed
        try {
          const jsonMatch = content.match(/\{[\s\S]*\}/)
          parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: content }
        } catch { parsed = { raw: content } }
        return handleCORS(NextResponse.json(parsed))
      } catch (e) {
        console.error('Exam scan error:', e)
        return handleCORS(NextResponse.json({ error: 'Analyse fehlgeschlagen: ' + e.message }, { status: 500 }))
      }
    }

    // ========== COLLABORATION ==========

    // Share worksheet with another user - POST /api/collaborate/share
    if (route === '/collaborate/share' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { worksheetId, email, role = 'view' } = body // role: 'view', 'comment', 'edit'
      const targetUser = await db.collection('users').findOne({ email })
      if (!targetUser) return handleCORS(NextResponse.json({ error: 'Benutzer nicht gefunden.' }, { status: 404 }))
      const share = {
        id: uuidv4(),
        worksheet_id: worksheetId,
        owner_id: decoded.userId,
        shared_with_id: targetUser.id,
        shared_with_email: email,
        role,
        created_at: new Date()
      }
      await db.collection('shares').insertOne(share)
      return handleCORS(NextResponse.json({ message: 'Material geteilt', shareId: share.id }))
    }

    // Get shared worksheets - GET /api/collaborate/shared-with-me
    if (route === '/collaborate/shared-with-me' && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const shares = await db.collection('shares').find({ shared_with_id: decoded.userId }).toArray()
      const worksheetIds = shares.map(s => s.worksheet_id)
      const worksheets = await db.collection('worksheets').find({ id: { $in: worksheetIds } }).toArray()
      const result = shares.map(share => {
        const ws = worksheets.find(w => w.id === share.worksheet_id)
        return { ...share, _id: undefined, worksheet: ws ? { title: ws.title, subject: ws.subject, grade: ws.grade, id: ws.id } : null }
      })
      return handleCORS(NextResponse.json(result))
    }

    // Add comment to worksheet - POST /api/collaborate/comment
    if (route === '/collaborate/comment' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { worksheetId, text, questionIndex } = body
      const user = await db.collection('users').findOne({ id: decoded.userId })
      const comment = {
        id: uuidv4(),
        worksheet_id: worksheetId,
        user_id: decoded.userId,
        user_name: user?.name || 'Unbekannt',
        text,
        question_index: questionIndex ?? null,
        created_at: new Date()
      }
      await db.collection('comments').insertOne(comment)
      return handleCORS(NextResponse.json({ commentId: comment.id }))
    }

    // Get comments for worksheet - GET /api/collaborate/comments/:worksheetId
    if (route.startsWith('/collaborate/comments/') && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const worksheetId = path[2]
      const comments = await db.collection('comments').find({ worksheet_id: worksheetId }).sort({ created_at: -1 }).toArray()
      return handleCORS(NextResponse.json(comments.map(({ _id, ...c }) => c)))
    }

    // Save version - POST /api/collaborate/version
    if (route === '/collaborate/version' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { worksheetId, label } = body
      const worksheet = await db.collection('worksheets').findOne({ id: worksheetId, user_id: decoded.userId })
      if (!worksheet) return handleCORS(NextResponse.json({ error: 'Material nicht gefunden.' }, { status: 404 }))
      const version = {
        id: uuidv4(),
        worksheet_id: worksheetId,
        user_id: decoded.userId,
        label: label || `Version ${new Date().toLocaleString('de-CH')}`,
        content: worksheet.content,
        title: worksheet.title,
        created_at: new Date()
      }
      await db.collection('versions').insertOne(version)
      return handleCORS(NextResponse.json({ versionId: version.id }))
    }

    // Get versions - GET /api/collaborate/versions/:worksheetId
    if (route.startsWith('/collaborate/versions/') && method === 'GET') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const worksheetId = path[2]
      const versions = await db.collection('versions').find({ worksheet_id: worksheetId }).sort({ created_at: -1 }).toArray()
      return handleCORS(NextResponse.json(versions.map(({ _id, ...v }) => v)))
    }

    // Restore version - POST /api/collaborate/restore
    if (route === '/collaborate/restore' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { worksheetId, versionId } = body
      const version = await db.collection('versions').findOne({ id: versionId, worksheet_id: worksheetId })
      if (!version) return handleCORS(NextResponse.json({ error: 'Version nicht gefunden.' }, { status: 404 }))
      await db.collection('worksheets').updateOne(
        { id: worksheetId, user_id: decoded.userId },
        { $set: { content: version.content, title: version.title, updated_at: new Date() } }
      )
      return handleCORS(NextResponse.json({ message: 'Version wiederhergestellt' }))
    }

    // ========== TEXT-TO-SPEECH (Sprachausgabe) ==========

    // Generate speech - POST /api/tts
    if (route === '/tts' && method === 'POST') {
      const decoded = await verifyToken(request)
      if (!decoded) return handleCORS(NextResponse.json({ error: "Unauthorized" }, { status: 401 }))
      const body = await request.json()
      const { text, voice = 'alloy', speed = 1.0 } = body
      if (!text) return handleCORS(NextResponse.json({ error: 'Text ist erforderlich.' }, { status: 400 }))
      try {
        const mp3 = await openai.audio.speech.create({
          model: 'tts-1',
          voice: voice, // alloy, echo, fable, onyx, nova, shimmer
          input: text.substring(0, 4096),
          speed: Math.max(0.25, Math.min(4.0, speed))
        })
        const buffer = Buffer.from(await mp3.arrayBuffer())
        return new Response(buffer, { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': buffer.length.toString(), ...Object.fromEntries(handleCORS(new Response()).headers) } })
      } catch (e) {
        console.error('TTS error:', e)
        return handleCORS(NextResponse.json({ error: 'Sprachgenerierung fehlgeschlagen: ' + e.message }, { status: 500 }))
      }
    }

    // Route not found
    return handleCORS(NextResponse.json(
      { error: `Route ${route} not found` },
      { status: 404 }
    ))

  } catch (error) {
    console.error('API Error:', error)
    return handleCORS(NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    ))
  }
}

// Export all HTTP methods
export const GET = handleRoute
export const POST = handleRoute
export const PUT = handleRoute
export const DELETE = handleRoute
export const PATCH = handleRoute