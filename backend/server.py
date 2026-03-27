from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, UploadFile, File, Form
from fastapi.responses import StreamingResponse, Response
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
import os
import logging
from pathlib import Path
from dotenv import load_dotenv
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
import uuid
import openai
import json
import asyncio
import time
from export_service import export_worksheet_pdf, export_worksheet_docx, export_dossier_pdf
from material_service import MaterialParser, MaterialAnalyzer, MaterialTransformer, ContextualEditor

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# Configure logging FIRST (before it's used)
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# OpenAI client
openai_client = openai.OpenAI(api_key=os.environ.get('OPENAI_API_KEY'))

# JWT settings
JWT_SECRET = os.environ.get('JWT_SECRET', 'teachertime_secret_key_change_in_production')
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_DAYS = 7

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ==================== MODELS ====================

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str

class LoginRequest(BaseModel):
    email: str
    password: str

class WorksheetGenerateRequest(BaseModel):
    topic: str
    grade: str
    subject: str
    difficulty: str
    questionCount: Optional[int] = 10
    mode: Optional[str] = 'worksheet'
    theme: Optional[str] = 'classic'

class RegenerateRequest(BaseModel):
    worksheetId: str
    newDifficulty: str

class QuestionModel(BaseModel):
    id: str
    number: int
    type: str
    question: str
    options: Optional[List[str]] = None
    answer: str
    explanation: Optional[str] = None
    points: Optional[int] = None
    answerLines: Optional[int] = 3

class WorksheetUpdateRequest(BaseModel):
    worksheetId: str
    title: Optional[str] = None
    questions: Optional[List[Dict[str, Any]]] = None
    theme: Optional[str] = None

class ExportRequest(BaseModel):
    worksheetId: str
    format: str  # 'pdf' or 'docx'
    version: str  # 'student' or 'teacher'

class ChatEditRequest(BaseModel):
    message: str
    worksheet_id: str
    worksheet_content: Dict[str, Any]

# ==================== DOSSIER MODELS ====================

class DossierBlock(BaseModel):
    id: str
    type: str  # heading, text, info_box, question, table, image_placeholder, objectives_checklist, glossary, reflection, creative_task, page_break, divider
    content: Dict[str, Any]
    order: int

class DossierSection(BaseModel):
    id: str
    type: str  # title_page, toc, objectives, theory, exercises, source_text, creative, summary, solutions, glossary
    title: str
    order: int
    blocks: List[DossierBlock] = []

class DossierGenerateRequest(BaseModel):
    topic: str
    grade: str
    subject: str
    difficulty: str
    theme: Optional[str] = 'classic'
    competency_codes: Optional[List[str]] = []

class DossierUpdateRequest(BaseModel):
    title: Optional[str] = None
    theme: Optional[str] = None
    sections: Optional[List[Dict[str, Any]]] = None
    competency_codes: Optional[List[str]] = None

class ChatAction(BaseModel):
    type: str  # update_question, add_question, delete_question, replace_question, reorder_questions
    questionId: Optional[str] = None
    questionIndex: Optional[int] = None
    data: Optional[Dict[str, Any]] = None
    newOrder: Optional[List[str]] = None

