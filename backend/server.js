
import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error("Add a JWT_SECRET of at least 32 characters to backend/.env");
  process.exit(1);
}

const FRONTEND_ORIGIN =
  process.env.FRONTEND_ORIGIN || "http://localhost:5173";

const coursesPath = path.join(__dirname, "data", "courses.json");
const dbPath = path.join(__dirname, "data", "db.json");
const usersPath = path.join(__dirname, "data", "users.json");

app.use(cors({
  origin: FRONTEND_ORIGIN,
  credentials: true
}));

app.use(express.json({ limit: "20kb" }));
app.use(cookieParser());

// -------------------- JSON FILE HELPERS --------------------

async function readJson(file) {
  return JSON.parse(await fs.readFile(file, "utf8"));
}

async function readDb() {
  try {
    const db = await readJson(dbPath);

    if (!Array.isArray(db.enrollments)) db.enrollments = [];
    if (!Array.isArray(db.quizResults)) db.quizResults = [];

    return db;
  } catch {
    const initial = {
      enrollments: [],
      quizResults: []
    };

    await fs.writeFile(dbPath, JSON.stringify(initial, null, 2));
    return initial;
  }
}

async function saveDb(db) {
  await fs.writeFile(dbPath, JSON.stringify(db, null, 2));
}

async function readUsers() {
  try {
    const data = await readJson(usersPath);
    return Array.isArray(data.users) ? data : { users: [] };
  } catch {
    const initial = { users: [] };
    await fs.writeFile(usersPath, JSON.stringify(initial, null, 2));
    return initial;
  }
}

async function saveUsers(data) {
  await fs.writeFile(usersPath, JSON.stringify(data, null, 2));
}

async function readCourses() {
  const courses = await readJson(coursesPath);

  if (!Array.isArray(courses)) {
    throw new Error("courses.json must contain an array of courses.");
  }

  return courses;
}

function safeCourse(course) {
  if (!course) return null;

  const { quiz, ...publicCourse } = course;
  return publicCourse;
}

// -------------------- AUTHENTICATION --------------------

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 7 * 24 * 60 * 60 * 1000
};

function createToken(user) {
  return jwt.sign(
    { sub: user.id, email: user.email },
    JWT_SECRET,
    { expiresIn: "7d" }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email
  };
}

async function requireAuth(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    return res.status(401).json({
      error: "Please log in to continue."
    });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const data = await readUsers();

    const user = data.users.find(
      item => item.id === payload.sub
    );

    if (!user) {
      return res.status(401).json({
        error: "Session is no longer valid. Please log in again."
      });
    }

    req.user = user;
    next();
  } catch {
    res.clearCookie("token", cookieOptions);

    return res.status(401).json({
      error: "Your session expired. Please log in again."
    });
  }
}

// -------------------- HEALTH CHECK --------------------

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    message: "AI Learning Platform API is running"
  });
});

// -------------------- REGISTER --------------------

app.post("/api/auth/register", async (req, res, next) => {
  try {
    const name = String(req.body?.name || "").trim();
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    if (name.length < 2 || name.length > 60) {
      return res.status(400).json({
        error: "Name must be between 2 and 60 characters."
      });
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        error: "Enter a valid email address."
      });
    }

    if (password.length < 8 || password.length > 72) {
      return res.status(400).json({
        error: "Password must be 8–72 characters long."
      });
    }

    const data = await readUsers();

    if (data.users.some(user => user.email === email)) {
      return res.status(409).json({
        error: "An account with this email already exists."
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

    res.cookie("token", createToken(user), cookieOptions);

    res.status(201).json({
      user: publicUser(user)
    });
  } catch (err) {
    next(err);
  }
});

// -------------------- LOGIN --------------------

app.post("/api/auth/login", async (req, res, next) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const password = String(req.body?.password || "");

    const data = await readUsers();

    const user = data.users.find(
      item => item.email === email
    );

    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      return res.status(401).json({
        error: "Email or password is incorrect."
      });
    }

    res.cookie("token", createToken(user), cookieOptions);

    res.json({
      user: publicUser(user)
    });
  } catch (err) {
    next(err);
  }
});

// -------------------- CURRENT USER --------------------

app.get("/api/auth/me", requireAuth, (req, res) => {
  res.json({
    user: publicUser(req.user)
  });
});

// -------------------- LOGOUT --------------------

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
  });

  res.json({
    message: "Logged out successfully."
  });
});

// -------------------- GET COURSES --------------------

app.get("/api/courses", async (_req, res, next) => {
  try {
    const courses = await readCourses();
    res.json(courses.map(safeCourse));
  } catch (err) {
    next(err);
  }
});

