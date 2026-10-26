
import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;

const coursesPath = path.join(__dirname, "data", "courses.json");
const dbPath = path.join(__dirname, "data", "db.json");
const usersPath = path.join(__dirname, "data", "users.json");
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET === "replace_with_a_long_random_secret") {
  throw new Error("Please set a secure JWT_SECRET in backend/.env");
}

app.use(cors({
  origin: [
    "http://localhost:5173",
    "http://localhost:5174"
  ],
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// ---------- JSON DATA HELPERS ----------

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function readDb() {
  try {
    return await readJson(dbPath);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;

    const initial = { enrollments: [], quizResults: [] };
    await fs.writeFile(dbPath, JSON.stringify(initial, null, 2));
    return initial;
  }
}

async function saveDb(db) {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

async function readUsers() {
  try {
    return await readJson(usersPath);
  } catch (err) {
    if (err.code !== "ENOENT") throw err;

    const initial = { users: [] };
    await fs.writeFile(usersPath, JSON.stringify(initial, null, 2));
    return initial;
  }
}

async function saveUsers(data) {
  await fs.writeFile(usersPath, JSON.stringify(data, null, 2));
}

const safeCourse = (course) => {
  const { quiz, ...publicCourse } = course;
  return publicCourse;
};

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

// ---------- AUTHENTICATION ----------

function createToken(user) {
  return jwt.sign({ sub: user.id }, JWT_SECRET, {
    expiresIn: "7d"
  });
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: "/"
};

function setAuthCookie(res, user) {
  res.cookie("token", createToken(user), cookieOptions);
}

function requireAuth(req, res, next) {
  try {
    const token = req.cookies?.token;

    if (!token) {
      return res.status(401).json({ error: "Please log in first" });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    req.authUserId = payload.sub;
    next();
  } catch {
    return res.status(401).json({
      error: "Session expired. Please log in again."
    });
  }
}

// ---------- REGISTER ----------

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (name.length < 2) {
      return res.status(400).json({
        error: "Name must contain at least 2 characters"
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: "Please enter a valid email address"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        error: "Password must be at least 8 characters"
      });
    }

    const data = await readUsers();

    if (data.users.some(user => user.email === email)) {
      return res.status(409).json({
        error: "An account with this email already exists"
      });
    }

    const user = {
      id: crypto.randomUUID(),
      name,
      email,
      passwordHash: await bcrypt.hash(password, 12),
      createdAt: new Date().toISOString()
    };

    data.users.push(user);
    await saveUsers(data);
    setAuthCookie(res, user);

    res.status(201).json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ---------- LOGIN ----------

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    const data = await readUsers();
    const user = data.users.find(item => item.email === email);

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        error: "Invalid email or password"
      });
    }

    setAuthCookie(res, user);
    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ---------- CURRENT USER ----------

app.get("/api/auth/me", requireAuth, async (req, res, next) => {
  try {
    const data = await readUsers();
    const user = data.users.find(item => item.id === req.authUserId);

    if (!user) {
      res.clearCookie("token", cookieOptions);
      return res.status(401).json({
        error: "Account not found. Please log in again."
      });
    }

    res.json({ user: publicUser(user) });
  } catch (err) {
    next(err);
  }
});

// ---------- LOGOUT ----------

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("token", cookieOptions);
  res.json({ message: "Logged out successfully" });
});

// ---------- HEALTH CHECK ----------

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "AI Learning Platform API is running"
  });
});

// ---------- ALL COURSES ----------

app.get("/api/courses", async (_req, res, next) => {
  try {
    const courses = await readJson(coursesPath);
    res.json(courses.map(safeCourse));
  } catch (err) {
    next(err);
  }
});

// ---------- RULE-BASED RECOMMENDATIONS ----------

