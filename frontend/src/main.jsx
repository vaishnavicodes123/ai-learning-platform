import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowRight, BookOpen, BrainCircuit, CheckCircle2, ChevronRight,
  CircleHelp, Clock3, GraduationCap, LayoutDashboard, Lightbulb,
  Play, Search, Sparkles, Target, Trophy, X
} from "lucide-react";
import AuthScreen from "./AuthScreen.jsx";
import "./styles.css";

const API = import.meta.env.VITE_API_URL || "http://localhost:5000/api";

const goals = [
  { value: "programming", label: "Programming" },
  { value: "web", label: "Web development" },
  { value: "data", label: "Data analytics" },
  { value: "backend", label: "Backend development" },
  { value: "design", label: "UI design" },
  { value: "ai", label: "Artificial intelligence" }
];

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function App() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  const [courses, setCourses] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [dashboard, setDashboard] = useState({ enrollments: [] });
  const [goal, setGoal] = useState("programming");
  const [level, setLevel] = useState("beginner");
  const [query, setQuery] = useState("");
  const [activeTab, setActiveTab] = useState("overview");
  const [notice, setNotice] = useState("");
  const [quiz, setQuiz] = useState(null);
  const [answers, setAnswers] = useState({});
  const [quizResult, setQuizResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const [apiError, setApiError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function checkSession() {
      try {
        const data = await api("/auth/me");
        if (!cancelled) setUser(data.user);
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    }

    checkSession();

    return () => {
      cancelled = true;
    };
  }, []);

  async function refresh() {
    setLoading(true);

    try {
      const [courseData, dashData, recData] = await Promise.all([
        api("/courses"),
        api("/dashboard"),
        api(`/recommendations?goal=${goal}&level=${level}`)
      ]);

      setCourses(courseData);
      setDashboard(dashData);
      setRecommendations(recData);
      setApiError("");
    } catch (error) {
      setApiError(error.message || "Could not load your learning dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (user) {
      refresh();
    } else {
      setCourses([]);
      setRecommendations([]);
      setDashboard({ enrollments: [] });
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;

    api(`/recommendations?goal=${goal}&level=${level}`)
      .then(setRecommendations)
      .catch(() => {});
  }, [goal, level, user]);

  const enrolledIds = useMemo(
    () => new Set((dashboard.enrollments || []).map((e) => e.courseId)),
    [dashboard]
  );

  const filteredCourses = courses.filter((course) =>
    `${course.title} ${course.description} ${course.category}`
      .toLowerCase()
      .includes(query.toLowerCase())
  );

  async function enroll(course) {
    try {
      await api("/enrollments", {
        method: "POST",
        body: JSON.stringify({ courseId: course.id })
      });

      await refresh();
      setNotice(`You're enrolled in ${course.title}.`);
      setActiveTab("my-learning");
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function openQuiz(course) {
    try {
      const data = await api(`/quizzes/${course.id}`);

      setQuiz({ ...data, course });
      setAnswers({});
      setQuizResult(null);

      if (data.alreadyGiven) {
        setNotice("Test already given. You have used both attempts.");
      } else {
        setNotice("");
      }
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function submitQuiz() {
    if (!quiz) return;

    try {
     const courseId = quiz.courseId || quiz.course?.id;

const result = await api(`/quizzes/${courseId}/submit`, {
        method: "POST",
        body: JSON.stringify({
          answers: quiz.questions.map((question) => ({
            questionId: question.id,
            answer:
              answers[question.id] ??
              (question.type === "code" ? "" : -1)
          }))
        })
      });

      setQuizResult(result);
      await refresh();
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function logout() {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (error) {
      console.error("Logout request failed:", error);
    }

    setUser(null);
    setCourses([]);
    setRecommendations([]);
    setDashboard({ enrollments: [] });
    setQuiz(null);
    setQuizResult(null);
    setNotice("");
    setApiError("");
    setActiveTab("overview");
    setQuery("");
  }

  if (!authChecked) {
    return <div className="auth-loading">Checking your session...</div>;
  }

  if (!user) {
    return <AuthScreen onLogin={setUser} />;
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#"
          onClick={(event) => {
            event.preventDefault();
            setActiveTab("overview");
          }}
        >
          <span className="brand-icon">
            <GraduationCap size={25} />
          </span>
          <span>
            learnly<span className="brand-dot">.</span>
            <small>AI LEARNING</small>
          </span>
        </a>

        <div className="nav-label">WORKSPACE</div>

        {[
          ["overview", LayoutDashboard, "Overview"],
          ["courses", BookOpen, "Explore courses"],
          ["my-learning", Target, "My learning"]
        ].map(([id, Icon, label]) => (
          <button
            key={id}
            className={`nav-item ${activeTab === id ? "active" : ""}`}
            onClick={() => setActiveTab(id)}
          >
            <Icon size={18} />
            <span>{label}</span>
            {id === "my-learning" && dashboard.enrolledCount > 0 && (
              <em>{dashboard.enrolledCount}</em>
            )}
          </button>
        ))}

        <div className="sidebar-bottom">
          <div className="side-tip">
            <div className="tip-icon">
              <Lightbulb size={18} />
            </div>
            <strong>Small steps add up.</strong>
            <p>Learn a little every day and keep your streak going.</p>
          </div>

          <div className="profile">
            <div className="avatar">
              {(user.name || user.email || "U").charAt(0).toUpperCase()}
            </div>
            <div>
              <strong>{user.name || "Your learning space"}</strong>
              <span>Personal dashboard</span>
            </div>
          </div>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div className="mobile-brand">
            <GraduationCap size={23} /> learnly<span>.</span>
          </div>

          <div className="breadcrumb">
            Learning space <ChevronRight size={14} />
            <strong>
              {activeTab === "overview"
                ? "Overview"
                : activeTab === "courses"
                  ? "Explore courses"
                  : "My learning"}
            </strong>
          </div>

          <div className="top-actions">
            <span className="status-dot" />
            <span className="top-status">
              Hi, {user.name || "Learner"}!
            </span>
            <button
              type="button"
              className="logout-button"
              onClick={logout}
            >
              Sign out
            </button>
          </div>
        </header>

        {apiError && <div className="error-banner">{apiError}</div>}

        {notice && (
          <div className="notice">
            <CheckCircle2 size={17} />
            {notice}
            <button onClick={() => setNotice("")} aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        )}

        {activeTab === "overview" && (
          <>
            <section className="welcome-row">
              <div>
                <div className="eyebrow">
                  <Sparkles size={14} /> YOUR PERSONAL LEARNING GUIDE
                </div>
                <h1>
                  Make room for <span>what's next.</span>
                </h1>
                <p>
                  Build new skills with a learning path shaped around you.
                </p>
              </div>

              <div className="welcome-art">
                <div className="art-orbit orbit-one" />
                <div className="art-orbit orbit-two" />
                <div className="art-core">
                  <BrainCircuit size={42} />
                </div>
                <span className="float-card">
                  <Sparkles size={14} /> Learn smarter
                </span>
              </div>
            </section>

            <section className="stats-grid">
              <Stat
                icon={BookOpen}
                label="Courses enrolled"
                value={dashboard.enrolledCount || 0}
                tint="lavender"
              />
              <Stat
                icon={Trophy}
                label="Courses completed"
                value={dashboard.completedCount || 0}
                tint="peach"
              />
              <Stat
                icon={Target}
                label="Average progress"
                value={`${dashboard.averageProgress || 0}%`}
                tint="mint"
              />
              <Stat
                icon={CircleHelp}
                label="Quizzes taken"
                value={dashboard.quizCount || 0}
                tint="yellow"
              />
            </section>

            <section className="section-block">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">MADE FOR YOU</div>
                  <h2>Your recommended path</h2>
                  <p>
                    Tell us what you're working toward to get a more relevant
                    shortlist.
                  </p>
                </div>
                <button
                  className="text-button"
                  onClick={() => setActiveTab("courses")}
                >
                  All courses <ArrowRight size={16} />
                </button>
              </div>

              <div className="personalize-panel">
                <div className="personalize-icon">
                  <BrainCircuit size={22} />
                </div>
                <div className="personalize-copy">
                  <strong>Personalize your recommendations</strong>
                  <span>Choose a goal and current level.</span>
                </div>

                <label>
                  Learning goal
                  <select
                    value={goal}
                    onChange={(e) => setGoal(e.target.value)}
                  >
                    {goals.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Level
                  <select
                    value={level}
                    onChange={(e) => setLevel(e.target.value)}
                  >
                    <option value="beginner">Beginner</option>
                    <option value="intermediate">Intermediate</option>
                    <option value="advanced">Advanced</option>
                  </select>
                </label>
              </div>

              <div className="course-grid">
                {recommendations.map((course) => (
                  <CourseCard
                    key={course.id}
                    course={course}
                    enrolled={enrolledIds.has(course.id)}
                    onEnroll={enroll}
                    onQuiz={openQuiz}
                  />
                ))}
              </div>
            </section>

            <section className="section-block learning-section">
              <div className="section-heading">
                <div>
                  <div className="eyebrow">KEEP GOING</div>
                  <h2>Pick up where you left off</h2>
                </div>
                <button
                  className="text-button"
                  onClick={() => setActiveTab("my-learning")}
                >
                  View learning <ArrowRight size={16} />
                </button>
              </div>

              {dashboard.enrollments?.length ? (
                <div className="progress-list">
                  {dashboard.enrollments.slice(0, 3).map((enrollment) => (
                    <ProgressRow
                      key={enrollment.id}
                      enrollment={enrollment}
                      onQuiz={openQuiz}
                    />
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="Your learning journey starts here"
                  text="Enroll in a course to track your progress and take quizzes."
                  action="Explore courses"
                  onClick={() => setActiveTab("courses")}
                />
              )}
            </section>
          </>
        )}

        {activeTab === "courses" && (
          <section className="page-section">
            <div className="page-title">
              <div className="eyebrow">THE COURSE LIBRARY</div>
              <h1>
                Find your next <span>skill.</span>
              </h1>
              <p>
                Practical courses to help you grow one lesson at a time.
              </p>
            </div>

            <div className="search-wrap">
              <Search size={18} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search courses, topics or skills..."
              />
            </div>

            <div className="results-caption">
              {filteredCourses.length} courses to explore
            </div>

            <div className="course-grid">
              {filteredCourses.map((course) => (
                <CourseCard
                  key={course.id}
                  course={course}
                  enrolled={enrolledIds.has(course.id)}
                  onEnroll={enroll}
                  onQuiz={openQuiz}
                />
              ))}
            </div>

            {!filteredCourses.length && (
              <EmptyState
                title="No courses found"
                text="Try another search term."
                action="Clear search"
                onClick={() => setQuery("")}
              />
            )}
          </section>
        )}

        {activeTab === "my-learning" && (
          <section className="page-section">
            <div className="page-title">
              <div className="eyebrow">YOUR PROGRESS, AT A GLANCE</div>
              <h1>
                My <span>learning.</span>
              </h1>
              <p>Every completed lesson is a step forward.</p>
            </div>

            {dashboard.enrollments?.length ? (
              <div className="progress-list full-progress">
                {dashboard.enrollments.map((enrollment) => (
                  <ProgressRow
                    key={enrollment.id}
                    enrollment={enrollment}
                    onQuiz={openQuiz}
                  />
                ))}
              </div>
            ) : (
              <EmptyState
                title="No courses yet"
                text="Choose a course and start building your learning path."
                action="Explore courses"
                onClick={() => setActiveTab("courses")}
              />
            )}
          </section>
        )}

        <footer>
          Made for curious minds <span>✦</span> Keep learning, keep growing.
        </footer>
      </main>

      {quiz && (
        <div
          className="modal-backdrop"
          role="presentation"
          onClick={(e) => {
            if (e.target === e.currentTarget) setQuiz(null);
          }}
        >
          <section
            className="quiz-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Course quiz"
          >
            <div className="modal-head">
              <div>
                <span className="eyebrow">QUICK KNOWLEDGE CHECK</span>
                <h2>{quiz.title || quiz.course?.title}</h2>
              </div>
              <button
                className="icon-button"
                onClick={() => setQuiz(null)}
                aria-label="Close quiz"
              >
                <X size={20} />
              </button>
            </div>

            {quizResult ? (
              <div className="quiz-result">
                <div className="result-badge">
                  <Trophy size={30} />
                </div>

                <h2>{quizResult.percentage}%</h2>

                <p>
                  You answered {quizResult.score} out of {quizResult.total}{" "}
                  questions correctly.
                </p>

                <div className="result-summary">
                  <span>Correct: {quizResult.correctCount ?? quizResult.score}</span>
                  <span>
                    Incorrect:{" "}
                    {quizResult.incorrectCount ??
                      quizResult.total - quizResult.score}
                  </span>
                  <span>Attempt: {quizResult.attemptNumber ?? "—"} of 2</span>
                </div>

                <div className="result-feedback">
                  {quizResult.feedback ||
                    (quizResult.passed
                      ? "Congratulations! Course completed."
                      : "Keep practising and try again.")}
                </div>

                {quizResult.review?.length > 0 && (
                  <div className="answer-review">
                    <h3>Detailed answer review</h3>

                    {quizResult.review.map((item, index) => (
                      <div
                        className={`review-item ${
                          item.isCorrect ? "review-correct" : "review-incorrect"
                        }`}
                        key={item.questionId || index}
                      >
                        <strong>
                          {index + 1}. {item.question}
                        </strong>

                        <p>
                          <b>Your answer:</b>{" "}
                          {item.submittedAnswer || "Not answered"}
                        </p>

                        <p>
                          <b>Correct answer:</b>{" "}
                          {item.correctAnswer || "Not available"}
                        </p>

                        <span>
                          {item.isCorrect ? "Correct answer" : "Incorrect answer"}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                <button
                  className="primary-button"
                  onClick={() => {
                    setQuiz(null);
                    setQuizResult(null);
                  }}
                >
                  Back to learning <ArrowRight size={16} />
                </button>
              </div>
            ) : quiz.alreadyGiven ? (
              <div className="quiz-result">
                <div className="result-badge">
                  <X size={30} />
                </div>
                <h2>Attempts completed</h2>
                <p>
                  Test already given. You have used both attempts.
                </p>
                <button
                  className="primary-button"
                  onClick={() => setQuiz(null)}
                >
                  Back to learning
                </button>
              </div>
            ) : (
              <>
                <div className="quiz-progress">
                  <span>
                    {Object.keys(answers).length} of {quiz.questions.length}{" "}
                    answered
                  </span>
                  <span>
                    Attempts remaining: {quiz.attemptsRemaining ?? 2}
                  </span>
                  <div>
                    <i
                      style={{
                        width: `${
                          quiz.questions.length
                            ? (Object.keys(answers).length /
                                quiz.questions.length) *
                              100
                            : 0
                        }%`
                      }}
                    />
                  </div>
                </div>

                <div className="quiz-questions">
                  {quiz.questions.map((q, i) => (
                    <div className="quiz-question" key={q.id}>
                      <strong>
                        {i + 1}. {q.question}
                      </strong>

                      {q.type === "code" ? (
                        <textarea
                          className="code-answer"
                          rows={6}
                          placeholder="Write your code answer here..."
                          value={answers[q.id] ?? ""}
                          onChange={(e) =>
                            setAnswers((current) => ({
                              ...current,
                              [q.id]: e.target.value
                            }))
                          }
                        />
                      ) : (
                        <div className="options">
                          {(q.options || []).map((option, index) => (
                            <label
                              key={index}
                              className={
                                answers[q.id] === index ? "chosen" : ""
                              }
                            >
                              <input
                                type="radio"
                                name={`q-${q.id}`}
                                checked={answers[q.id] === index}
                                onChange={() =>
                                  setAnswers((current) => ({
                                    ...current,
                                    [q.id]: index
                                  }))
                                }
                              />
                              {option}
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <button
                  className="primary-button wide-button"
                  onClick={submitQuiz}
                  disabled={loading}
                >
                  Submit answers <ArrowRight size={16} />
                </button>
              </>
            )}
          </section>
        </div>
      )}

      {loading && (
        <div className="loading-chip">
          <span className="spinner" /> Loading learning space...
        </div>
      )}
    </div>
  );
}

function Stat({ icon: Icon, label, value, tint }) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tint}`}>
        <Icon size={19} />
      </div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      <div className="stat-spark">↗</div>
    </div>
  );
}

function CourseCard({ course, enrolled, onEnroll, onQuiz }) {
  return (
    <article className="course-card">
      <div className="course-card-top">
        <div className={`course-emoji ${course.category}`}>
          {course.icon}
        </div>
        <span className="level-pill">{course.level}</span>
      </div>

      <div className="course-category">{course.category}</div>
      <h3>{course.title}</h3>
      <p>{course.description}</p>

      <div className="skill-tags">
        {course.skills?.slice(0, 3).map((skill) => (
          <span key={skill}>{skill}</span>
        ))}
      </div>

      <div className="course-meta">
        <span>
          <Clock3 size={14} /> {course.duration}
        </span>
        <span>
          <BookOpen size={14} /> {course.lessons} lessons
        </span>
      </div>

      {course.matchScore && (
        <div className="match-reason">
          <Sparkles size={13} /> {course.reason}
          <strong>{course.matchScore}% match</strong>
        </div>
      )}

      <div className="course-actions">
        {enrolled ? (
          <button
            className="secondary-button"
            onClick={() => onQuiz(course)}
          >
            <Play size={15} /> Take quiz
          </button>
        ) : (
          <button
            className="primary-button"
            onClick={() => onEnroll(course)}
          >
            Start learning <ArrowRight size={15} />
          </button>
        )}
      </div>
    </article>
  );
}

function ProgressRow({ enrollment, onQuiz }) {
  const course = enrollment.course || {};
  const completed = Number(enrollment.progress) >= 100;

  return (
    <div className="progress-row">
      <div className={`progress-emoji ${course.category}`}>
        {course.icon || "📘"}
      </div>

      <div className="progress-course">
        <strong>{course.title}</strong>
        <span>
          {course.duration || "Self-paced"} ·{" "}
          {completed ? "Completed" : `${enrollment.progress || 0}% complete`}
        </span>
        <div className="progress-track">
          <i
            style={{
              width: `${Math.min(100, Number(enrollment.progress) || 0)}%`
            }}
          />
        </div>
      </div>

      <div className="progress-percent">
        {enrollment.progress || 0}%
      </div>

      <div className="progress-actions">
        {completed ? (
          <span className="completion-status">Completed</span>
        ) : (
          <button
            className="secondary-button"
            onClick={() => onQuiz(course)}
          >
            Take test
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ title, text, action, onClick }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">
        <BookOpen size={24} />
      </div>
      <h3>{title}</h3>
      <p>{text}</p>
      <button className="secondary-button" onClick={onClick}>
        {action} <ArrowRight size={15} />
      </button>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);