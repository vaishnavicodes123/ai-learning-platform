# AI Learning Platform — Full Stack

A beginner-friendly full-stack demo inspired by the supplied design. It includes:
- Course recommendations based on a learner's selected goal and level
- Course catalogue and course enrollment
- Progress tracking
- Quizzes with scoring and saved results
- Responsive frontend

## Tech stack
- Frontend: React + Vite
- Backend: Node.js + Express
- Storage: local JSON file (`backend/data/db.json`) so you can run it without setting up a database
- Recommendation engine: transparent rule-based personalization. It is AI-inspired, not a live LLM integration.

## Requirements
Install **Node.js LTS** (includes npm): https://nodejs.org/
After installing, close and reopen your terminal. Verify:
```bash
node -v
npm -v
```

## Run the project (Windows / VS Code)
1. Extract this ZIP.
2. Open the extracted `ai-learning-platform` folder in VS Code.
3. Open Terminal → New Terminal.
4. Run:
```bash
npm install
npm run install:all
npm run dev
```
5. Open the frontend URL printed by Vite, usually `http://localhost:5173`.
6. Backend API runs at `http://localhost:5000`.

Keep the terminal open while using the app. Press `Ctrl + C` to stop the servers.

### If `npm run install:all` fails
Run the installs separately:
```bash
cd backend
npm install
cd ../frontend
npm install
cd ..
npm install
npm run dev
```

## Useful API endpoints
- `GET /api/health` — check the server
- `GET /api/courses` — list courses
- `GET /api/recommendations?goal=web&level=beginner` — personalized recommendations
- `GET /api/dashboard` — dashboard summary
- `POST /api/enrollments` — enroll in a course
- `PATCH /api/enrollments/:id/progress` — update progress
- `GET /api/quizzes/:courseId` — get a quiz
- `POST /api/quizzes/:courseId/submit` — submit quiz answers

## Data storage
App data is stored in `backend/data/db.json`. The server creates it with starter data on first run. To reset demo data, stop the server and replace the file contents with `{ "enrollments": [], "quizResults": [] }` (the courses are in `backend/data/courses.json`).

## Common issues
- **Port 5000 is busy:** set `PORT=5001` in `backend/.env` and update `VITE_API_URL=http://localhost:5001/api` in `frontend/.env`.
- **Frontend says API unavailable:** confirm the backend terminal says it is running on port 5000.
- **`npm` is not recognized:** install Node.js LTS and restart VS Code.
- **PowerShell command confusion:** use the commands exactly as shown above.

## Important note
This is a learning/demo project. It does not include production authentication, a real AI model, or a hosted database. Do not store sensitive personal information in it.