app.get("/api/recommendations", async (req, res, next) => {
  try {
    const courses = await readJson(coursesPath);
    const goal = String(req.query.goal || "programming").toLowerCase();
    const level = String(req.query.level || "beginner").toLowerCase();

    const ranked = courses.map(course => {
      let score = course.category === goal ? 5 : 0;

      if (course.level === level) score += 3;
      if (goal === "web" && course.category === "backend") score += 2;

      if (
        goal === "programming" &&
        ["backend", "ai", "data"].includes(course.category)
      ) {
        score += 1;
      }

      return { course, score };
    }).sort((a, b) => b.score - a.score).slice(0, 3);

    res.json(ranked.map(({ course, score }) => ({
      ...safeCourse(course),
      matchScore: Math.min(99, 65 + score * 4),
      reason: course.category === goal
        ? `Matches your ${goal} learning goal`
        : course.level === level
          ? `A useful course for your ${level} level`
          : "A related skill to explore next"
    })));
  } catch (err) {
    next(err);
  }
});

// ---------- AI PERSONALIZED LEARNING PATH ----------

app.post("/api/learning-path", async (req, res) => {
  try {
    const goal = String(req.body?.goal || "").trim();
    const level = String(req.body?.level || "beginner").trim();
    const hoursPerWeek = Number(req.body?.hoursPerWeek ?? 5);

    if (!goal || goal.length > 200) {
      return res.status(400).json({
        error: "Please enter a learning goal of up to 200 characters."
      });
    }

    if (!["beginner", "intermediate", "advanced"].includes(level.toLowerCase())) {
      return res.status(400).json({
        error: "Level must be beginner, intermediate, or advanced."
      });
    }

    if (
      !Number.isFinite(hoursPerWeek) ||
      hoursPerWeek < 1 ||
      hoursPerWeek > 60
    ) {
      return res.status(400).json({
        error: "Study time must be between 1 and 60 hours per week."
      });
    }

    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({
        error: "OPENAI_API_KEY is missing from backend/.env"
      });
    }

    const courses = await readJson(coursesPath);

    if (!Array.isArray(courses) || courses.length === 0) {
      return res.status(500).json({
        error: "No courses are available to build a learning path."
      });
    }

    const response = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content: `You are a personalized learning-path advisor.
Use ONLY the supplied course IDs.
Order relevant courses from foundational to advanced.
Do not invent course IDs.
Estimate the number of weeks realistically.
Return valid JSON in this format:
{
  "learningPath": [
    {
      "courseId": "existing course ID",
      "reason": "why this course fits the learner",
      "estimatedWeeks": 2
    }
  ],
  "advice": "short personalized study advice"
}`
            },
            {
              role: "user",
              content: JSON.stringify({
                learningGoal: goal,
                currentLevel: level.toLowerCase(),
                studyHoursPerWeek: hoursPerWeek,
                availableCourses: courses.map(course => ({
                  id: course.id,
                  title: course.title,
                  category: course.category,
                  level: course.level,
                  description: course.description || ""
                }))
              })
            }
          ],
          temperature: 0.3
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("OpenAI API error:", result.error?.message);

      return res.status(502).json({
        error: "AI request failed. Check your API key, billing, and API access."
      });
    }

    const content = result.choices?.[0]?.message?.content;

    if (!content) {
      return res.status(502).json({
        error: "The AI returned an empty learning path."
      });
    }

    const aiResult = JSON.parse(content);
    const courseMap = new Map(courses.map(course => [course.id, course]));
    const seen = new Set();

    const learningPath = (
      Array.isArray(aiResult.learningPath) ? aiResult.learningPath : []
    )
      .filter(item => {
        if (!courseMap.has(item.courseId) || seen.has(item.courseId)) {
          return false;
        }

        seen.add(item.courseId);
        return true;
      })
      .map((item, index) => ({
        order: index + 1,
        courseId: item.courseId,
        title: courseMap.get(item.courseId).title,
        reason: String(item.reason || "Recommended for your learning goal."),
        estimatedWeeks: Math.max(
          1,
          Math.min(52, Math.round(Number(item.estimatedWeeks) || 1))
        )
      }));

    res.json({
      goal,
      level: level.toLowerCase(),
      hoursPerWeek,
      learningPath,
      advice: String(
        aiResult.advice || "Study consistently and revise each lesson."
      )
    });
  } catch (err) {
    console.error("Learning path error:", err.message);

    res.status(500).json({
      error: "Unable to generate a learning path. Please try again."
    });
  }
});

