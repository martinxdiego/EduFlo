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
      const { topic, grade, subject, difficulty, questionCount: requestedQuestionCount } = body

      if (!topic || !grade || !subject || !difficulty) {
        return handleCORS(NextResponse.json(
          { error: "Missing required fields" },
          { status: 400 }
        ))
      }

      const finalQuestionCount = requestedQuestionCount || 10

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

            // Stream from OpenAI
            const systemPrompt = getSystemPrompt(grade, subject, difficulty)
            const userPrompt = `Create a worksheet with ${finalQuestionCount} questions about: ${topic}\n\nMake it engaging and appropriate for ${grade}. Klasse students in Switzerland.`

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
              question_count: finalQuestionCount,
              content: worksheetContent,
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