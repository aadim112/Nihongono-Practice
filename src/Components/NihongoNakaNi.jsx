import React, { useState, useEffect, useCallback } from "react";
import "./NihongoNakaNi.css";

const API = "https://nihongono-practice.onrender.com";

export default function NihongoNakaNi({ user, selectedLevel }) {
  const [passage, setPassage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [showGrammarHints, setShowGrammarHints] = useState(false);
  const [showVocabHints, setShowVocabHints] = useState(false);
  const [charCount, setCharCount] = useState(0);

  const userId = user ?? 0;

  // ── Format today's date nicely ───────────────────────────────────────
  const todayLabel = () => {
    const now = new Date();
    return now.toLocaleDateString("en-IN", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  // ── Fetch / load passage ─────────────────────────────────────────────
  const loadPassage = useCallback(
    async (force = false) => {
      setLoading(true);
      setChecked(false);
      setAnswer("");
      setCharCount(0);
      try {
        const res = await fetch(`${API}/api/nihongo-naka-ni/generate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: userId,
            level: selectedLevel || "N5",
            force: Boolean(force),
          }),
        });
        const data = await res.json();
        if (data.status === "success") {
          setPassage(data);
        } else {
          setPassage({ error: data.error || "Generation failed." });
        }
      } catch (e) {
        setPassage({
          error: "Cannot reach backend. Is Flask running on port 5000?",
        });
      } finally {
        setLoading(false);
      }
    },
    [userId, selectedLevel]
  );

  // Load on mount and when user/level changes
  useEffect(() => {
    loadPassage(false);
  }, [loadPassage]);

  const handleAnswerChange = (e) => {
    setAnswer(e.target.value);
    setCharCount(e.target.value.length);
  };

  const handleCheck = () => {
    if (!answer.trim()) return;
    setChecked(true);
  };

  const handleReset = () => {
    setAnswer("");
    setChecked(false);
    setCharCount(0);
  };

  // Helper to split multi-paragraph text
  const renderParagraphs = (text, className = "") => {
    if (!text) return null;
    return text.split("\n\n").map((para, idx) => (
      <p key={idx} className={className}>
        {para}
      </p>
    ));
  };

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div className="nnk-section">
      {/* Banner */}
      <div className="nnk-banner">
        <p className="nnk-banner__jp">日本語の中に</p>
        <p className="nnk-banner__en">
          Nihongo Naka Ni — Daily Contextual Translation Practice
        </p>
      </div>

      {/* Date & Control chip row */}
      <div className="nnk-date-row">
        <span className="nnk-date-chip">📅 {todayLabel()}</span>
        {passage && !passage.error && (
          <span
            className={`nnk-cache-badge ${
              passage.cached
                ? "nnk-cache-badge--cached"
                : "nnk-cache-badge--new"
            }`}
          >
            {passage.cached ? "✓ Saved Daily Passage" : "✨ Freshly Generated"}
          </span>
        )}
        <button
          className="nnk-refresh-btn"
          onClick={() => loadPassage(true)}
          disabled={loading}
          title="Regenerate a new passage for today"
        >
          ↻ New Passage
        </button>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="nnk-card nnk-loading-card">
          <div className="nnk-spinner" />
          <p>
            Loading your learned grammar and vocabulary from Firebase to create a
            passage…
          </p>
        </div>
      )}

      {/* Error */}
      {!loading && passage?.error && (
        <div className="nnk-card nnk-card--error">
          ⚠️ {passage.error}
          <button
            className="nnk-btn nnk-btn--ghost"
            onClick={() => loadPassage(false)}
            style={{ marginTop: 10 }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Main content */}
      {!loading && passage && !passage.error && (
        <>
          {/* English passage */}
          <div className="nnk-card">
            <div className="nnk-card__label">
              <span className="nnk-label-icon">🇬🇧</span>
              <span>English Passage — Read carefully, then translate into Japanese</span>
              <span className="nnk-level-tag">{passage.level}</span>
            </div>
            <div className="nnk-passage-body">
              {renderParagraphs(passage.english, "nnk-passage-p")}
            </div>
          </div>

          {/* Grammar & Vocab Hints */}
          <div className="nnk-card">
            <div className="nnk-hints-header-row">
              <button
                className="nnk-hints-toggle"
                onClick={() => setShowGrammarHints((v) => !v)}
              >
                <span>
                  💡 Learned Grammar Hints (
                  {(passage.grammar_hints || []).length} patterns)
                </span>
                <span
                  className={`nnk-chevron ${
                    showGrammarHints ? "nnk-chevron--open" : ""
                  }`}
                >
                  ▾
                </span>
              </button>

              <button
                className="nnk-hints-toggle"
                onClick={() => setShowVocabHints((v) => !v)}
              >
                <span>
                  📚 Learned Vocab Hints (
                  {(passage.vocab_hints || []).length} words)
                </span>
                <span
                  className={`nnk-chevron ${
                    showVocabHints ? "nnk-chevron--open" : ""
                  }`}
                >
                  ▾
                </span>
              </button>
            </div>

            {/* Grammar hints list */}
            {showGrammarHints && (
              <div className="nnk-hints-grid">
                {(passage.grammar_hints || []).map((h, i) => (
                  <div key={i} className="nnk-hint-chip">
                    <span className="nnk-hint-pattern">{h.pattern}</span>
                    <span className="nnk-hint-meaning">{h.meaning}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Vocab hints list */}
            {showVocabHints && (
              <div className="nnk-hints-grid">
                {(passage.vocab_hints || []).map((v, i) => (
                  <div key={i} className="nnk-hint-chip nnk-hint-chip--vocab">
                    <span className="nnk-hint-pattern">
                      {v.kanji || v.word}
                      {v.kanji && v.word && v.kanji !== v.word && (
                        <span className="nnk-hint-reading"> ({v.word})</span>
                      )}
                    </span>
                    <span className="nnk-hint-meaning">{v.meaning}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Answer textarea */}
          {!checked && (
            <div className="nnk-card">
              <div className="nnk-card__label">
                <span className="nnk-label-icon">🇯🇵</span>
                <span>Your Japanese Translation</span>
                <span className="nnk-char-count">{charCount} characters</span>
              </div>
              <textarea
                className="nnk-textarea"
                placeholder="ここに日本語の翻訳を書いてください（段落ごとに改行してください）…"
                value={answer}
                onChange={handleAnswerChange}
                rows={9}
                spellCheck={false}
              />
              <div className="nnk-action-row">
                <button
                  className="nnk-btn nnk-btn--primary"
                  onClick={handleCheck}
                  disabled={!answer.trim()}
                >
                  ✓ Check My Translation
                </button>
                <button
                  className="nnk-btn nnk-btn--ghost"
                  onClick={handleReset}
                  disabled={!answer}
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* Side-by-side comparison after checking */}
          {checked && (
            <>
              <div className="nnk-compare-grid">
                {/* User's translation */}
                <div className="nnk-card nnk-compare-card nnk-compare-card--user">
                  <div className="nnk-card__label">
                    <span className="nnk-label-icon">✏️</span>
                    <span>Your Translation</span>
                  </div>
                  <div className="nnk-compare-body">
                    {renderParagraphs(answer, "nnk-compare-p")}
                  </div>
                </div>

                {/* Reference translation */}
                <div className="nnk-card nnk-compare-card nnk-compare-card--ref">
                  <div className="nnk-card__label">
                    <span className="nnk-label-icon">📖</span>
                    <span>Reference Translation</span>
                  </div>
                  <div className="nnk-compare-body nnk-ref-body">
                    {renderParagraphs(passage.japanese, "nnk-compare-p nnk-ref-p")}
                  </div>
                </div>
              </div>

              {/* Grammar patterns & vocabulary used */}
              <div className="nnk-card">
                {(passage.grammar_used || []).length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div className="nnk-card__label" style={{ marginBottom: 8 }}>
                      <span className="nnk-label-icon">⛩️</span>
                      <span>Learned Grammar Patterns Used</span>
                    </div>
                    <div className="nnk-used-list">
                      {passage.grammar_used.map((p, i) => (
                        <span key={i} className="nnk-used-chip">
                          {p}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {(passage.vocab_used || []).length > 0 && (
                  <div>
                    <div className="nnk-card__label" style={{ marginBottom: 8 }}>
                      <span className="nnk-label-icon">📚</span>
                      <span>Learned Vocabulary Used</span>
                    </div>
                    <div className="nnk-used-list">
                      {passage.vocab_used.map((v, i) => (
                        <span
                          key={i}
                          className="nnk-used-chip nnk-used-chip--vocab"
                        >
                          {v}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Re-try / self-assess actions */}
              <div className="nnk-card nnk-action-card">
                <p className="nnk-self-assess-label">
                  Review how closely your structure matches the reference. Note the
                  particles (は, が, を, に, で) and verb forms used.
                </p>
                <div className="nnk-action-row">
                  <button
                    className="nnk-btn nnk-btn--primary"
                    onClick={handleReset}
                  >
                    ↺ Try Again
                  </button>
                  <button
                    className="nnk-btn nnk-btn--ghost"
                    onClick={() => {
                      setChecked(false);
                    }}
                  >
                    Edit My Answer
                  </button>
                  <button
                    className="nnk-btn nnk-btn--ghost"
                    onClick={() => loadPassage(true)}
                  >
                    ↻ Try a New Passage
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