// -------------------- RECOMMENDATIONS --------------------

app.get("/api/recommendations", async (req, res, next) => {
  try {
    const courses = await readCourses();

    const goal = String(
      req.query.goal || "programming"
    ).toLowerCase();

    const level = String(
      req.query.level || "beginner"
    ).toLowerCase();

    const ranked = courses.map(course => {
      let score = course.category === goal ? 5 : 0;

      if (course.level === level) score += 3;

      if (goal === "web" && course.category === "backend") {
        score += 2;
      }

      if (
        goal === "programming" &&
        ["backend", "ai", "data"].includes(course.category)
      ) {
        score += 1;
      }

      return { course, score };
    })
      .sort((a, b) => b.score - a.score)
      .slice(0, 3);

    res.json(
      ranked.map(({ course, score }) => ({
        ...safeCourse(course),
        matchScore: Math.min(99, 65 + score * 4),
        reason: course.category === goal
          ? `Matches your ${goal} learning goal`
          : course.level === level
            ? `A useful course for your ${level} level`
            : "A related skill to explore next"
      }))
    );
  } catch (err) {
    next(err);
  }
});

// -------------------- DASHBOARD --------------------

app.get("/api/dashboard", requireAuth, async (req, res, next) => {
  try {
    const db = await readDb();
    const courses = await readCourses();

    const enrollments = db.enrollments.filter(
      item => item.userId === req.user.id
    );

    const quizResults = db.quizResults.filter(
      item => item.userId === req.user.id
    );

    const completed = enrollments.filter(
      item => item.progress >= 100
    ).length;

    const averageProgress = enrollments.length
      ? Math.round(
          enrollments.reduce(
            (sum, item) => sum + item.progress,
            0
          ) / enrollments.length
        )
      : 0;

    res.json({
      enrolledCount: enrollments.length,
      completedCount: completed,
      averageProgress,
      quizCount: quizResults.length,

      enrollments: enrollments.map(item => ({
        ...item,
        course: safeCourse(
          courses.find(course => course.id === item.courseId)
        )
      }))
    });
  } catch (err) {
    next(err);
  }
});

// -------------------- ENROLLMENT --------------------

