<<<<<<< HEAD
# TeacherTime - AI-Powered Worksheet Generator for Swiss Schools

An intelligent SaaS platform that helps primary school teachers in Switzerland create curriculum-aligned worksheets instantly using AI. Built specifically for the Swiss education system and Lehrplan 21.

## 🎯 Overview

TeacherTime saves teachers hours of work by generating high-quality, differentiated worksheets in seconds. Simply enter a topic, select grade level and difficulty, and let AI create professional worksheets with questions, answer keys, and teacher notes.

## ✨ Key Features

### 🤖 AI-Powered Generation
- **OpenAI GPT-4o-mini** integration for intelligent content creation
- Swiss curriculum-aligned (Lehrplan 21)
- Age-appropriate language for each grade level (Klasse 1-6)
- German language interface and content

### 📚 Curriculum Alignment
- **Swiss Lehrplan 21** competency framework
- Subjects: Deutsch, Mathematik, NMG (Natur, Mensch, Gesellschaft), Englisch, Französisch
- Grade levels: Primarschule (1. bis 6. Klasse)

### 🎚️ Differentiation Made Easy
- **3 difficulty levels**: Einfach, Mittel, Schwierig
- One-click regeneration at different difficulty levels
- Perfect for mixed-ability classrooms
- Same topic, multiple challenge levels

### 📄 Professional Output
- **PDF Export** with printer-friendly formatting
- Separate answer key page
- Teacher notes with grading tips
- Point values for each question
- Estimated completion time

### 💼 SaaS Features
- **Free Tier**: 5 worksheets per month
- **Premium**: Unlimited worksheets (CHF 19.90/month)
- Usage tracking with monthly reset
- Worksheet library with search
- User authentication and profiles

## 🛠️ Tech Stack

- **Frontend**: Next.js 14 (App Router), React, Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes, Node.js
- **Database**: MongoDB
- **AI**: OpenAI GPT-4o-mini
- **PDF Generation**: jsPDF
- **Authentication**: JWT-based auth with bcrypt
- **Deployment**: Docker, Kubernetes-ready

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- MongoDB (running locally or remote)
- OpenAI API key

### Environment Variables

Create a `.env` file in the root directory:

```env
MONGO_URL=mongodb://localhost:27017
DB_NAME=teachertime
OPENAI_API_KEY=your_openai_api_key_here
JWT_SECRET=your_jwt_secret_here
NEXT_PUBLIC_BASE_URL=http://localhost:3000
CORS_ORIGINS=*
```

### Installation

```bash
# Install dependencies
yarn install

# Start development server
yarn dev
```

Visit `http://localhost:3000` to see the app!

## 📖 Usage Guide

### 1. Create an Account
- Register with your email and password
- Free tier starts with 5 worksheets per month
- Premium users get unlimited access

### 2. Generate a Worksheet
- Enter your topic (e.g., "Die Photosynthese bei Pflanzen")
- Select grade level (1-6)
- Choose subject (Deutsch, Mathematik, NMG, etc.)
- Set difficulty (Einfach, Mittel, Schwierig)
- Adjust number of questions (5-20)
- Click "Arbeitsblatt erstellen"

### 3. Review & Customize
- Preview generated questions
- Expand solutions to verify accuracy
- Use differentiation buttons to regenerate at different difficulty
- Export to PDF when satisfied

### 4. Manage Your Library
- Access all past worksheets in "Meine Arbeitsblätter"
- Delete unwanted worksheets
- Re-download PDFs anytime

## 🏗️ Architecture

### Database Schema

**users Collection:**
```javascript
{
  id: uuid,
  email: string,
  password_hash: string,
  name: string,
  subscription_tier: 'free' | 'premium',
  worksheets_used_this_month: number,
  created_at: Date,
  month_reset_date: Date
}
```

**worksheets Collection:**
```javascript
{
  id: uuid,
  user_id: uuid,
  title: string,
  topic: string,
  grade: string,
  subject: string,
  difficulty: 'easy' | 'medium' | 'hard',
  question_count: number,
  content: {
    title: string,
    questions: Array<{
      number: number,
      type: string,
      question: string,
      options?: string[],
      answer: string,
      points: number
    }>,
    teacher_notes: string,
    total_points: number,
    estimated_time: string
  },
  created_at: Date
}
```