# ==================== AUTH HELPERS ====================

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, email: str) -> str:
    payload = {
        'userId': user_id,
        'email': email,
        'iat': datetime.now(timezone.utc),
        'exp': datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRATION_DAYS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(token: str):
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except (jwt.ExpiredSignatureError, jwt.InvalidTokenError, Exception):
        return None

async def get_current_user(authorization: Optional[str] = Header(None)):
    if not authorization or not authorization.startswith('Bearer '):
        raise HTTPException(status_code=401, detail="Nicht autorisiert")
    
    token = authorization.split(' ')[1]
    decoded = verify_token(token)
    if not decoded:
        raise HTTPException(status_code=401, detail="Ungültiger Token")
    
    user = await db.users.find_one({'id': decoded['userId']}, {'_id': 0})
    if not user:
        raise HTTPException(status_code=401, detail="Benutzer nicht gefunden")
    
    return user

# ==================== SWISS CURRICULUM PROMPT ====================

def get_system_prompt(grade: str, subject: str, difficulty: str, mode: str = 'worksheet') -> str:
    """Generate the system prompt for worksheet/exam generation"""

    difficulty_descriptions = {
        'easy': """EINFACH — Aber NICHT trivial!
- Grundlegendes Textverständnis und Wiedergabe
- Kurze, klare Sätze, aber trotzdem inhaltlich gehaltvoll
- Fragen, die Wissen abfragen und einfache Zusammenhänge erkennen lassen
- Multiple-Choice-Optionen müssen ALLE plausibel klingen (keine offensichtlich absurden Antworten!)
- Mindestens 2-3 Sätze pro Fragestellung""",
        'medium': """MITTEL — Anwendung und Analyse:
- Schüler müssen Wissen auf neue Situationen übertragen
- Fragen erfordern Begründungen und Erklärungen
- Verknüpfung von mehreren Konzepten
- Mindestens 2-4 Sätze pro Fragestellung, oft mit Kontext oder Szenario
- Multiple-Choice: Alle Optionen müssen realistisch und durchdacht sein""",
        'hard': """SCHWIERIG — Synthese, Bewertung und kritisches Denken:
- Komplexe Szenarien und Fallbeispiele als Basis für Fragen
- Schüler müssen argumentieren, bewerten, vergleichen und Schlüsse ziehen
- Transferaufgaben: Wissen auf unbekannte Situationen anwenden
- Mindestens 3-5 Sätze pro Fragestellung mit reichem Kontext
- Multiple-Choice: Alle Optionen müssen sorgfältig formuliert sein — keine offensichtlich falschen Antworten wie "Astronaut" bei einer Geschichtsfrage!
- Offene Fragen sollen zum Nachdenken anregen und mehrteilige Antworten erfordern"""
    }

    mode_instructions = {
        'worksheet': """Dies ist ein ÜBUNGS-Arbeitsblatt. Die Fragen sollen:
- Zum Nachdenken und Entdecken anregen
- Verschiedene Denkebenen ansprechen (nicht nur Fakten abfragen!)
- Abwechslungsreich und motivierend sein
- Kontext und Szenarien bieten, nicht nur nackte Fragen""",
        'exam': """Dies ist eine BENOTETE Prüfung. Die Fragen sollen:
- Fair und klar formuliert sein
- Verschiedene Kompetenzstufen abdecken (Wissen, Verstehen, Anwenden, Analysieren)
- Eindeutige Bewertungskriterien haben
- Punkteverteilung muss zum Schwierigkeitsgrad passen"""
    }

    points_instruction = '"points": 2,' if mode == 'exam' else ''
    total_points_instruction = '"total_points": sum of all question points,' if mode == 'exam' else ''

    return f"""Du bist ein erfahrener Schweizer Primarschullehrer mit 15 Jahren Berufserfahrung. Du erstellst hochwertige, kreative und pädagogisch durchdachte Unterrichtsmaterialien nach Lehrplan 21.

=== KONTEXT ===
Klassenstufe: {grade}. Klasse (Primarschule Schweiz)
Fach: {subject}
Schwierigkeitsgrad: {difficulty_descriptions.get(difficulty, difficulty_descriptions['medium'])}
Modus: {'Arbeitsblatt (Übung)' if mode == 'worksheet' else 'Prüfung (benotet)'}

{mode_instructions.get(mode, mode_instructions['worksheet'])}

=== QUALITÄTSANFORDERUNGEN (SEHR WICHTIG!) ===

1. **REICHHALTIGE FRAGEN**: Jede Frage muss substanziell sein. KEINE Ein-Satz-Fragen!
   - SCHLECHT: "Was war eine typische Beschäftigung im Mittelalter?"
   - GUT: "Im Mittelalter war die Gesellschaft in verschiedene Stände eingeteilt. Der Adel, die Geistlichen und die Bauern hatten sehr unterschiedliche Aufgaben und Rechte. Erkläre, welche Aufgaben ein Ritter im Mittelalter hatte und warum die Bauern den grössten Teil der Bevölkerung ausmachten."

2. **INTELLIGENTE MULTIPLE-CHOICE-OPTIONEN**: ALLE Antwortmöglichkeiten müssen realistisch und plausibel klingen!
   - SCHLECHT: A) Ritter, B) Astronaut, C) Computerprogrammierer, D) YouTuber
   - GUT: A) Ritter und Burgherren, B) Handwerker in den Zünften, C) Mönche in Klöstern, D) Fahrende Händler und Kaufleute
   - Die falschen Antworten sollen zum Nachdenken anregen, NICHT offensichtlich absurd sein!

3. **KONTEXTREICHE AUFGABENSTELLUNGEN**: Baue Szenarien, Geschichten, Quelltexte oder Situationen in die Fragen ein.
   - Beginne Fragen mit einer kurzen Einleitung, einem Zitat, einer Situation oder einem Beispiel
   - Verwende "Stell dir vor...", "Ein Bauer im Jahr 1350...", "Lies den folgenden Text..."

4. **SCHWEIZER KONTEXT**: Verwende Schweizer Beispiele, Orte, Bräuche und den Schweizer Lehrplan 21.
   - Zürich, Bern, Luzern statt Berlin oder Wien
   - Schweizer Geschichte, Geographie, Kultur wo passend
   - Schweizerdeutsche Begriffe in Klammern wo hilfreich

5. **VIELFÄLTIGE FRAGETYPEN**: Mische verschiedene Typen kreativ:
   - "multiple_choice": Gut durchdachte Optionen (4 Stück), alle plausibel
   - "open": Offene Fragen die zum Argumentieren, Erklären oder Reflektieren einladen (NICHT nur "Nenne zwei Dinge...")
   - "fill_blank": Lückentexte mit zusammenhängendem, informativem Text (markiere Lücken mit ___)
   - "matching": Kreative Zuordnungsaufgaben (Format in answer: "links1→rechts1, links2→rechts2")
   - "ordering": Elemente in richtige Reihenfolge bringen
   - "true_false": Aussagen die zum Nachdenken anregen, nicht offensichtlich richtig/falsch
   - "math": Rechenaufgaben mit Textaufgaben-Kontext (für Mathematik)

6. **ERKLÄRUNGEN FÜR LEHRER**: Jede Frage braucht eine ausführliche Erklärung mit didaktischem Hinweis.

7. **ANTWORTZEILEN**: Setze "answerLines" passend: 2 für kurze Antworten, 4-6 für ausführliche offene Fragen.

=== ANTWORTFORMAT (JSON) ===
{{
  "title": "{subject}: [Kreatives Thema] - {grade}. Klasse",
  "questions": [
    {{
      "id": "q1",
      "number": 1,
      "type": "multiple_choice",
      "question": "Ausführlicher Fragetext mit Kontext und Szenario (mindestens 2-3 Sätze!)",
      "options": ["Plausible Option A", "Plausible Option B", "Plausible Option C", "Plausible Option D"],
      "answer": "Die korrekte Antwort",
      "explanation": "Ausführliche Erklärung für die Lehrperson mit didaktischem Hinweis",
      {points_instruction}
      "answerLines": 3
    }}
  ],
  "teacher_notes": "Ausführliche Hinweise: Lernziele, häufige Fehler, Differenzierungsmöglichkeiten, Bezug zum Lehrplan 21",
  {total_points_instruction}
  "estimated_time": "XX Minuten"
}}

WICHTIG:
- Jede Frage braucht eine eindeutige "id" ("q1", "q2", etc.)
- Schreibe ALLE Texte auf Deutsch (Schweizer Hochdeutsch)
- Qualität vor Quantität: Lieber weniger, dafür richtig gute Fragen!
- KEINE trivialen oder offensichtlich absurden Antwortoptionen!"""

# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register")
async def register(data: RegisterRequest):
    existing = await db.users.find_one({'email': data.email})
    if existing:
        raise HTTPException(status_code=400, detail="E-Mail bereits registriert")
    
    user_id = str(uuid.uuid4())
    hashed_pw = hash_password(data.password)
    
    user = {
        'id': user_id,
        'email': data.email,
        'name': data.name,
        'password': hashed_pw,
        'subscription_tier': 'free',
        'worksheets_used_this_month': 0,
        'created_at': datetime.now(timezone.utc),
        'month_reset_date': datetime.now(timezone.utc)
    }
    
    await db.users.insert_one(user)
    
    user.pop('password')
    user.pop('_id', None)
    
    token = create_token(user_id, data.email)
    
    return {'user': user, 'token': token}

@api_router.post("/auth/login")
async def login(data: LoginRequest):
    user = await db.users.find_one({'email': data.email})
    if not user:
        raise HTTPException(status_code=401, detail="Ungültige Anmeldedaten")
    
    if not verify_password(data.password, user.get('password', '')):
        raise HTTPException(status_code=401, detail="Ungültige Anmeldedaten")
    
    user_id = user.get('id')
    user_response = {
        'id': user_id,
        'email': user['email'],
        'name': user['name'],
        'subscription_tier': user.get('subscription_tier', 'free'),
        'worksheets_used_this_month': user.get('worksheets_used_this_month', 0)
    }
    
    token = create_token(user_id, data.email)
    
    return {'user': user_response, 'token': token}

@api_router.get("/auth/me")
async def get_me(user = Depends(get_current_user)):
    return user

# ==================== WORKSHEET ROUTES ====================

@api_router.post("/generate-worksheet")
async def generate_worksheet(data: WorksheetGenerateRequest, user = Depends(get_current_user)):
    if user['subscription_tier'] == 'free' and user['worksheets_used_this_month'] >= 5:
        raise HTTPException(status_code=403, detail="Monatliches Limit erreicht. Bitte auf Premium upgraden.")
    
    system_prompt = get_system_prompt(data.grade, data.subject, data.difficulty, data.mode)
    user_prompt = f"Erstelle ein {'Arbeitsblatt' if data.mode == 'worksheet' else 'eine Prüfung'} mit {data.questionCount} Fragen zum Thema: {data.topic}\n\nKlassenstufe: {data.grade}. Klasse, Schweiz.\n\nWICHTIG: Die Fragen müssen kreativ, ausführlich und inhaltlich reichhaltig sein. Jede Frage soll mindestens 2-3 Sätze lang sein und einen spannenden Kontext bieten. Bei Multiple-Choice müssen ALLE Optionen realistisch und plausibel klingen — keine offensichtlich absurden Antworten!"
    
    completion = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.7,
        response_format={"type": "json_object"},
        timeout=60.0
    )
    
    worksheet_content = json.loads(completion.choices[0].message.content)
    
    # Ensure all questions have IDs
    for i, q in enumerate(worksheet_content.get('questions', [])):
        if 'id' not in q:
            q['id'] = f"q{i+1}"
        if 'answerLines' not in q:
            q['answerLines'] = 3
    
    worksheet_id = str(uuid.uuid4())
    worksheet = {
        'id': worksheet_id,
        'user_id': user['id'],
        'title': worksheet_content['title'],
        'topic': data.topic,
        'grade': data.grade,
        'subject': data.subject,
        'difficulty': data.difficulty,
        'question_count': data.questionCount,
        'mode': data.mode,
        'theme': data.theme or 'classic',
        'content': worksheet_content,
        'created_at': datetime.now(timezone.utc),
        'updated_at': datetime.now(timezone.utc)
    }

    await db.worksheets.insert_one(worksheet)

    await db.users.update_one(
        {'id': user['id']},
        {'$inc': {'worksheets_used_this_month': 1}}
    )

    worksheet.pop('_id', None)
    return worksheet