app.post("/api/enrollments", requireAuth, async (req, res, next) => {
  try {
    const { courseId } = req.body || {};

    if (!courseId) {
      return res.status(400).json({
        error: "courseId is required"
      });
    }

    const courses = await readCourses();

    if (!courses.some(course => course.id === courseId)) {
      return res.status(404).json({
        error: "Course not found"
      });
    }

    const db = await readDb();

    const existing = db.enrollments.find(
      item =>
        item.courseId === courseId &&
        item.userId === req.user.id
    );

    if (existing) {
      return res.json(existing);
    }

    const enrollment = {
      id: crypto.randomUUID(),
      userId: req.user.id,
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

// -------------------- QUIZ HELPERS --------------------

// Ignore whitespace only. Capitalization and other characters matter.
function normalizeCode(value) {
  return String(value ?? "").replace(/\s+/g, "");
}

function getAnswerForQuestion(answers, question, index) {
  // Supports the current frontend format:
  // [{ questionId: "q1", answer: 1 }, ...]
  if (
    answers.length > 0 &&
    typeof answers[0] === "object" &&
    answers[0] !== null
  ) {
    const match = answers.find(
      item => String(item.questionId) ===
        String(question.id ?? index)
    );

    return match ? match.answer : undefined;
  }

  // Also supports the older format:
  // [1, 2, 0, "code answer", ...]
  return answers[index];
}

// -------------------- GET QUIZ --------------------

app.get("/api/quizzes/:courseId", requireAuth, async (req, res, next) => {
  try {
    const courses = await readCourses();

    const course = courses.find(
      item => item.id === req.params.courseId
    );

    if (!course) {
      return res.status(404).json({
        error: "Course not found"
      });
    }

    if (!Array.isArray(course.quiz) || course.quiz.length === 0) {
      return res.status(400).json({
        error: "Quiz questions are not available for this course."
      });
    }

    const db = await readDb();

    const previous = db.quizResults.filter(
      item =>
        item.userId === req.user.id &&
        item.courseId === course.id
    );

    const attemptsUsed = previous.length;

    if (attemptsUsed >= 2) {
      return res.json({
        courseId: course.id,
        title: course.title,
        attemptsUsed: 2,
        attemptsRemaining: 0,
        alreadyGiven: true,
        questions: []
      });
    }

    res.json({
      courseId: course.id,
      title: course.title,
      attemptsUsed,
      attemptsRemaining: 2 - attemptsUsed,
      alreadyGiven: false,

      // Never send correct answers to the browser.
      questions: course.quiz.map((question, index) => ({
        id: question.id ?? index,
        type: question.type || "mcq",
        question: question.question,
        ...(question.options ? { options: question.options } : {})
      }))
    });
  } catch (err) {
    next(err);
  }
});

// -------------------- SUBMIT QUIZ --------------------

app.post(
  "/api/quizzes/:courseId/submit",
  requireAuth,
  async (req, res, next) => {
    try {
      const courses = await readCourses();

      const course = courses.find(
        item => item.id === req.params.courseId
      );

      if (!course) {
        return res.status(404).json({
          error: "Course not found"
        });
      }

      if (!Array.isArray(course.quiz) || course.quiz.length === 0) {
        return res.status(400).json({
          error: "Quiz questions are not available."
        });
      }

      const db = await readDb();

      // Count attempts only for this user and this course.
      const previous = db.quizResults.filter(
        item =>
          item.userId === req.user.id &&
          item.courseId === course.id
      );

      if (previous.length >= 2) {
        return res.status(403).json({
          error: "Test already given. You have used both attempts.",
          alreadyGiven: true,
          attemptsUsed: 2,
          attemptsRemaining: 0
        });
      }

      const answers = req.body?.answers;

      if (
        !Array.isArray(answers) ||
        answers.length !== course.quiz.length
      ) {
        return res.status(400).json({
          error: "Submit one answer for every quiz question.",
          expected: course.quiz.length,
          received: Array.isArray(answers) ? answers.length : 0
        });
      }

      let correct = 0;
      let answeredCount = 0;

      const review = course.quiz.map((question, index) => {
        const submitted = getAnswerForQuestion(
          answers,
          question,
          index
        );

        const isCode = (question.type || "mcq") === "code";

        const isAnswered = isCode
          ? String(submitted ?? "").trim().length > 0
          : submitted !== undefined &&
            submitted !== null &&
            submitted !== "" &&
            Number(submitted) >= 0;

        if (isAnswered) answeredCount++;

        const isCorrect = isCode
          ? isAnswered &&
            normalizeCode(submitted) ===
              normalizeCode(question.expectedAnswer)
          : isAnswered &&
            Number(submitted) === Number(question.answer);

        if (isCorrect) correct++;

        return {
          questionId: question.id ?? index,
          question: question.question,
          type: isCode ? "code" : "mcq",

          submittedAnswer: isCode
            ? String(submitted ?? "")
            : (
                isAnswered && question.options
                  ? question.options[Number(submitted)] ?? "Not answered"
                  : "Not answered"
              ),

          correctAnswer: isCode
            ? String(question.expectedAnswer ?? "")
            : question.options?.[question.answer] ?? "",

          isAnswered,
          isCorrect
        };
      });

      const total = course.quiz.length;
      const incorrect = total - correct;
      const percentage = Math.round((correct / total) * 100);
      const passed = percentage >= 70;

      // Find this user's enrollment.
      const enrollment = db.enrollments.find(
        item =>
          item.courseId === course.id &&
          item.userId === req.user.id
      );

      const result = {
        id: crypto.randomUUID(),
        userId: req.user.id,
        courseId: course.id,
        score: correct,
        total,
        correct,
        incorrect,
        answeredCount,
        percentage,
        passed,
        attemptNumber: previous.length + 1,
        submittedAt: new Date().toISOString(),
        review
      };

      // Save this attempt only after validating the request.
      db.quizResults.push(result);

      // Passing the quiz completes the course.
      if (passed && enrollment) {
        enrollment.progress = 100;
        enrollment.completedAt = new Date().toISOString();
      }

      await saveDb(db);

      res.json({
        ...result,
        attemptsUsed: result.attemptNumber,
        attemptsRemaining: 2 - result.attemptNumber,
        completed: Boolean(passed && enrollment),

        feedback: passed
          ? "Congratulations! You passed and this course is now completed."
          : "You did not reach the 70% passing score. Review your answers and use your remaining attempt."
      });
    } catch (err) {
      next(err);
    }
  }
);

// -------------------- ERROR HANDLER --------------------

app.use((err, _req, res, _next) => {
  console.error(err);

  res.status(500).json({
    error: "Something went wrong on the server."
  });
});

// -------------------- START SERVER --------------------

app.listen(PORT, () => {
  console.log(`API running at http://localhost:${PORT}`);
});
