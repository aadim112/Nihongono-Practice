import React, { useState, useRef, useEffect, useCallback } from "react";
import "./ListeningSection.css";

const FIREBASE_URL = "https://japanese-practice-bdcce-default-rtdb.firebaseio.com";

export default function ListeningSection({ user, selectedLevel }) {
  const [exercise, setExercise]     = useState(null);
  const [loading, setLoading]       = useState(false);
  const [selected, setSelected]     = useState(null);
  const [answered, setAnswered]     = useState(false);
  const [showScript, setShowScript] = useState(false);
  const [grammarConf, setGrammarConf] = useState({});

  // ── Speech state ──────────────────────────────────────────────────────
  const [speechActive, setSpeechActive]   = useState(false);
  const [speechTurnIdx, setSpeechTurnIdx] = useState(-1);   // which turn is playing
  const [speechDone, setSpeechDone]       = useState(false);
  const speechCancelRef = useRef(false);

  // ── Backend MP3 (bonus if Cloud TTS key is enabled) ──────────────────
  const audioRef = useRef(null);
  const [audioTime, setAudioTime]         = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [audioPlaying, setAudioPlaying]   = useState(false);
  const [audioReady, setAudioReady]       = useState(false);
  const [hasBackendAudio, setHasBackendAudio] = useState(false);

  const userId = user ?? 0;

  // ── Fetch grammar confidence from Firebase ────────────────────────────
  const fetchGrammarConf = useCallback(async () => {
    try {
      const res = await fetch(`${FIREBASE_URL}/${userId}/grammar/grammarConfidence.json`);
      if (res.ok) { const d = await res.json(); setGrammarConf(d || {}); }
    } catch (_) {}
  }, [userId]);

  useEffect(() => { fetchGrammarConf(); }, [fetchGrammarConf]);

  // ── Stop everything ───────────────────────────────────────────────────
  const stopAll = useCallback(() => {
    // Stop Web Speech
    speechCancelRef.current = true;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeechActive(false);
    setSpeechTurnIdx(-1);
    setSpeechDone(false);

    // Stop MP3
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    setAudioTime(0);
    setAudioDuration(0);
    setAudioPlaying(false);
    setAudioReady(false);
    setHasBackendAudio(false);
  }, []);

  // ── Load backend MP3 ──────────────────────────────────────────────────
  const loadBackendAudio = useCallback((b64) => {
    if (!b64) return;
    try {
      const blob = base64ToBlob(b64, "audio/mp3");
      const url  = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = 1.0;
      audio.onloadedmetadata = () => { setAudioDuration(audio.duration); setAudioReady(true); };
      audio.ontimeupdate = () => setAudioTime(audio.currentTime);
      audio.onplay  = () => setAudioPlaying(true);
      audio.onpause = () => setAudioPlaying(false);
      audio.onended = () => { setAudioPlaying(false); setAudioTime(0); };
      audioRef.current = audio;
      setHasBackendAudio(true);
    } catch (_) {}
  }, []);

  // ── Web Speech API ────────────────────────────────────────────────────
  const getJapaneseVoice = () => {
    const voices = window.speechSynthesis?.getVoices() || [];
    return (
      voices.find(v => v.lang === "ja-JP" && v.localService) ||
      voices.find(v => v.lang === "ja-JP") ||
      voices.find(v => v.lang.startsWith("ja")) ||
      null
    );
  };

  /**
   * Speak an array of script parts sequentially.
   * Each part: { text, isMale }
   */
  const speakSequentially = useCallback((parts, onTurnChange, onDone) => {
    speechCancelRef.current = false;
    let idx = 0;

    const speakNext = () => {
      if (speechCancelRef.current || idx >= parts.length) {
        setSpeechActive(false);
        setSpeechTurnIdx(-1);
        setSpeechDone(true);
        onDone && onDone();
        return;
      }

      const part = parts[idx];
      const utt  = new SpeechSynthesisUtterance(part.text);
      utt.lang  = "ja-JP";
      utt.rate  = 0.82;
      utt.pitch = part.isMale ? 0.75 : 1.2;
      utt.volume = 1.0;

      const voice = getJapaneseVoice();
      if (voice) utt.voice = voice;

      onTurnChange && onTurnChange(part.turnIdx ?? -1);

      utt.onend = () => {
        idx++;
        // Small pause between turns
        setTimeout(speakNext, part.pause ?? 700);
      };

      utt.onerror = () => {
        idx++;
        setTimeout(speakNext, 200);
      };

      window.speechSynthesis.speak(utt);
    };

    setSpeechActive(true);
    setSpeechDone(false);
    speakNext();
  }, []);

  const buildScriptParts = useCallback((ex) => {
    const parts = [];
    if (ex.situation) {
      parts.push({ text: ex.situation, isMale: false, turnIdx: -1, pause: 1200 });
    }
    (ex.dialogue || []).forEach((turn, i) => {
      parts.push({
        text: turn.japanese,
        isMale: turn.speaker?.includes("男"),
        turnIdx: i,
        pause: 900,
      });
    });
    if (ex.question) {
      parts.push({ text: `質問。${ex.question}`, isMale: false, turnIdx: -2, pause: 0 });
    }
    return parts;
  }, []);

  const handlePlaySpeech = useCallback(() => {
    if (!exercise || exercise.error) return;
    if (speechActive) {
      speechCancelRef.current = true;
      window.speechSynthesis.cancel();
      setSpeechActive(false);
      setSpeechTurnIdx(-1);
      return;
    }
    const parts = buildScriptParts(exercise);
    speakSequentially(parts, setSpeechTurnIdx, () => {});
  }, [exercise, speechActive, buildScriptParts, speakSequentially]);

  const handleReplaySpeech = useCallback(() => {
    speechCancelRef.current = true;
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    setSpeechActive(false);
    setSpeechTurnIdx(-1);
    setTimeout(() => {
      const parts = buildScriptParts(exercise);
      speakSequentially(parts, setSpeechTurnIdx, () => {});
    }, 200);
  }, [exercise, buildScriptParts, speakSequentially]);

  // ── Backend MP3 controls ──────────────────────────────────────────────
  const toggleBackendAudio = () => {
    if (!audioRef.current || !audioReady) return;
    if (audioPlaying) audioRef.current.pause();
    else audioRef.current.play();
  };

  const handleSeek = (e) => {
    if (!audioRef.current || !audioDuration) return;
    const t = parseFloat(e.target.value);
    audioRef.current.currentTime = t;
    setAudioTime(t);
  };

  const replayBackendAudio = () => {
    if (!audioRef.current) return;
    audioRef.current.currentTime = 0;
    audioRef.current.play();
  };

  const fmtTime = (s) => {
    if (!s || isNaN(s)) return "0:00";
    const m = Math.floor(s / 60);
    return `${m}:${Math.floor(s % 60).toString().padStart(2, "0")}`;
  };

  // ── Generate exercise ─────────────────────────────────────────────────
  const generateExercise = useCallback(async () => {
    stopAll();
    setExercise(null);
    setSelected(null);
    setAnswered(false);
    setShowScript(false);
    setLoading(true);

    try {
      const res = await fetch("http://localhost:5000/api/listening/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, level: selectedLevel || "N5" }),
      });
      const data = await res.json();
      if (data.status === "success") {
        setExercise(data);
        if (data.audio) loadBackendAudio(data.audio);
        await fetchGrammarConf();
      } else {
        setExercise({ error: data.error || "Generation failed" });
      }
    } catch (e) {
      setExercise({ error: "Cannot reach backend. Is Flask running on port 5000?" });
    } finally {
      setLoading(false);
    }
  }, [userId, selectedLevel, stopAll, loadBackendAudio, fetchGrammarConf]);

  // ── Answer ────────────────────────────────────────────────────────────
  const handleAnswer = async (idx) => {
    if (answered || !exercise) return;
    setSelected(idx);
    setAnswered(true);

    const delta      = idx === exercise.correct_option ? 20 : -10;
    const grammarIds = exercise.grammar_ids_used || [];
    if (grammarIds.length > 0) {
      try {
        const res = await fetch("http://localhost:5000/api/listening/update-grammar-confidence", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ user_id: userId, grammar_ids: grammarIds, delta }),
        });
        const d = await res.json();
        if (d.updated) setGrammarConf(d.updated);
      } catch (_) {}
    }
  };

  // ── Speaker helpers ───────────────────────────────────────────────────
  const speakerAvatar = (s) => {
    if (s?.includes("男")) return "🧑";
    if (s?.includes("女")) return "👩";
    return "👤";
  };
  const speakerClass = (s) => {
    if (s?.includes("男")) return "ls-turn--male";
    if (s?.includes("女")) return "ls-turn--female";
    return "";
  };

  // ── Confidence colour ─────────────────────────────────────────────────
  const confColor = (c) => c >= 200 ? "#16a34a" : c >= 80 ? "#d97706" : "#c5050c";
  const confLabel = (c) => c >= 200 ? "Strong"  : c >= 80 ? "Learning" : "Weak";

  // ── Total turns for speech progress ──────────────────────────────────
  const totalTurns = (exercise?.dialogue || []).length;
  const speechProgress = speechTurnIdx >= 0
    ? Math.round(((speechTurnIdx + 1) / Math.max(totalTurns, 1)) * 100)
    : speechTurnIdx === -2 ? 100 : 0;

  // ─────────────────────────────────────────────────────────────────────
  return (
    <div className="ls-section">

      {/* Banner */}
      <div className="ls-banner">
        <p className="ls-banner__jp">聴解練習</p>
        <p className="ls-banner__en">JLPT Listening Comprehension — {selectedLevel || "N5"}</p>
      </div>

      {/* Generate */}
      <div className="ls-card">
        <button
          className="ls-btn ls-btn--primary ls-btn--full"
          onClick={generateExercise}
          disabled={loading}
        >
          {loading ? <span className="ls-spinner" /> : exercise ? "▶ Next Question" : "▶ Start Listening Practice"}
        </button>
      </div>

      {/* Error */}
      {exercise?.error && (
        <div className="ls-card ls-card--error">
          ⚠️ {exercise.error}
        </div>
      )}

      {exercise && !exercise.error && (
        <>
          {/* Situation */}
          <div className="ls-card">
            <div className="ls-section-label">📍 Situation</div>
            <p className="ls-situation">{exercise.situation}</p>
          </div>

          {/* ─── Audio Player ────────────────────────────── */}
          <div className="ls-card">
            <div className="ls-section-label">🎧 Listen</div>
            <div className="ls-audio">

              {/* ── Primary: HD Neural Audio from edge-tts ── */}
              {hasBackendAudio ? (
                <div className="ls-audio__controls">
                  <button
                    className="ls-audio__play-btn"
                    onClick={toggleBackendAudio}
                    disabled={!audioReady}
                    title={audioPlaying ? "Pause" : "Play"}
                  >
                    {audioPlaying ? "⏸" : "▶"}
                  </button>
                  <button
                    className="ls-audio__replay-btn"
                    onClick={replayBackendAudio}
                    disabled={!audioReady}
                    title="Replay from start"
                  >
                    ↺
                  </button>
                  <div className="ls-audio__progress-wrap">
                    <input
                      type="range"
                      className="ls-audio__seekbar"
                      min={0}
                      max={audioDuration || 1}
                      step={0.1}
                      value={audioTime}
                      onChange={handleSeek}
                      disabled={!audioReady}
                    />
                  </div>
                  <span className="ls-audio__time">
                    {audioReady
                      ? `${fmtTime(audioTime)} / ${fmtTime(audioDuration)}`
                      : "Loading…"}
                  </span>
                </div>
              ) : (
                /* ── Fallback: Browser TTS while audio loads / if unavailable ── */
                <>
                  <p className="ls-audio__loading">⏳ Generating neural audio…</p>
                  <div className="ls-audio__controls">
                    <button
                      className="ls-audio__play-btn"
                      onClick={handlePlaySpeech}
                      title={speechActive ? "Stop" : "Play (Browser TTS)"}
                    >
                      {speechActive ? "⏹" : "▶"}
                    </button>
                    <button
                      className="ls-audio__replay-btn"
                      onClick={handleReplaySpeech}
                      disabled={!exercise}
                      title="Replay"
                    >
                      ↺
                    </button>
                    <div className="ls-audio__progress-wrap">
                      <div className="ls-audio__tts-bar-bg">
                        <div
                          className="ls-audio__tts-bar-fill"
                          style={{ width: speechActive || speechDone ? `${speechProgress}%` : "0%" }}
                        />
                      </div>
                    </div>
                    <span className="ls-audio__time">
                      {speechActive
                        ? speechTurnIdx === -2 ? "Question" : speechTurnIdx >= 0 ? `Turn ${speechTurnIdx + 1}/${totalTurns}` : "Intro…"
                        : speechDone ? "Done ✓" : "Browser TTS (fallback)"}
                    </span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Dialogue Script */}

          <div className="ls-card">
            <div className="ls-card__header">
              <div className="ls-section-label">💬 Dialogue Script</div>
              <button
                className="ls-btn ls-btn--ghost ls-btn--sm"
                onClick={() => setShowScript(v => !v)}
              >
                {showScript ? "Hide" : "Show"} Script
              </button>
            </div>

            {showScript && (
              <div className="ls-dialogue">
                {(exercise.dialogue || []).map((turn, i) => (
                  <div
                    key={i}
                    className={`ls-turn ${speakerClass(turn.speaker)} ${speechTurnIdx === i ? "ls-turn--active" : ""}`}
                  >
                    <div className="ls-turn__avatar">{speakerAvatar(turn.speaker)}</div>
                    <div className="ls-turn__body">
                      <div className="ls-turn__speaker">{turn.speaker}</div>
                      <div className="ls-turn__jp">{turn.japanese}</div>
                      <div className="ls-turn__reading">{turn.reading}</div>
                      <div className="ls-turn__en">{turn.english}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Question */}
          <div className="ls-card">
            <div className="ls-section-label">❓ Question</div>
            <p className="ls-question">{exercise.question}</p>
          </div>

          {/* Options */}
          <div className="ls-card">
            <div className="ls-section-label">📝 Choose an Answer</div>
            <div className="ls-options">
              {(exercise.options || []).map((opt, i) => {
                let cls = "ls-option";
                if (answered) {
                  if (i === exercise.correct_option) cls += " ls-option--correct";
                  else if (i === selected)            cls += " ls-option--wrong";
                  else                                cls += " ls-option--dim";
                } else if (i === selected) {
                  cls += " ls-option--selected";
                }
                return (
                  <button key={i} className={cls} onClick={() => handleAnswer(i)} disabled={answered}>
                    <span className="ls-option__badge">{String.fromCharCode(65 + i)}</span>
                    <span className="ls-option__text">{opt}</span>
                    {answered && i === exercise.correct_option && <span className="ls-option__icon">✓</span>}
                    {answered && i === selected && i !== exercise.correct_option && <span className="ls-option__icon">✗</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Feedback */}
          {answered && (
            <div className={`ls-card ls-feedback ${selected === exercise.correct_option ? "ls-feedback--correct" : "ls-feedback--wrong"}`}>
              <div className="ls-feedback__header">
                {selected === exercise.correct_option ? "🎉 Correct! Well done!" : "❌ Not quite. Review below."}
              </div>
              <p className="ls-feedback__explanation">{exercise.explanation}</p>
              <button className="ls-btn ls-btn--primary" onClick={generateExercise} style={{ marginTop: "12px" }}>
                ▶ Next Question
              </button>
            </div>
          )}

          {/* Grammar confidence */}
          {exercise.grammar_ids_used?.length > 0 && (
            <div className="ls-card">
              <div className="ls-section-label">📖 Grammar Patterns in This Conversation</div>
              <div className="ls-grammar-list">
                {exercise.grammar_ids_used.map((gid) => {
                  const score = grammarConf[gid] ?? 0;
                  return (
                    <div key={gid} className="ls-grammar-item">
                      <div className="ls-grammar-item__id">{gid}</div>
                      <div className="ls-grammar-item__bar-wrap">
                        <div className="ls-grammar-item__bar" style={{ width: `${Math.min(100, (score / 500) * 100)}%`, background: confColor(score) }} />
                      </div>
                      <div className="ls-grammar-item__score" style={{ color: confColor(score) }}>
                        {score} <span className="ls-grammar-item__label">({confLabel(score)})</span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {answered && (
                <p className="ls-grammar-note">
                  {selected === exercise.correct_option ? "✅ +20 confidence added to grammar patterns." : "⚠️ −10 confidence removed. Keep practising!"}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function base64ToBlob(b64, mimeType) {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}