### API Endpoints

#### Authentication
- `POST /api/auth/register` - Create new account
- `POST /api/auth/login` - Login and get JWT token
- `GET /api/auth/me` - Get current user info

#### Worksheet Management
- `POST /api/generate-worksheet` - Generate new worksheet with AI
- `GET /api/worksheets` - List all user's worksheets
- `GET /api/worksheets/:id` - Get specific worksheet
- `DELETE /api/worksheets/:id` - Delete worksheet
- `POST /api/regenerate-worksheet` - Regenerate with different difficulty

#### Subscription
- `POST /api/subscribe/premium` - Upgrade to premium (mock payment)

## 🧪 Testing

Backend tests verify:
- ✅ Authentication flows (register, login, JWT validation)
- ✅ OpenAI integration and worksheet generation
- ✅ Usage limits for free tier
- ✅ Monthly usage reset logic
- ✅ PDF export functionality
- ✅ Differentiation feature
- ✅ Error handling and validation

Run backend tests:
```bash
# Tests are run automatically via testing agent
```

## 🎨 Design Philosophy

### Teacher-Friendly UI
- Clean, uncluttered interface
- Familiar design patterns (inspired by Canva, Notion)
- Large, clear buttons and forms
- Minimal clicks to value

### Swiss Context
- All UI text in German (Swiss German where appropriate)
- Currency in CHF (Swiss Francs)
- Education system terminology (Klasse, Lehrplan 21)
- Swiss cultural references in generated content

### Accessibility
- Optional dyslexia-friendly fonts (future feature)
- High contrast text
- Keyboard navigation support
- Clear loading states

## 🔐 Security

- Passwords hashed with bcrypt (10 rounds)
- JWT tokens with 7-day expiry
- Environment variables for all secrets
- CORS configured for production
- MongoDB injection prevention via parameterized queries

## 💳 Subscription Model

### Free Tier
- 5 worksheets per month
- All features available
- Monthly reset on the calendar month
- Perfect for occasional users

### Premium (CHF 19.90/month)
- **Unlimited** worksheet generation
- Priority support
- Early access to new features
- All subjects and grade levels

**Note**: Stripe integration is currently mocked. Replace with real Stripe implementation for production.

## 🚀 Deployment

The application is containerized and ready for deployment:

```bash
# Build for production
yarn build

# Start production server
yarn start
```

### Environment Setup
1. Set production MongoDB URL
2. Add production OpenAI API key
3. Configure JWT secret
4. Set CORS origins to your domain
5. Enable Stripe webhook endpoint (when implementing real payments)

## 📊 Future Enhancements

### Planned Features
- [ ] PDF upload to extract topics from textbook pages
- [ ] Image upload for diagram-based questions
- [ ] Custom worksheet templates
- [ ] Dyslexia-friendly font option
- [ ] Collaborative features (share with colleagues)
- [ ] Analytics dashboard (most used topics, subjects)
- [ ] More subjects (Geschichte, Geografie, Kunst)
- [ ] Secondary school support (Sekundarstufe I, 7-9)
- [ ] Multi-language support (French, Italian for other Swiss regions)
- [ ] Real Stripe payment integration
- [ ] Email notifications
- [ ] Worksheet rating and improvement suggestions

## 🐛 Known Issues

- Monthly usage reset logic needs timezone handling for Swiss time (CET/CEST)
- PDF export could be improved with better formatting for long answers
- Stripe integration is mocked (needs real implementation)

## 📝 License

Proprietary - All rights reserved

## 👥 Support

For support, feature requests, or bug reports:
- Email: support@teachertime.ch (placeholder)
- Documentation: See this README
- FAQ: Coming soon

## 🎓 About Swiss Lehrplan 21

Lehrplan 21 is the first common curriculum framework for all 21 German-speaking cantons in Switzerland. It defines competencies that students should achieve at different grade levels across all subjects. TeacherTime's AI is trained to generate content that aligns with these competency goals.

---

**Built with ❤️ for Swiss Teachers**

*Making worksheet creation fast, easy, and pedagogically sound.*
=======
# edu
>>>>>>> 32fe39b7908bc0f5d2f87e0033a31d3a681f4bed