@api_router.post("/generate-worksheet-stream")
async def generate_worksheet_stream(data: WorksheetGenerateRequest, user = Depends(get_current_user)):
    if user['subscription_tier'] == 'free' and user['worksheets_used_this_month'] >= 5:
        raise HTTPException(status_code=403, detail="Monatliches Limit erreicht. Bitte auf Premium upgraden.")
    
    logger.info(f"Starting worksheet generation for user {user['id']}: {data.topic} ({data.mode})")
    
    async def stream_generator():
        start_time = time.time()
        
        try:
            yield f"data: {json.dumps({'type': 'status', 'message': 'Analysiere Thema...', 'progress': 10})}\n\n"
            await asyncio.sleep(0.5)
            
            yield f"data: {json.dumps({'type': 'status', 'message': 'Lehrplan 21 wird konsultiert...', 'progress': 20})}\n\n"
            await asyncio.sleep(0.5)
            
            yield f"data: {json.dumps({'type': 'status', 'message': 'KI generiert Fragen...', 'progress': 30})}\n\n"
            
            logger.info(f"Starting OpenAI streaming for {data.topic}")
            
            system_prompt = get_system_prompt(data.grade, data.subject, data.difficulty, data.mode)
            user_prompt = f"Erstelle ein {'Arbeitsblatt' if data.mode == 'worksheet' else 'eine Prüfung'} mit {data.questionCount} Fragen zum Thema: {data.topic}\n\nKlassenstufe: {data.grade}. Klasse, Schweiz.\n\nWICHTIG: Die Fragen müssen kreativ, ausführlich und inhaltlich reichhaltig sein. Jede Frage soll mindestens 2-3 Sätze lang sein und einen spannenden Kontext bieten. Bei Multiple-Choice müssen ALLE Optionen realistisch und plausibel klingen — keine offensichtlich absurden Antworten!"
            
            try:
                stream = openai_client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_prompt}
                    ],
                    temperature=0.7,
                    response_format={"type": "json_object"},
                    stream=True,
                    timeout=90.0
                )
                
                full_content = ''
                question_count = 0
                
                for chunk in stream:
                    content = chunk.choices[0].delta.content or ''
                    full_content += content
                    
                    import re
                    question_matches = re.findall(r'"question":\s*"([^"]+)"', full_content)
                    if len(question_matches) > question_count:
                        question_count = len(question_matches)
                        last_question = question_matches[-1]
                        
                        yield f"data: {json.dumps({'type': 'question', 'question': last_question, 'number': question_count, 'progress': min(30 + (question_count * 5), 80)})}\n\n"
                        await asyncio.sleep(0)
                
                yield f"data: {json.dumps({'type': 'status', 'message': 'Lösungen werden erstellt...', 'progress': 85})}\n\n"
                await asyncio.sleep(0.5)
                
                try:
                    worksheet_content = json.loads(full_content)
                except json.JSONDecodeError as json_err:
                    logger.error(f"JSON parse error: {json_err}")
                    yield f"data: {json.dumps({'type': 'error', 'message': 'Fehler beim Parsen der KI-Antwort'})}\n\n"
                    return
                
            except Exception as openai_error:
                logger.error(f"OpenAI streaming error: {openai_error}", exc_info=True)
                yield f"data: {json.dumps({'type': 'error', 'message': f'OpenAI-Fehler: {str(openai_error)}'})}\n\n"
                return
            
            # Ensure all questions have IDs and answerLines
            for i, q in enumerate(worksheet_content.get('questions', [])):
                if 'id' not in q:
                    q['id'] = f"q{i+1}"
                if 'answerLines' not in q:
                    q['answerLines'] = 3
            
            worksheet_id = str(uuid.uuid4())
            worksheet = {
                'id': worksheet_id,
                'user_id': user['id'],
                'title': worksheet_content['title'],
                'topic': data.topic,
                'grade': data.grade,
                'subject': data.subject,
                'difficulty': data.difficulty,
                'question_count': data.questionCount,
                'mode': data.mode,
                'theme': data.theme or 'classic',
                'content': worksheet_content,
                'created_at': datetime.now(timezone.utc),
                'updated_at': datetime.now(timezone.utc)
            }

            await db.worksheets.insert_one(worksheet)
            
            await db.users.update_one(
                {'id': user['id']},
                {'$inc': {'worksheets_used_this_month': 1}}
            )
            
            worksheet_response = worksheet.copy()
            worksheet_response['created_at'] = worksheet['created_at'].isoformat()
            worksheet_response['updated_at'] = worksheet['updated_at'].isoformat()
            worksheet_response.pop('_id', None)
            
            total_time = time.time() - start_time
            logger.info(f"Worksheet generation complete in {total_time:.2f}s: {worksheet_id}")
            
            yield f"data: {json.dumps({'type': 'complete', 'worksheet': worksheet_response, 'progress': 100})}\n\n"
            
        except Exception as e:
            total_time = time.time() - start_time
            logger.error(f"Streaming error after {total_time:.2f}s: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
    
    return StreamingResponse(stream_generator(), media_type="text/event-stream")

@api_router.get("/worksheets")
async def get_worksheets(user = Depends(get_current_user)):
    worksheets = await db.worksheets.find({'user_id': user['id']}, {'_id': 0}).sort('created_at', -1).to_list(100)
    # Convert datetime objects to ISO strings
    for ws in worksheets:
        if 'created_at' in ws and hasattr(ws['created_at'], 'isoformat'):
            ws['created_at'] = ws['created_at'].isoformat()
        if 'updated_at' in ws and hasattr(ws['updated_at'], 'isoformat'):
            ws['updated_at'] = ws['updated_at'].isoformat()
    return worksheets

@api_router.get("/worksheets/{worksheet_id}")
async def get_worksheet(worksheet_id: str, user = Depends(get_current_user)):
    worksheet = await db.worksheets.find_one({'id': worksheet_id, 'user_id': user['id']}, {'_id': 0})
    if not worksheet:
        raise HTTPException(status_code=404, detail="Arbeitsblatt nicht gefunden")
    if 'created_at' in worksheet and hasattr(worksheet['created_at'], 'isoformat'):
        worksheet['created_at'] = worksheet['created_at'].isoformat()
    if 'updated_at' in worksheet and hasattr(worksheet['updated_at'], 'isoformat'):
        worksheet['updated_at'] = worksheet['updated_at'].isoformat()
    return worksheet

@api_router.delete("/worksheets/{worksheet_id}")
async def delete_worksheet(worksheet_id: str, user = Depends(get_current_user)):
    result = await db.worksheets.delete_one({'id': worksheet_id, 'user_id': user['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Arbeitsblatt nicht gefunden")
    return {'message': 'Gelöscht', 'success': True}

# ==================== WORKSHEET UPDATE ROUTES ====================

@api_router.put("/worksheets/{worksheet_id}")
async def update_worksheet(worksheet_id: str, data: WorksheetUpdateRequest, user = Depends(get_current_user)):
    """Full worksheet update with all questions"""
    logger.info(f"Updating worksheet {worksheet_id} for user {user['id']}")
    
    worksheet = await db.worksheets.find_one({'id': worksheet_id, 'user_id': user['id']})
    if not worksheet:
        raise HTTPException(status_code=404, detail="Arbeitsblatt nicht gefunden")
    
    update_data = {'updated_at': datetime.now(timezone.utc)}
    
    if data.title:
        update_data['title'] = data.title
        update_data['content.title'] = data.title

    if data.theme:
        update_data['theme'] = data.theme

    if data.questions is not None:
        # Ensure all questions have IDs
        for i, q in enumerate(data.questions):
            if 'id' not in q:
                q['id'] = f"q{i+1}"
            if 'answerLines' not in q:
                q['answerLines'] = 3
        update_data['content.questions'] = data.questions
        update_data['question_count'] = len(data.questions)
        
        # Recalculate total points for exam mode
        if worksheet.get('mode') == 'exam':
            total_points = sum(q.get('points', 0) for q in data.questions)
            update_data['content.total_points'] = total_points
    
    await db.worksheets.update_one(
        {'id': worksheet_id},
        {'$set': update_data}
    )
    
    updated = await db.worksheets.find_one({'id': worksheet_id}, {'_id': 0})
    if 'created_at' in updated and hasattr(updated['created_at'], 'isoformat'):
        updated['created_at'] = updated['created_at'].isoformat()
    if 'updated_at' in updated and hasattr(updated['updated_at'], 'isoformat'):
        updated['updated_at'] = updated['updated_at'].isoformat()
    
    logger.info(f"Worksheet {worksheet_id} updated successfully")
    return {'success': True, 'worksheet': updated, 'message': 'Gespeichert'}

@api_router.post("/worksheets/{worksheet_id}/duplicate")
async def duplicate_worksheet(worksheet_id: str, user = Depends(get_current_user)):
    """Duplicate a worksheet"""
    worksheet = await db.worksheets.find_one({'id': worksheet_id, 'user_id': user['id']}, {'_id': 0})
    if not worksheet:
        raise HTTPException(status_code=404, detail="Arbeitsblatt nicht gefunden")
    
    new_id = str(uuid.uuid4())
    new_worksheet = worksheet.copy()
    new_worksheet['id'] = new_id
    new_worksheet['title'] = f"{worksheet['title']} (Kopie)"
    new_worksheet['content']['title'] = new_worksheet['title']
    new_worksheet['created_at'] = datetime.now(timezone.utc)
    new_worksheet['updated_at'] = datetime.now(timezone.utc)
    
    # Generate new question IDs
    for i, q in enumerate(new_worksheet['content'].get('questions', [])):
        q['id'] = f"q{i+1}"
    
    await db.worksheets.insert_one(new_worksheet)
    new_worksheet.pop('_id', None)
    
    if 'created_at' in new_worksheet and hasattr(new_worksheet['created_at'], 'isoformat'):
        new_worksheet['created_at'] = new_worksheet['created_at'].isoformat()
    if 'updated_at' in new_worksheet and hasattr(new_worksheet['updated_at'], 'isoformat'):
        new_worksheet['updated_at'] = new_worksheet['updated_at'].isoformat()
    
    return {'success': True, 'worksheet': new_worksheet}

@api_router.post("/regenerate-worksheet")
async def regenerate_worksheet(data: RegenerateRequest, user = Depends(get_current_user)):
    worksheet = await db.worksheets.find_one({'id': data.worksheetId, 'user_id': user['id']}, {'_id': 0})
    if not worksheet:
        raise HTTPException(status_code=404, detail="Arbeitsblatt nicht gefunden")
    
    mode = worksheet.get('mode', 'worksheet')
    system_prompt = get_system_prompt(worksheet['grade'], worksheet['subject'], data.newDifficulty, mode)
    user_prompt = f"Erstelle ein {'Arbeitsblatt' if mode == 'worksheet' else 'eine Prüfung'} mit {worksheet['question_count']} Fragen zum Thema: {worksheet['topic']}\n\nKlassenstufe: {worksheet['grade']}. Klasse, Schweiz.\n\nWICHTIG: Die Fragen müssen kreativ, ausführlich und inhaltlich reichhaltig sein. Jede Frage soll mindestens 2-3 Sätze lang sein und einen spannenden Kontext bieten. Bei Multiple-Choice müssen ALLE Optionen realistisch und plausibel klingen!"
    
    completion = openai_client.chat.completions.create(
        model="gpt-4o",
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ],
        temperature=0.7,
        response_format={"type": "json_object"},
        timeout=60.0
    )
    
    worksheet_content = json.loads(completion.choices[0].message.content)
    
    # Ensure all questions have IDs
    for i, q in enumerate(worksheet_content.get('questions', [])):
        if 'id' not in q:
            q['id'] = f"q{i+1}"
        if 'answerLines' not in q:
            q['answerLines'] = 3
    
    await db.worksheets.update_one(
        {'id': data.worksheetId},
        {'$set': {
            'difficulty': data.newDifficulty,
            'content': worksheet_content,
            'title': worksheet_content['title'],
            'updated_at': datetime.now(timezone.utc)
        }}
    )
    
    updated = await db.worksheets.find_one({'id': data.worksheetId}, {'_id': 0})
    if 'created_at' in updated and hasattr(updated['created_at'], 'isoformat'):
        updated['created_at'] = updated['created_at'].isoformat()
    if 'updated_at' in updated and hasattr(updated['updated_at'], 'isoformat'):
        updated['updated_at'] = updated['updated_at'].isoformat()
    return updated

@api_router.post("/subscribe/premium")
async def upgrade_premium(user = Depends(get_current_user)):
    await db.users.update_one(
        {'id': user['id']},
        {'$set': {'subscription_tier': 'premium'}}
    )
    return {'message': 'Erfolgreich auf Premium aktualisiert', 'success': True}

# ==================== AI ASSISTANT WITH EDIT COMMANDS ====================

class ChatRequest(BaseModel):
    message: str
    worksheet_id: Optional[str] = None
    context: Optional[dict] = None

@api_router.post("/chat/assistant")
async def chat_assistant(data: ChatRequest, user = Depends(get_current_user)):
    """AI Teaching Assistant - simple Q&A mode"""
    logger.info(f"Chat request from user {user['id']}: {data.message[:50]}...")
    
    context_text = ""
    if data.worksheet_id:
        worksheet = await db.worksheets.find_one({'id': data.worksheet_id, 'user_id': user['id']}, {'_id': 0})
        if worksheet:
            context_text = f"""
Current Worksheet Context:
- Title: {worksheet.get('title')}
- Topic: {worksheet.get('topic')}
- Grade: {worksheet.get('grade')}
- Subject: {worksheet.get('subject')}
- Mode: {worksheet.get('mode')}
- Questions: {len(worksheet.get('content', {}).get('questions', []))}
"""
    
    system_prompt = f"""You are an expert Swiss teaching assistant for primary school teachers.

You help teachers with:
- Generating new tasks and questions
- Rewriting questions to be simpler or more challenging
- Suggesting differentiation strategies
- Creating alternative versions (A/B/C)
- Providing real-world examples
- Generating solution explanations
- Improving clarity and wording
- Aligning with Lehrplan 21 (Swiss curriculum)

Always respond in clear German, be helpful, and provide practical actionable suggestions.

{context_text}

Keep responses concise (2-4 sentences) unless asked for details."""

    try:
        completion = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": data.message}
            ],
            temperature=0.7,
            max_tokens=500,
            timeout=30.0
        )
        
        response = completion.choices[0].message.content
        logger.info(f"Chat response generated: {response[:50]}...")
        
        return {
            'response': response,
            'success': True
        }
    
    except Exception as e:
        logger.error(f"Chat error: {e}", exc_info=True)
        return {
            'response': 'Entschuldigung, es gab einen Fehler. Bitte versuchen Sie es erneut.',
            'success': False
        }

@api_router.post("/chat/edit")
async def chat_edit(data: ChatEditRequest, user = Depends(get_current_user)):
    """AI Assistant that can execute edit commands on worksheets"""
    logger.info(f"Chat edit request from user {user['id']}: {data.message[:50]}...")
    
    worksheet = await db.worksheets.find_one({'id': data.worksheet_id, 'user_id': user['id']}, {'_id': 0})
    if not worksheet:
        raise HTTPException(status_code=404, detail="Arbeitsblatt nicht gefunden")
    
    # Build structured prompt for edit commands
    system_prompt = """You are an expert Swiss teaching assistant that can edit worksheets.

You receive the current worksheet and a teacher's instruction. You must:
1. Understand what changes the teacher wants
2. Return a structured JSON response with actions to apply

IMPORTANT: Always respond with valid JSON in this exact format:
{
  "message": "Confirmation message in German for the teacher",
  "actions": [
    {
      "type": "update_question",
      "questionId": "q1",
      "data": {
        "question": "new question text",
        "answer": "new answer",
        "options": ["A", "B", "C", "D"],
        "explanation": "new explanation"
      }
    }
  ]
}

Available action types:
- "update_question": Update fields of an existing question (requires questionId and data)
- "add_question": Add a new question (requires data with full question object including type, question, answer)
- "delete_question": Delete a question (requires questionId)
- "replace_question": Replace a question entirely (requires questionId and data)

For the data field, only include fields that should be changed.
If adding questions, generate appropriate IDs like "q_new_1".

Always respond in German in the message field.
If you cannot fulfill the request, return {"message": "explanation", "actions": []}"""

    worksheet_json = json.dumps(data.worksheet_content, ensure_ascii=False, indent=2)
    
    user_prompt = f"""Current worksheet content:
{worksheet_json}

Teacher instruction: {data.message}

Respond with the JSON action structure."""

    try:
        completion = openai_client.chat.completions.create(
            model="gpt-4o",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.5,
            max_tokens=2000,
            response_format={"type": "json_object"},
            timeout=45.0
        )
        
        response_text = completion.choices[0].message.content
        logger.info(f"Chat edit response: {response_text[:200]}...")
        
        try:
            response_json = json.loads(response_text)
        except json.JSONDecodeError:
            return {
                'message': 'Entschuldigung, ich konnte die Antwort nicht verarbeiten.',
                'actions': [],
                'success': False
            }
        
        # Validate actions
        validated_actions = []
        for action in response_json.get('actions', []):
            if action.get('type') in ['update_question', 'add_question', 'delete_question', 'replace_question']:
                validated_actions.append(action)
        
        return {
            'message': response_json.get('message', 'Änderungen vorgeschlagen'),
            'actions': validated_actions,
            'success': True
        }
    
    except Exception as e:
        logger.error(f"Chat edit error: {e}", exc_info=True)
        return {
            'message': 'Entschuldigung, es gab einen Fehler. Bitte versuchen Sie es erneut.',
            'actions': [],
            'success': False
        }

# ==================== EXPORT ROUTES (FIXED - POST with auth) ====================

@api_router.post("/export/pdf")
async def export_pdf_post(data: ExportRequest, user = Depends(get_current_user)):
    """Export worksheet as PDF (POST with auth token)"""
    start_time = time.time()
    logger.info(f"PDF export request: worksheet={data.worksheetId}, version={data.version}")
    
    try:
        worksheet = await db.worksheets.find_one({'id': data.worksheetId, 'user_id': user['id']}, {'_id': 0})
        if not worksheet:
            raise HTTPException(status_code=404, detail="Arbeitsblatt nicht gefunden")
        
        include_solutions = (data.version == 'teacher')
        pdf_buffer = export_worksheet_pdf(worksheet, include_solutions)
        
        # Clean filename
        title = worksheet.get('title', 'Arbeitsblatt').replace('/', '-').replace('\\', '-')
        filename = f"{title}_{data.version}.pdf"
        
        duration = time.time() - start_time
        logger.info(f"PDF export completed in {duration:.2f}s: {filename}")
        
        return Response(
            content=pdf_buffer.getvalue(),
            media_type="application/pdf",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Export-Duration": str(duration)
            }
        )
    except Exception as e:
        logger.error(f"PDF export error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Export-Fehler: {str(e)}")