// ---------- DASHBOARD ----------

app.get("/api/dashboard", async (_req, res, next) => {
  try {
    const db = await readDb();
    const courses = await readJson(coursesPath);

    const completed = db.enrollments.filter(e => e.progress >= 100).length;

    const averageProgress = db.enrollments.length
      ? Math.round(
          db.enrollments.reduce((sum, e) => sum + e.progress, 0) /
          db.enrollments.length
        )
      : 0;

    res.json({
      enrolledCount: db.enrollments.length,
      completedCount: completed,
      averageProgress,
      quizCount: db.quizResults.length,
      enrollments: db.enrollments.map(e => ({
        ...e,
        course: safeCourse(
          courses.find(c => c.id === e.courseId) ||
          { id: e.courseId, title: "Unknown course" }
        )
      }))
    });
  } catch (err) {
    next(err);
  }
});

// ---------- ENROLLMENTS ----------

app.post("/api/enrollments", async (req, res, next) => {
  try {
    const { courseId } = req.body || {};

    if (!courseId) {
      return res.status(400).json({ error: "courseId is required" });
    }

    const courses = await readJson(coursesPath);

    if (!courses.some(c => c.id === courseId)) {
      return res.status(404).json({ error: "Course not found" });
    }

    const db = await readDb();
    const existing = db.enrollments.find(e => e.courseId === courseId);

    if (existing) return res.status(200).json(existing);

    const enrollment = {
      id: crypto.randomUUID(),
      courseId,
      progress: 0,
      enrolledAt: new Date().toISOString()
    };

    db.enrollments.push(enrollment);
    await saveDb(db);

    res.status(201).json(enrollment);
  } catch (err) {
    next(err);
  }
});

app.patch("/api/enrollments/:id/progress", async (req, res, next) => {
  try {
    const progress = Number(req.body?.progress);

    if (!Number.isFinite(progress) || progress < 0 || progress > 100) {
      return res.status(400).json({
        error: "progress must be a number from 0 to 100"
      });
    }

    const db = await readDb();
    const enrollment = db.enrollments.find(e => e.id === req.params.id);

    if (!enrollment) {
      return res.status(404).json({ error: "Enrollment not found" });
    }

    enrollment.progress = Math.round(progress);
    await saveDb(db);

    res.json(enrollment);
  } catch (err) {
    next(err);
  }
});

// ---------- QUIZ QUESTIONS ----------

app.get("/api/quizzes/:courseId", async (req, res, next) => {
  try {
    const courses = await readJson(coursesPath);
    const course = courses.find(c => c.id === req.params.courseId);

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    res.json({
      courseId: course.id,
      title: course.title,
      questions: course.quiz.map(({ question, options }, index) => ({
        id: index,
        question,
        options
      }))
    });
  } catch (err) {
    next(err);
  }
});

// ---------- SUBMIT QUIZ ----------

app.post("/api/quizzes/:courseId/submit", async (req, res, next) => {
  try {
    const courses = await readJson(coursesPath);
    const course = courses.find(c => c.id === req.params.courseId);

    if (!course) {
      return res.status(404).json({ error: "Course not found" });
    }

    const answers = req.body?.answers;

    if (!Array.isArray(answers)) {
      return res.status(400).json({
        error: "answers must be an array"
      });
    }

    const correct = course.quiz.reduce(
      (total, question, index) =>
        total + (Number(answers[index]) === question.answer ? 1 : 0),
      0
    );

    const result = {
      id: crypto.randomUUID(),
      courseId: course.id,
      score: correct,
      total: course.quiz.length,
      percentage: Math.round(correct / course.quiz.length * 100),
      submittedAt: new Date().toISOString()
    };

    const db = await readDb();
    db.quizResults.push(result);
    await saveDb(db);

    res.json({
      ...result,
      feedback: result.percentage >= 70
        ? "Great work! Keep building on this momentum."
        : "Good start. Review the course lessons and try again."
    });
  } catch (err) {
    next(err);
  }
});

// ---------- ERROR HANDLER ----------

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({
    error: "Something went wrong on the server."
  });
});

// ---------- START SERVER ----------

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});