@api_router.post("/export/docx")
async def export_docx_post(data: ExportRequest, user = Depends(get_current_user)):
    """Export worksheet as Word document (POST with auth token)"""
    start_time = time.time()
    logger.info(f"DOCX export request: worksheet={data.worksheetId}, version={data.version}")
    
    try:
        worksheet = await db.worksheets.find_one({'id': data.worksheetId, 'user_id': user['id']}, {'_id': 0})
        if not worksheet:
            raise HTTPException(status_code=404, detail="Arbeitsblatt nicht gefunden")
        
        include_solutions = (data.version == 'teacher')
        docx_buffer = export_worksheet_docx(worksheet, include_solutions)
        
        # Clean filename
        title = worksheet.get('title', 'Arbeitsblatt').replace('/', '-').replace('\\', '-')
        filename = f"{title}_{data.version}.docx"
        
        duration = time.time() - start_time
        logger.info(f"DOCX export completed in {duration:.2f}s: {filename}")
        
        return Response(
            content=docx_buffer.getvalue(),
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Export-Duration": str(duration)
            }
        )
    except Exception as e:
        logger.error(f"DOCX export error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Export-Fehler: {str(e)}")

# Keep legacy GET routes for backwards compatibility but they require auth header
@api_router.get("/export/{worksheet_id}/pdf")
async def export_pdf_get(worksheet_id: str, version: str = 'student', user = Depends(get_current_user)):
    """Legacy GET endpoint for PDF export"""
    worksheet = await db.worksheets.find_one({'id': worksheet_id, 'user_id': user['id']}, {'_id': 0})
    if not worksheet:
        raise HTTPException(status_code=404, detail="Arbeitsblatt nicht gefunden")
    
    include_solutions = (version == 'teacher')
    pdf_buffer = export_worksheet_pdf(worksheet, include_solutions)
    
    title = worksheet.get('title', 'Arbeitsblatt').replace('/', '-').replace('\\', '-')
    filename = f"{title}_{version}.pdf"
    
    return Response(
        content=pdf_buffer.getvalue(),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

@api_router.get("/export/{worksheet_id}/docx")
async def export_docx_get(worksheet_id: str, version: str = 'student', user = Depends(get_current_user)):
    """Legacy GET endpoint for DOCX export"""
    worksheet = await db.worksheets.find_one({'id': worksheet_id, 'user_id': user['id']}, {'_id': 0})
    if not worksheet:
        raise HTTPException(status_code=404, detail="Arbeitsblatt nicht gefunden")
    
    include_solutions = (version == 'teacher')
    docx_buffer = export_worksheet_docx(worksheet, include_solutions)
    
    title = worksheet.get('title', 'Arbeitsblatt').replace('/', '-').replace('\\', '-')
    filename = f"{title}_{version}.docx"
    
    return Response(
        content=docx_buffer.getvalue(),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )

# ==================== DOSSIER EXPORT ====================

class DossierExportRequest(BaseModel):
    dossierId: str
    version: str = 'student'  # 'student' or 'teacher'

@api_router.post("/export/dossier/pdf")
async def export_dossier_pdf_post(data: DossierExportRequest, user = Depends(get_current_user)):
    """Export a dossier as PDF"""
    dossier = await db.dossiers.find_one({'id': data.dossierId, 'user_id': user['id']}, {'_id': 0})
    if not dossier:
        raise HTTPException(status_code=404, detail="Dossier nicht gefunden")

    include_solutions = data.version == 'teacher'
    logger.info(f"Dossier PDF export: id={data.dossierId}, version={data.version}")

    try:
        start = time.time()
        pdf_buffer = export_dossier_pdf(dossier, include_solutions)
        duration = time.time() - start

        title = dossier.get('title', 'Dossier').replace('/', '-').replace('\\', '-')
        filename = f"{title}_{data.version}.pdf"

        logger.info(f"Dossier PDF export completed in {duration:.2f}s: {filename}")
        return Response(
            content=pdf_buffer.getvalue(),
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'}
        )
    except Exception as e:
        logger.error(f"Dossier PDF export error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"PDF-Export fehlgeschlagen: {str(e)}")

# ==================== MATERIAL UPLOAD & ANALYSIS ====================

class MaterialTransformRequest(BaseModel):
    material_id: str
    action: str  # worksheet, exam, quiz, summary, cloze, simplify, differentiate, solutions, etc.
    grade: Optional[str] = '4'
    subject: Optional[str] = 'Deutsch'
    difficulty: Optional[str] = 'medium'
    questionCount: Optional[int] = 10
    mode: Optional[str] = 'worksheet'
    customInstructions: Optional[str] = ''

class EditorAssistRequest(BaseModel):
    instruction: str
    current_content: str
    selection: Optional[str] = None
    worksheet_id: Optional[str] = None
    source_material_id: Optional[str] = None
    context: Optional[Dict[str, Any]] = {}

class QuestionImprovementRequest(BaseModel):
    question: Dict[str, Any]
    worksheet_id: str
    context: Optional[Dict[str, Any]] = {}

@api_router.post("/materials/upload")
async def upload_material(
    file: UploadFile = File(...),
    user = Depends(get_current_user)
):
    """Upload and parse a teaching material file"""
    logger.info(f"Material upload: {file.filename} by user {user['id']}")
    
    # Validate file
    if not file.filename:
        raise HTTPException(status_code=400, detail="Kein Dateiname")
    
    ext = file.filename.lower().split('.')[-1] if '.' in file.filename else ''
    if ext not in ['pdf', 'docx', 'doc', 'txt', 'png', 'jpg', 'jpeg']:
        raise HTTPException(status_code=400, detail=f"Nicht unterstützter Dateityp: {ext}")
    
    # Read file
    file_bytes = await file.read()
    
    # Check file size (10MB max)
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Datei zu gross (max. 10MB)")
    
    # Parse file
    parse_result = MaterialParser.parse(file_bytes, file.filename)
    
    if not parse_result.get("success"):
        raise HTTPException(status_code=400, detail=parse_result.get("error", "Parsing fehlgeschlagen"))
    
    # Store material in DB
    material_id = str(uuid.uuid4())
    material = {
        "id": material_id,
        "user_id": user["id"],
        "filename": file.filename,
        "file_type": parse_result.get("file_type"),
        "file_size": len(file_bytes),
        "parse_result": {
            k: v for k, v in parse_result.items() 
            if k not in ["base64", "full_text"]  # Don't store large data in summary
        },
        "full_text": parse_result.get("full_text", ""),
        "image_base64": parse_result.get("base64") if parse_result.get("file_type") == "image" else None,
        "created_at": datetime.now(timezone.utc),
        "status": "parsed"
    }
    
    await db.materials.insert_one(material)
    
    # Return summary (without large data)
    return {
        "success": True,
        "material_id": material_id,
        "filename": file.filename,
        "file_type": parse_result.get("file_type"),
        "char_count": parse_result.get("char_count", 0),
        "word_count": parse_result.get("word_count", 0),
        "page_count": parse_result.get("page_count"),
        "preview": parse_result.get("full_text", "")[:500] + "..." if len(parse_result.get("full_text", "")) > 500 else parse_result.get("full_text", ""),
        "status": "parsed"
    }

@api_router.post("/materials/{material_id}/analyze")
async def analyze_material(material_id: str, user = Depends(get_current_user)):
    """Analyze uploaded material to extract educational metadata"""
    logger.info(f"Material analysis: {material_id}")
    
    material = await db.materials.find_one({"id": material_id, "user_id": user["id"]})
    if not material:
        raise HTTPException(status_code=404, detail="Material nicht gefunden")
    
    # Analyze based on file type
    if material.get("file_type") == "image" and material.get("image_base64"):
        analysis = await MaterialAnalyzer.analyze_image_content(
            material["image_base64"],
            material["filename"]
        )
    else:
        analysis = await MaterialAnalyzer.analyze_text_content(
            material.get("full_text", ""),
            material["filename"]
        )
    
    # Update material with analysis
    await db.materials.update_one(
        {"id": material_id},
        {"$set": {
            "analysis": analysis,
            "status": "analyzed",
            "analyzed_at": datetime.now(timezone.utc)
        }}
    )
    
    return {
        "success": True,
        "material_id": material_id,
        "analysis": analysis
    }

@api_router.get("/materials")
async def list_materials(user = Depends(get_current_user)):
    """List all uploaded materials for the user"""
    materials = await db.materials.find(
        {"user_id": user["id"]},
        {"_id": 0, "full_text": 0, "image_base64": 0}  # Exclude large fields
    ).sort("created_at", -1).to_list(50)
    
    # Convert datetime to ISO string
    for m in materials:
        if "created_at" in m and hasattr(m["created_at"], "isoformat"):
            m["created_at"] = m["created_at"].isoformat()
        if "analyzed_at" in m and hasattr(m["analyzed_at"], "isoformat"):
            m["analyzed_at"] = m["analyzed_at"].isoformat()
    
    return materials

@api_router.get("/materials/{material_id}")
async def get_material(material_id: str, user = Depends(get_current_user)):
    """Get a specific material with full content"""
    material = await db.materials.find_one(
        {"id": material_id, "user_id": user["id"]},
        {"_id": 0, "image_base64": 0}  # Exclude image data (use separate endpoint)
    )
    
    if not material:
        raise HTTPException(status_code=404, detail="Material nicht gefunden")
    
    # Convert datetime
    if "created_at" in material and hasattr(material["created_at"], "isoformat"):
        material["created_at"] = material["created_at"].isoformat()
    if "analyzed_at" in material and hasattr(material["analyzed_at"], "isoformat"):
        material["analyzed_at"] = material["analyzed_at"].isoformat()
    
    return material

@api_router.delete("/materials/{material_id}")
async def delete_material(material_id: str, user = Depends(get_current_user)):
    """Delete an uploaded material"""
    result = await db.materials.delete_one({"id": material_id, "user_id": user["id"]})
    
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Material nicht gefunden")
    
    return {"success": True, "message": "Material gelöscht"}

@api_router.post("/materials/transform")
async def transform_material(data: MaterialTransformRequest, user = Depends(get_current_user)):
    """Transform uploaded material into new educational content"""
    logger.info(f"Transform material: {data.material_id} -> {data.action}")
    
    material = await db.materials.find_one({"id": data.material_id, "user_id": user["id"]})
    if not material:
        raise HTTPException(status_code=404, detail="Material nicht gefunden")
    
    source_text = material.get("full_text", "")
    if not source_text:
        raise HTTPException(status_code=400, detail="Material enthält keinen Text")
    
    # Transform
    result = await MaterialTransformer.transform(
        source_text=source_text,
        action=data.action,
        options={
            "grade": data.grade,
            "subject": data.subject,
            "difficulty": data.difficulty,
            "questionCount": data.questionCount,
            "mode": data.mode,
            "customInstructions": data.customInstructions
        }
    )
    
    if not result.get("transform_success"):
        raise HTTPException(status_code=500, detail=result.get("error", "Transformation fehlgeschlagen"))
    
    # Ensure all questions have proper IDs and metadata
    for i, q in enumerate(result.get("questions", [])):
        if "id" not in q:
            q["id"] = f"q{i+1}"
        q["number"] = i + 1
        q["from_source"] = True
        q["source_material_id"] = data.material_id
        if "answerLines" not in q:
            q["answerLines"] = 3
    
    # Create worksheet from transformed content
    worksheet_id = str(uuid.uuid4())
    worksheet = {
        "id": worksheet_id,
        "user_id": user["id"],
        "title": result.get("title", f"Basierend auf: {material['filename']}"),
        "topic": material.get("analysis", {}).get("detected_topic", material["filename"]),
        "grade": data.grade,
        "subject": data.subject,
        "difficulty": data.difficulty,
        "question_count": len(result.get("questions", [])),
        "mode": data.mode,
        "content": {
            "title": result.get("title", ""),
            "questions": result.get("questions", []),
            "teacher_notes": result.get("teacher_notes", ""),
            "total_points": result.get("total_points"),
            "estimated_time": result.get("estimated_time"),
            "source_summary": result.get("source_summary", "")
        },
        "source_material_id": data.material_id,
        "source_filename": material["filename"],
        "transform_action": data.action,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }
    
    await db.worksheets.insert_one(worksheet)
    
    # Update user worksheet count
    await db.users.update_one(
        {"id": user["id"]},
        {"$inc": {"worksheets_used_this_month": 1}}
    )
    
    # Return worksheet (without _id)
    worksheet.pop("_id", None)
    worksheet["created_at"] = worksheet["created_at"].isoformat()
    worksheet["updated_at"] = worksheet["updated_at"].isoformat()
    
    return {
        "success": True,
        "worksheet": worksheet
    }

@api_router.post("/editor/assist")
async def editor_assist(data: EditorAssistRequest, user = Depends(get_current_user)):
    """AI-assisted editing within the editor"""
    logger.info(f"Editor assist: {data.instruction[:50]}...")
    
    # Build context
    context = data.context or {}
    
    # If source material provided, fetch it
    if data.source_material_id:
        material = await db.materials.find_one(
            {"id": data.source_material_id, "user_id": user["id"]},
            {"_id": 0, "full_text": 1}
        )
        if material:
            context["source_material"] = material.get("full_text", "")[:3000]
    
    # If worksheet provided, get its context
    if data.worksheet_id:
        worksheet = await db.worksheets.find_one(
            {"id": data.worksheet_id, "user_id": user["id"]},
            {"_id": 0, "grade": 1, "subject": 1, "difficulty": 1, "mode": 1}
        )
        if worksheet:
            context.update({
                "grade": worksheet.get("grade"),
                "subject": worksheet.get("subject"),
                "difficulty": worksheet.get("difficulty"),
                "mode": worksheet.get("mode")
            })
    
    # Execute edit
    result = await ContextualEditor.edit_content(
        current_content=data.current_content,
        instruction=data.instruction,
        context=context,
        selection=data.selection
    )
    
    return result

@api_router.post("/editor/suggest")
async def suggest_improvements(data: QuestionImprovementRequest, user = Depends(get_current_user)):
    """Get AI suggestions for improving a question"""
    logger.info(f"Suggest improvements for question in worksheet {data.worksheet_id}")
    
    # Build context
    context = data.context or {}
    
    worksheet = await db.worksheets.find_one(
        {"id": data.worksheet_id, "user_id": user["id"]},
        {"_id": 0, "grade": 1, "subject": 1, "difficulty": 1, "mode": 1, "source_material_id": 1}
    )
    
    if worksheet:
        context.update({
            "grade": worksheet.get("grade"),
            "subject": worksheet.get("subject"),
            "difficulty": worksheet.get("difficulty"),
            "mode": worksheet.get("mode")
        })
        
        # If has source material, note it
        if worksheet.get("source_material_id"):
            context["has_source_material"] = True
    
    result = await ContextualEditor.suggest_improvements(data.question, context)
    return result

# ==================== DOSSIER ROUTES ====================

def get_dossier_planning_prompt(grade: str, subject: str, difficulty: str, topic: str, competency_codes: List[str]) -> str:
    """Generate the planning prompt for dossier outline generation"""
    competencies_text = ""
    if competency_codes:
        competencies_text = f"\n\nLehrplan 21 Kompetenzen die abgedeckt werden sollen:\n" + "\n".join(f"- {code}" for code in competency_codes)

    return f"""Du bist ein erfahrener Schweizer Primarschullehrer. Erstelle einen detaillierten Strukturplan für ein Lerndossier.

Thema: {topic}
Klassenstufe: {grade}. Klasse (Primarschule Schweiz)
Fach: {subject}
Schwierigkeit: {difficulty}{competencies_text}

Erstelle einen JSON-Strukturplan mit 7-10 Sektionen. Das Dossier soll 15-20 Seiten umfassen.

ANTWORTFORMAT (JSON):
{{
  "title": "Dossier-Titel",
  "sections": [
    {{
      "type": "objectives",
      "title": "Lernziele",
      "description": "Kurze Beschreibung was in dieser Sektion generiert werden soll",
      "estimated_pages": 1
    }},
    {{
      "type": "theory",
      "title": "Einführung: [Thema]",
      "description": "Einführungstext mit Infokästen zum Thema...",
      "estimated_pages": 3
    }},
    {{
      "type": "exercises",
      "title": "Übungen Teil 1",
      "description": "Multiple Choice, Lückentext und Zuordnungsaufgaben zu...",
      "estimated_pages": 3
    }},
    ...weitere Sektionen...
  ],
  "learning_objectives": [
    "Die Schülerinnen und Schüler können...",
    "Die Schülerinnen und Schüler verstehen..."
  ]
}}

Sektionstypen die du verwenden kannst:
- "objectives": Lernziele-Übersicht
- "theory": Theorie/Informationstext mit Infokästen
- "exercises": Übungsblock mit verschiedenen Fragetypen
- "source_text": Quellentext/Lesetext mit Verständnisfragen
- "creative": Kreativaufgabe (Zeichnen, Schreiben, Projekt)
- "summary": Zusammenfassung und Reflexion
- "glossary": Wortschatz/Glossar

WICHTIG:
- Plane ein abwechslungsreiches, pädagogisch sinnvolles Dossier
- Beginne immer mit Lernzielen
- Wechsle zwischen Theorie und Übungen ab
- Ende mit Zusammenfassung/Reflexion
- Schweizer Kontext und Lehrplan 21"""


def get_dossier_section_prompt(section_type: str, section_title: str, section_description: str,
                                grade: str, subject: str, difficulty: str, topic: str,
                                learning_objectives: List[str], previous_summaries: List[str]) -> str:
    """Generate the prompt for a single dossier section"""

    context = ""
    if previous_summaries:
        context = "\n\nBereits behandelte Inhalte (für Kohärenz):\n" + "\n".join(f"- {s}" for s in previous_summaries[-3:])

    objectives_text = "\n".join(f"- {obj}" for obj in learning_objectives) if learning_objectives else "Keine spezifischen Lernziele definiert"

    block_instructions = {
        "objectives": """Erstelle eine Lernziel-Checkliste. Verwende diese Block-Typen:
- "heading": Überschriften
- "objectives_checklist": Liste der Lernziele mit code und text
- "text": Einleitender Text""",

        "theory": """Erstelle einen informativen Theorieteil. Verwende diese Block-Typen:
- "heading": Überschriften (level 1, 2 oder 3)
- "text": Fliesstext-Absätze (html mit <b>, <i>, <br> Tags)
- "info_box": Infokästen mit variant "wusstest_du", "wichtig", "merke" oder "tipp"
- "table": Tabellen für Vergleiche oder Übersichten
- "image_placeholder": Bildplatzhalter mit Beschreibung""",

        "exercises": """Erstelle einen Übungsblock mit verschiedenen Fragetypen. Verwende diese Block-Typen:
- "heading": Überschriften
- "question": Fragen (type: "multiple_choice", "open", "fill_blank", "matching", "ordering", "true_false")
  Jede Frage braucht: id, number, type, question, answer, explanation, answerLines
  Bei multiple_choice zusätzlich: options (Array mit 4 Optionen)
  Bei fill_blank: Lücken mit ___ markieren
  Bei matching: answer als "links1→rechts1, links2→rechts2"
- "text": Einleitende Texte zwischen Aufgaben""",

        "source_text": """Erstelle einen Quellentext mit Verständnisfragen. Verwende:
- "heading": Titel des Quellentexts
- "text": Der Quellentext selbst (ausführlich, 200-400 Wörter)
- "info_box": Kontext-Information zum Text (variant "tipp")
- "question": Verständnisfragen zum Text""",

        "creative": """Erstelle eine Kreativaufgabe. Verwende:
- "heading": Titel der Aufgabe
- "text": Ausführliche Aufgabenbeschreibung
- "creative_task": Die eigentliche Aufgabe mit instruction, type ("drawing"/"writing"/"project"), space_lines""",

        "summary": """Erstelle eine Zusammenfassung und Reflexion. Verwende:
- "heading": Überschriften
- "text": Zusammenfassender Text der wichtigsten Punkte
- "reflection": Reflexionsfragen für die Schüler
- "objectives_checklist": Selbstcheck der Lernziele (gleiche wie am Anfang)""",

        "glossary": """Erstelle ein Glossar/Wortschatz. Verwende:
- "heading": Überschrift "Glossar" oder "Wortschatz"
- "glossary": Liste von Begriffen mit Definitionen (terms Array mit term und definition)"""
    }

    return f"""Du bist ein erfahrener Schweizer Primarschullehrer. Generiere den Inhalt für EINE Sektion eines Lerndossiers.

=== KONTEXT ===
Thema: {topic}
Klassenstufe: {grade}. Klasse
Fach: {subject}
Schwierigkeit: {difficulty}

Lernziele des Dossiers:
{objectives_text}
{context}

=== AKTUELLE SEKTION ===
Typ: {section_type}
Titel: {section_title}
Beschreibung: {section_description}

=== BLOCK-TYPEN ===
{block_instructions.get(section_type, block_instructions["theory"])}

=== ANTWORTFORMAT (JSON) ===
{{
  "blocks": [
    {{
      "type": "heading",
      "content": {{ "text": "Überschrift", "level": 2 }}
    }},
    {{
      "type": "text",
      "content": {{ "html": "<b>Fettgedruckter Text</b> und normaler Text..." }}
    }},
    ...weitere Blöcke je nach Sektionstyp...
  ],
  "summary": "Kurze Zusammenfassung dieser Sektion (1-2 Sätze, für Kohärenz mit nächster Sektion)"
}}

WICHTIG:
- Generiere substanzielle, pädagogisch hochwertige Inhalte
- Verwende Schweizer Hochdeutsch
- Texte sollen ausführlich und informativ sein (nicht nur Stichpunkte!)
- Bei Fragen: Kreative, kontextreiche Aufgabenstellungen
- Passe den Sprachstil an die Klassenstufe an"""


@api_router.post("/generate-dossier-stream")
async def generate_dossier_stream(data: DossierGenerateRequest, user = Depends(get_current_user)):
    if user['subscription_tier'] == 'free' and user['worksheets_used_this_month'] >= 5:
        raise HTTPException(status_code=403, detail="Monatliches Limit erreicht. Bitte auf Premium upgraden.")

    logger.info(f"Starting dossier generation for user {user['id']}: {data.topic}")

    async def stream_generator():
        start_time = time.time()

        try:
            # ===== STEP 1: Planning Call =====
            yield f"data: {json.dumps({'type': 'status', 'message': 'Dossier wird geplant...', 'progress': 5})}\n\n"

            planning_prompt = get_dossier_planning_prompt(
                data.grade, data.subject, data.difficulty, data.topic, data.competency_codes or []
            )

            try:
                planning_response = openai_client.chat.completions.create(
                    model="gpt-4o",
                    messages=[
                        {"role": "system", "content": planning_prompt},
                        {"role": "user", "content": f"Erstelle einen Strukturplan für ein Lerndossier zum Thema: {data.topic}"}
                    ],
                    temperature=0.7,
                    response_format={"type": "json_object"},
                    timeout=60.0
                )

                outline = json.loads(planning_response.choices[0].message.content)

            except Exception as e:
                logger.error(f"Dossier planning error: {e}")
                yield f"data: {json.dumps({'type': 'error', 'message': f'Planungsfehler: {str(e)}'})}\n\n"
                return

            dossier_title = outline.get('title', f'{data.subject}: {data.topic}')
            planned_sections = outline.get('sections', [])
            learning_objectives = outline.get('learning_objectives', [])
            total_sections = len(planned_sections)

            yield f"data: {json.dumps({'type': 'plan_complete', 'title': dossier_title, 'sections': planned_sections, 'totalSections': total_sections, 'progress': 15})}\n\n"

            # ===== STEP 2: Generate sections one by one =====
            generated_sections = []
            previous_summaries = []
            all_questions = []  # Collect for solutions section

            for idx, planned in enumerate(planned_sections):
                section_type = planned.get('type', 'theory')
                section_title = planned.get('title', f'Sektion {idx + 1}')
                section_description = planned.get('description', '')

                progress_base = 15 + int((idx / total_sections) * 70)

                yield f"data: {json.dumps({'type': 'section_start', 'section': section_title, 'sectionIndex': idx, 'totalSections': total_sections, 'progress': progress_base})}\n\n"

                section_prompt = get_dossier_section_prompt(
                    section_type, section_title, section_description,
                    data.grade, data.subject, data.difficulty, data.topic,
                    learning_objectives, previous_summaries
                )

                try:
                    section_response = openai_client.chat.completions.create(
                        model="gpt-4o",
                        messages=[
                            {"role": "system", "content": section_prompt},
                            {"role": "user", "content": f"Generiere die Sektion '{section_title}' für das Dossier '{dossier_title}'."}
                        ],
                        temperature=0.7,
                        response_format={"type": "json_object"},
                        timeout=90.0
                    )

                    section_content = json.loads(section_response.choices[0].message.content)

                except Exception as e:
                    logger.error(f"Section generation error for '{section_title}': {e}")
                    yield f"data: {json.dumps({'type': 'section_error', 'section': section_title, 'sectionIndex': idx, 'message': str(e)})}\n\n"
                    # Create empty section placeholder
                    section_content = {"blocks": [{"type": "text", "content": {"html": f"<i>Fehler bei der Generierung: {str(e)}</i>"}}], "summary": ""}

                # Process blocks: assign IDs and order
                blocks = []
                for b_idx, block in enumerate(section_content.get('blocks', [])):
                    block_id = f"s{idx+1}_b{b_idx+1}"
                    processed_block = {
                        'id': block_id,
                        'type': block.get('type', 'text'),
                        'content': block.get('content', {}),
                        'order': b_idx
                    }
                    blocks.append(processed_block)

                    # Collect questions for solutions
                    if block.get('type') == 'question':
                        q_content = block.get('content', {})
                        if 'id' not in q_content:
                            q_content['id'] = block_id
                        all_questions.append(q_content)

                section_id = f"sec_{idx+1}"
                section = {
                    'id': section_id,
                    'type': section_type,
                    'title': section_title,
                    'order': idx,
                    'blocks': blocks
                }
                generated_sections.append(section)

                # Track summaries for coherence
                summary = section_content.get('summary', '')
                if summary:
                    previous_summaries.append(f"{section_title}: {summary}")

                yield f"data: {json.dumps({'type': 'section_complete', 'section': section_title, 'sectionIndex': idx, 'totalSections': total_sections, 'blockCount': len(blocks), 'progress': progress_base + int(70 / total_sections)})}\n\n"
                await asyncio.sleep(0)

            # ===== STEP 3: Generate solutions section if there are questions =====
            if all_questions:
                yield f"data: {json.dumps({'type': 'status', 'message': 'Lösungsteil wird erstellt...', 'progress': 88})}\n\n"

                solutions_blocks = [{'id': 'sol_h1', 'type': 'heading', 'content': {'text': 'Lösungen', 'level': 1}, 'order': 0}]

                for q_idx, q in enumerate(all_questions):
                    answer_text = q.get('answer', 'Keine Lösung vorhanden')
                    explanation = q.get('explanation', '')
                    q_number = q.get('number', q_idx + 1)

                    html = f"<b>Frage {q_number}:</b> {answer_text}"
                    if explanation:
                        html += f"<br><i>Erklärung: {explanation}</i>"

                    solutions_blocks.append({
                        'id': f'sol_b{q_idx+1}',
                        'type': 'text',
                        'content': {'html': html},
                        'order': q_idx + 1
                    })

                solutions_section = {
                    'id': f'sec_{len(generated_sections)+1}',
                    'type': 'solutions',
                    'title': 'Lösungen',
                    'order': len(generated_sections),
                    'blocks': solutions_blocks
                }
                generated_sections.append(solutions_section)

            # ===== STEP 4: Save to MongoDB =====
            yield f"data: {json.dumps({'type': 'status', 'message': 'Dossier wird gespeichert...', 'progress': 95})}\n\n"

            dossier_id = str(uuid.uuid4())
            dossier = {
                'id': dossier_id,
                'user_id': user['id'],
                'title': dossier_title,
                'topic': data.topic,
                'grade': data.grade,
                'subject': data.subject,
                'difficulty': data.difficulty,
                'theme': data.theme or 'classic',
                'competency_codes': data.competency_codes or [],
                'learning_objectives': learning_objectives,
                'sections': generated_sections,
                'generation_status': 'complete',
                'generated_sections': len(generated_sections),
                'total_sections': len(generated_sections),
                'mode': 'dossier',
                'created_at': datetime.now(timezone.utc),
                'updated_at': datetime.now(timezone.utc)
            }

            await db.dossiers.insert_one(dossier)

            await db.users.update_one(
                {'id': user['id']},
                {'$inc': {'worksheets_used_this_month': 1}}
            )

            # Prepare response
            dossier_response = dossier.copy()
            dossier_response['created_at'] = dossier['created_at'].isoformat()
            dossier_response['updated_at'] = dossier['updated_at'].isoformat()
            dossier_response.pop('_id', None)

            total_time = time.time() - start_time
            logger.info(f"Dossier generation complete in {total_time:.2f}s: {dossier_id} ({len(generated_sections)} sections)")

            yield f"data: {json.dumps({'type': 'complete', 'dossier': dossier_response, 'progress': 100})}\n\n"

        except Exception as e:
            total_time = time.time() - start_time
            logger.error(f"Dossier streaming error after {total_time:.2f}s: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")


@api_router.get("/dossiers")
async def get_dossiers(user = Depends(get_current_user)):
    dossiers = await db.dossiers.find(
        {'user_id': user['id']},
        {'_id': 0, 'sections.blocks': 0}  # Exclude heavy block data for list view
    ).sort('created_at', -1).to_list(100)
    for d in dossiers:
        if 'created_at' in d and hasattr(d['created_at'], 'isoformat'):
            d['created_at'] = d['created_at'].isoformat()
        if 'updated_at' in d and hasattr(d['updated_at'], 'isoformat'):
            d['updated_at'] = d['updated_at'].isoformat()
    return dossiers


@api_router.get("/dossiers/{dossier_id}")
async def get_dossier(dossier_id: str, user = Depends(get_current_user)):
    dossier = await db.dossiers.find_one({'id': dossier_id, 'user_id': user['id']}, {'_id': 0})
    if not dossier:
        raise HTTPException(status_code=404, detail="Dossier nicht gefunden")
    if 'created_at' in dossier and hasattr(dossier['created_at'], 'isoformat'):
        dossier['created_at'] = dossier['created_at'].isoformat()
    if 'updated_at' in dossier and hasattr(dossier['updated_at'], 'isoformat'):
        dossier['updated_at'] = dossier['updated_at'].isoformat()
    return dossier


@api_router.put("/dossiers/{dossier_id}")
async def update_dossier(dossier_id: str, data: DossierUpdateRequest, user = Depends(get_current_user)):
    dossier = await db.dossiers.find_one({'id': dossier_id, 'user_id': user['id']})
    if not dossier:
        raise HTTPException(status_code=404, detail="Dossier nicht gefunden")

    update_data = {'updated_at': datetime.now(timezone.utc)}

    if data.title is not None:
        update_data['title'] = data.title
    if data.theme is not None:
        update_data['theme'] = data.theme
    if data.competency_codes is not None:
        update_data['competency_codes'] = data.competency_codes
    if data.sections is not None:
        update_data['sections'] = data.sections

    await db.dossiers.update_one({'id': dossier_id}, {'$set': update_data})

    updated = await db.dossiers.find_one({'id': dossier_id}, {'_id': 0})
    if 'created_at' in updated and hasattr(updated['created_at'], 'isoformat'):
        updated['created_at'] = updated['created_at'].isoformat()
    if 'updated_at' in updated and hasattr(updated['updated_at'], 'isoformat'):
        updated['updated_at'] = updated['updated_at'].isoformat()

    return {'success': True, 'dossier': updated, 'message': 'Dossier gespeichert'}


@api_router.delete("/dossiers/{dossier_id}")
async def delete_dossier(dossier_id: str, user = Depends(get_current_user)):
    result = await db.dossiers.delete_one({'id': dossier_id, 'user_id': user['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Dossier nicht gefunden")
    return {'message': 'Dossier gelöscht', 'success': True}


@api_router.post("/dossiers/{dossier_id}/duplicate")
async def duplicate_dossier(dossier_id: str, user = Depends(get_current_user)):
    dossier = await db.dossiers.find_one({'id': dossier_id, 'user_id': user['id']}, {'_id': 0})
    if not dossier:
        raise HTTPException(status_code=404, detail="Dossier nicht gefunden")

    new_id = str(uuid.uuid4())
    new_dossier = dossier.copy()
    new_dossier['id'] = new_id
    new_dossier['title'] = f"{dossier['title']} (Kopie)"
    new_dossier['created_at'] = datetime.now(timezone.utc)
    new_dossier['updated_at'] = datetime.now(timezone.utc)

    await db.dossiers.insert_one(new_dossier)

    new_dossier.pop('_id', None)
    new_dossier['created_at'] = new_dossier['created_at'].isoformat()
    new_dossier['updated_at'] = new_dossier['updated_at'].isoformat()

    return {'success': True, 'dossier': new_dossier}


# ==================== ROOT ====================

@api_router.get("/")
async def root():
    return {"message": "EduFlow API - Worksheet Generator", "version": "3.0.0"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
