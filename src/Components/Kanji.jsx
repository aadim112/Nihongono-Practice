import './Kanji.css';
import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ref, onValue, update, set } from 'firebase/database';
import db from './firebase';
import kanjiCatalog from '../data/kanjiCatalog.json';
import {
  isKanji,
  getKanjisInText,
  getKanjiDetails,
  getKanjisByLevel,
  isVocabReadableWithLearnedKanji,
  getRelatedVocabsForKanji,
  getUnlockedVocabs,
  calculateNextKanjiReview,
  computeKnowledgeAnalytics,
} from '../utils/kanjiEngine';

const Kanji = ({ user = 0, selectedLevel = 'N5' }) => {
  // Navigation & View Mode
  // 'flashcards' | 'vocab_practice' | 'manage_kanjis' | 'analytics'
  const [activeSubTab, setActiveSubTab] = useState('flashcards');

  // Firebase Data States
  const [learnedKanjis, setLearnedKanjis] = useState({});
  const [allVocabs, setAllVocabs] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Flashcard Practice States
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [showVocab, setShowVocab] = useState(false);
  const [selectedDifficulty, setSelectedDifficulty] = useState(null);
  const [cardFilter, setCardFilter] = useState('all'); // 'all' | 'due' | 'N5' | 'N4' | 'N3' | 'struggling'
  const [isAudioPlaying, setIsAudioPlaying] = useState(false);

  // Vocab Practice Sub-mode States
  const [vocabCardIndex, setVocabCardIndex] = useState(0);
  const [isVocabFlipped, setIsVocabFlipped] = useState(false);

  // Catalog / Manage Kanjis States
  const [catalogLevelTab, setCatalogLevelTab] = useState(selectedLevel || 'N5');
  const [searchQuery, setSearchQuery] = useState('');
  const [customKanjiInput, setCustomKanjiInput] = useState('');
  const [notification, setNotification] = useState(null);

  const containerRef = useRef(null);

  // Show transient toast notifications
  const notify = useCallback((msg, type = 'info') => {
    setNotification({ message: msg, type });
    setTimeout(() => {
      setNotification(null);
    }, 3500);
  }, []);

  // 1. Fetch Vocabulary from Firebase for current user
  useEffect(() => {
    const vocabRef = ref(db, `${user}/vocab`);
    const unsubscribeVocab = onValue(vocabRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        let list = [];
        if (Array.isArray(data)) {
          list = data.filter(Boolean);
        } else if (Array.isArray(data.words)) {
          list = data.words.filter(Boolean);
        } else if (typeof data === 'object') {
          list = Object.values(data).filter((w) => w && typeof w === 'object' && (w.word || w.meaning));
        }
        setAllVocabs(list);
      } else {
        setAllVocabs([]);
      }
    });

    return () => unsubscribeVocab();
  }, [user]);

  // 2. Fetch Learned Kanjis & Progress from Firebase
  useEffect(() => {
    setIsLoading(true);
    const kanjiLearningRef = ref(db, `${user}/kanjiLearning`);

    const unsubscribeKanji = onValue(kanjiLearningRef, (snapshot) => {
      if (snapshot.exists()) {
        const val = snapshot.val();
        const learned = val?.learnedKanjis || {};
        setLearnedKanjis(learned);
        setIsLoading(false);
      } else {
        // Check legacy path `${user}/kanji` for migration
        const legacyRef = ref(db, `${user}/kanji`);
        onValue(
          legacyRef,
          (legacySnap) => {
            if (legacySnap.exists()) {
              const legacyData = legacySnap.val();
              const migrated = {};
              Object.keys(legacyData).forEach((k) => {
                const details = getKanjiDetails(k);
                migrated[k] = {
                  character: k,
                  meaning: details?.meaning || 'Known Kanji',
                  level: details?.level || 'N5',
                  score: 50,
                  streak: 1,
                  reviews: 1,
                  status: 'learning',
                  addedAt: Date.now(),
                };
              });
              // Save migrated
              update(ref(db, `${user}/kanjiLearning`), {
                learnedKanjis: migrated,
                migratedFromLegacy: true,
              }).catch(() => {});
              setLearnedKanjis(migrated);
            } else {
              setLearnedKanjis({});
            }
            setIsLoading(false);
          },
          { onlyOnce: true }
        );
      }
    });

    return () => unsubscribeKanji();
  }, [user]);

  // Set of learned kanji characters
  const learnedKanjiSet = useMemo(() => {
    return new Set(Object.keys(learnedKanjis));
  }, [learnedKanjis]);

  // Smart Knowledge Analytics
  const analytics = useMemo(() => {
    return computeKnowledgeAnalytics(learnedKanjis, allVocabs, kanjiCatalog);
  }, [learnedKanjis, allVocabs]);

  // Filtered list of kanji cards for Anki session
  const practiceCards = useMemo(() => {
    const list = Object.values(learnedKanjis);
    const now = Date.now();

    let filtered = list;

    if (cardFilter === 'due') {
      filtered = list.filter((k) => !k.nextReview || k.nextReview <= now);
    } else if (cardFilter === 'struggling') {
      filtered = list.filter((k) => (Number(k.score) || 0) < 50);
    } else if (['N5', 'N4', 'N3'].includes(cardFilter)) {
      filtered = list.filter((k) => (k.level || 'N5').toUpperCase() === cardFilter);
    }

    // Attach catalog details and STRICTLY filtered related vocabs
    return filtered.map((item) => {
      const details = getKanjiDetails(item.character);
      // STRICT FILTER: vocabulary words must contain item.character
      // AND 100% of the kanjis in that word must be in learnedKanjiSet!
      const relatedVocabs = getRelatedVocabsForKanji(item.character, allVocabs, learnedKanjiSet);

      return {
        ...details,
        ...item,
        relatedVocabs,
      };
    });
  }, [learnedKanjis, cardFilter, allVocabs, learnedKanjiSet]);

  // Reset current index if list size changes
  useEffect(() => {
    if (currentIndex >= practiceCards.length) {
      setCurrentIndex(0);
    }
  }, [practiceCards.length, currentIndex]);

  // Unlocked vocabulary words for Vocab Practice mode
  const unlockedVocabList = useMemo(() => {
    return getUnlockedVocabs(allVocabs, learnedKanjiSet, false);
  }, [allVocabs, learnedKanjiSet]);

  // Speak Japanese audio using Web Speech API
  const speakText = (text) => {
    if (!('speechSynthesis' in window) || !text) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'ja-JP';
      utterance.rate = 0.9;
      setIsAudioPlaying(true);
      utterance.onend = () => setIsAudioPlaying(false);
      utterance.onerror = () => setIsAudioPlaying(false);
      window.speechSynthesis.speak(utterance);
    } catch {
      setIsAudioPlaying(false);
    }
  };

  // Flip Card Handler
  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => {
      const next = !prev;
      if (next) {
        setTimeout(() => setShowVocab(true), 150);
      } else {
        setShowVocab(false);
      }
      return next;
    });
  }, []);

  // Card Navigation
  const nextCard = useCallback(() => {
    if (practiceCards.length === 0) return;
    setIsFlipped(false);
    setShowVocab(false);
    setSelectedDifficulty(null);
    setCurrentIndex((prev) => (prev + 1) % practiceCards.length);
  }, [practiceCards.length]);

  const prevCard = useCallback(() => {
    if (practiceCards.length === 0) return;
    setIsFlipped(false);
    setShowVocab(false);
    setSelectedDifficulty(null);
    setCurrentIndex((prev) => (prev - 1 + practiceCards.length) % practiceCards.length);
  }, [practiceCards.length]);

  // Anki Difficulty Rating Handler (Again, Hard, Good, Easy)
  const handleRateCard = useCallback(
    async (rating) => {
      if (practiceCards.length === 0) return;
      const currentCard = practiceCards[currentIndex];
      if (!currentCard || !currentCard.character) return;

      setSelectedDifficulty(rating);

      // Compute new score and SRS parameters
      const updatedData = calculateNextKanjiReview(currentCard, rating);

      // 1. Update local state immediately
      setLearnedKanjis((prev) => ({
        ...prev,
        [currentCard.character]: updatedData,
      }));

      // 2. Persist to Firebase Realtime Database
      try {
        const kanjiPath = `${user}/kanjiLearning/learnedKanjis/${currentCard.character}`;
        await update(ref(db, kanjiPath), updatedData);

        // Record consistency activity for today
        const todayStr = new Date().toISOString().slice(0, 10);
        const consistencyPath = `${user}/Consistency/${todayStr}`;
        const consRef = ref(db, consistencyPath);
        // Fire and forget streak update
        update(ref(db, `${user}/Consistency`), { [todayStr]: 1 }).catch(() => {});

        // Backward-compatible sync with ${user}/kanji
        if (currentCard.relatedVocabs && currentCard.relatedVocabs.length > 0) {
          update(ref(db, `${user}/kanji`), {
            [currentCard.character]: currentCard.relatedVocabs.map((v) => ({
              kanji: v.kanji,
              word: v.word,
              meaning: v.meaning,
            })),
          }).catch(() => {});
        }
      } catch (err) {
        console.error('Error saving kanji score:', err);
      }

      // Automatically advance to next card after brief feedback
      setTimeout(() => {
        nextCard();
      }, 350);
    },
    [practiceCards, currentIndex, user, nextCard]
  );

  // Keyboard navigation for Anki cards
  useEffect(() => {
    if (activeSubTab !== 'flashcards') return;

    const handleKeyDown = (e) => {
      // Avoid triggering when user is typing in search/input
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

      if (e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        handleFlip();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextCard();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevCard();
      } else if (isFlipped) {
        if (e.key === '1') handleRateCard('again');
        else if (e.key === '2') handleRateCard('hard');
        else if (e.key === '3') handleRateCard('good');
        else if (e.key === '4') handleRateCard('easy');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeSubTab, isFlipped, handleFlip, nextCard, prevCard, handleRateCard]);

  // Bulk Add / Unlock All Kanjis for a Level
  const handleUnlockLevel = async (level) => {
    const kanjisInLevel = getKanjisByLevel(level);
    if (!kanjisInLevel || kanjisInLevel.length === 0) return;

    const updates = {};
    const updatedLocal = { ...learnedKanjis };
    let newlyAddedCount = 0;

    kanjisInLevel.forEach((k) => {
      if (!learnedKanjis[k.character]) {
        newlyAddedCount += 1;
        const entry = {
          character: k.character,
          meaning: k.meaning,
          level: k.level,
          score: 30, // Initial learning score
          streak: 0,
          reviews: 0,
          status: 'new',
          addedAt: Date.now(),
        };
        updates[`${user}/kanjiLearning/learnedKanjis/${k.character}`] = entry;
        updatedLocal[k.character] = entry;
      }
    });

    if (newlyAddedCount === 0) {
      notify(`All ${level} kanjis are already in your learned list!`, 'info');
      return;
    }

    try {
      await update(ref(db), updates);
      setLearnedKanjis(updatedLocal);
      notify(`Successfully unlocked ${newlyAddedCount} kanjis from ${level}! 🎉`, 'success');
    } catch (err) {
      console.error('Error unlocking level:', err);
      notify('Failed to unlock kanjis. Please try again.', 'error');
    }
  };

  // Toggle Single Kanji Learned Status
  const handleToggleKanji = async (kanjiItem) => {
    const char = kanjiItem.character;
    const isCurrentlyLearned = !!learnedKanjis[char];

    if (isCurrentlyLearned) {
      // Remove from learned
      const updatedLocal = { ...learnedKanjis };
      delete updatedLocal[char];
      setLearnedKanjis(updatedLocal);

      try {
        await set(ref(db, `${user}/kanjiLearning/learnedKanjis/${char}`), null);
        notify(`Removed "${char}" from learned kanjis.`, 'info');
      } catch (err) {
        console.error('Error removing kanji:', err);
      }
    } else {
      // Add to learned
      const entry = {
        character: char,
        meaning: kanjiItem.meaning || 'Learned Kanji',
        level: kanjiItem.level || catalogLevelTab,
        score: 30,
        streak: 0,
        reviews: 0,
        status: 'new',
        addedAt: Date.now(),
      };

      setLearnedKanjis((prev) => ({
        ...prev,
        [char]: entry,
      }));

      try {
        await update(ref(db, `${user}/kanjiLearning/learnedKanjis/${char}`), entry);
        notify(`Added "${char}" (${kanjiItem.meaning}) to learned kanjis! ✨`, 'success');
      } catch (err) {
        console.error('Error adding kanji:', err);
      }
    }
  };

  // Add Custom Kanji Input
  const handleAddCustomKanji = async () => {
    const raw = customKanjiInput.trim();
    if (!raw) return;

    const kanjisFound = getKanjisInText(raw);
    if (kanjisFound.length === 0) {
      notify('Please enter at least one valid Japanese Kanji character.', 'error');
      return;
    }

    const updates = {};
    const updatedLocal = { ...learnedKanjis };

    kanjisFound.forEach((char) => {
      const details = getKanjiDetails(char);
      const entry = {
        character: char,
        meaning: details?.meaning || 'Custom Kanji',
        level: details?.level || 'Custom',
        score: 30,
        streak: 0,
        reviews: 0,
        status: 'new',
        addedAt: Date.now(),
      };
      updates[`${user}/kanjiLearning/learnedKanjis/${char}`] = entry;
      updatedLocal[char] = entry;
    });

    try {
      await update(ref(db), updates);
      setLearnedKanjis(updatedLocal);
      setCustomKanjiInput('');
      notify(`Added ${kanjisFound.length} custom kanji to your learned list!`, 'success');
    } catch (err) {
      console.error('Error adding custom kanji:', err);
    }
  };

  // Current Card to Display
  const currentCard = practiceCards[currentIndex];

  // Helper for score badge color
  const getScoreColorClass = (score) => {
    const n = Number(score) || 0;
    if (n >= 80) return 'score-mastered';
    if (n >= 40) return 'score-learning';
    return 'score-struggling';
  };

  return (
    <div className="KanjiComponentRoot" ref={containerRef}>
      {/* Toast Notification */}
      {notification && (
        <div className={`KanjiToast notification-${notification.type}`}>
          <span>{notification.message}</span>
        </div>
      )}

      {/* Top Header & Smart Knowledge Bar */}
      <header className="KanjiHeaderBox">
        <div className="KanjiTitleRow">
          <div className="TitleWithIcon">
            <span className="HeaderIcon">🈸</span>
            <div>
              <h1 className="KanjiTitleText">Kanji Practice & Vocab Scaffolding</h1>
              <p className="KanjiSubtitleText">
                Smart personalized Anki SRS revision • Vocab strictly limited to your learned kanjis
              </p>
            </div>
          </div>

          {/* Quick Sub-Tab Switcher */}
          <div className="KanjiSubNavTabs">
            <button
              className={`SubTabBtn ${activeSubTab === 'flashcards' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('flashcards')}
            >
              🃏 Anki Flashcards
            </button>
            <button
              className={`SubTabBtn ${activeSubTab === 'vocab_practice' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('vocab_practice')}
            >
              📖 Unlocked Vocab ({analytics.unlockedVocabCount})
            </button>
            <button
              className={`SubTabBtn ${activeSubTab === 'manage_kanjis' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('manage_kanjis')}
            >
              ➕ Manage Kanjis
            </button>
            <button
              className={`SubTabBtn ${activeSubTab === 'analytics' ? 'active' : ''}`}
              onClick={() => setActiveSubTab('analytics')}
            >
              📊 Knowledge Matrix
            </button>
          </div>
        </div>

        {/* Live Knowledge Metrics Bar */}
        <div className="SmartMetricsBar">
          <div className="MetricItem">
            <span className="MetricValue">{analytics.totalLearned}</span>
            <span className="MetricLabel">Learned Kanjis</span>
          </div>
          <div className="MetricDivider" />
          <div className="MetricItem">
            <span className="MetricValue">{analytics.averageScore}%</span>
            <span className="MetricLabel">Mastery Score</span>
          </div>
          <div className="MetricDivider" />
          <div className="MetricItem">
            <span className="MetricValue highlight-unlocked">{analytics.unlockedVocabCount}</span>
            <span className="MetricLabel">Unlocked Vocab (from {analytics.totalVocabs})</span>
          </div>
          <div className="MetricDivider" />
          <div className="MetricItem">
            <span className="MetricValue highlight-due">{analytics.dueCount}</span>
            <span className="MetricLabel">Due for Review</span>
          </div>
        </div>
      </header>

      {/* ============================================================ */}
      {/* VIEW 1: ANKI FLASHCARDS MODE                                 */}
      {/* ============================================================ */}
      {activeSubTab === 'flashcards' && (
        <div className="KanjiFlashcardsView">
          {/* Card Filter Bar */}
          <div className="CardFilterBar">
            <div className="FilterButtonGroup">
              <button
                className={`FilterBtn ${cardFilter === 'all' ? 'active' : ''}`}
                onClick={() => setCardFilter('all')}
              >
                All Learned ({analytics.totalLearned})
              </button>
              <button
                className={`FilterBtn ${cardFilter === 'due' ? 'active' : ''}`}
                onClick={() => setCardFilter('due')}
              >
                Due for Review ({analytics.dueCount})
              </button>
              <button
                className={`FilterBtn ${cardFilter === 'N5' ? 'active' : ''}`}
                onClick={() => setCardFilter('N5')}
              >
                N5 ({analytics.levelCounts.N5.learned})
              </button>
              <button
                className={`FilterBtn ${cardFilter === 'N4' ? 'active' : ''}`}
                onClick={() => setCardFilter('N4')}
              >
                N4 ({analytics.levelCounts.N4.learned})
              </button>
              <button
                className={`FilterBtn ${cardFilter === 'struggling' ? 'active' : ''}`}
                onClick={() => setCardFilter('struggling')}
              >
                Needs Review ({analytics.strugglingCount})
              </button>
            </div>

            {practiceCards.length > 0 && (
              <div className="CardCounterPill">
                Card <strong>{currentIndex + 1}</strong> of <strong>{practiceCards.length}</strong>
              </div>
            )}
          </div>

          {/* Empty State when no kanji learned or matches filter */}
          {practiceCards.length === 0 ? (
            <div className="EmptyKanjiState">
              <div className="EmptyStateIcon">⛩️</div>
              <h2>
                {analytics.totalLearned === 0
                  ? 'No Kanjis Added to Practice Yet'
                  : 'No Kanjis Match Current Filter'}
              </h2>
              <p>
                {analytics.totalLearned === 0
                  ? 'Get started by adding JLPT N5 or N4 kanjis to your personalized inventory!'
                  : 'Switch your filter above or unlock more kanjis from the catalog.'}
              </p>
              <div className="EmptyActionButtons">
                <button className="PrimaryActionButton" onClick={() => handleUnlockLevel('N5')}>
                  ⚡ Unlock All N5 Kanjis (108)
                </button>
                <button className="SecondaryActionButton" onClick={() => setActiveSubTab('manage_kanjis')}>
                  Browse Kanji Catalog
                </button>
              </div>
            </div>
          ) : (
            <div className="ActiveFlashcardSection">
              {/* Progress bar across current card deck */}
              <div className="DeckProgressBar">
                <div
                  className="DeckProgressFill"
                  style={{ width: `${((currentIndex + 1) / practiceCards.length) * 100}%` }}
                />
              </div>

              {/* The 3D Interactive Flashcard */}
              <div
                className={`AnkiCardContainer ${isFlipped ? 'is-flipped' : ''}`}
                onClick={handleFlip}
                tabIndex={0}
                role="button"
                aria-label="Flashcard - Click or press Space to flip"
              >
                <div className="AnkiCardInner">
                  {/* --- FRONT OF FLASHCARD --- */}
                  <div className="AnkiCardFace CardFaceFront">
                    <div className="CardHeaderTags">
                      <span className="Badge LevelBadge">{currentCard.level || 'N5'}</span>
                      {currentCard.strokes > 0 && (
                        <span className="Badge StrokeBadge">{currentCard.strokes} strokes</span>
                      )}
                      <span className={`Badge ScoreBadge ${getScoreColorClass(currentCard.score)}`}>
                        Score: {currentCard.score ?? 0}%
                      </span>
                    </div>

                    <div className="FrontKanjiDisplay">
                      <div className="BigKanjiCharacter">{currentCard.character}</div>
                      <div className="FlipTapHint">
                        <span className="HintIcon">👆</span> Click card or press <kbd>Space</kbd> to reveal
                      </div>
                    </div>

                    <div className="CardFrontFooter">
                      <span className="CardFooterHint">
                        Recall the meaning, readings, and vocabulary for this kanji
                      </span>
                    </div>
                  </div>

                  {/* --- BACK OF FLASHCARD --- */}
                  <div className="AnkiCardFace CardFaceBack">
                    <div className="BackTopBar">
                      <div className="BackKanjiMain">
                        <span className="BackKanjiChar">{currentCard.character}</span>
                        <div className="BackKanjiTextInfo">
                          <h2 className="BackKanjiMeaning">{currentCard.meaning}</h2>
                          <div className="BackReadingsGroup">
                            {currentCard.onyomi && (
                              <div className="ReadingItem">
                                <span className="ReadingType">音 (On):</span>
                                <span className="ReadingValue katakana">{currentCard.onyomi}</span>
                              </div>
                            )}
                            {currentCard.kunyomi && (
                              <div className="ReadingItem">
                                <span className="ReadingType">訓 (Kun):</span>
                                <span className="ReadingValue hiragana">{currentCard.kunyomi}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="BackActions">
                        <button
                          className={`AudioSpeakButton ${isAudioPlaying ? 'playing' : ''}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            speakText(currentCard.character);
                          }}
                          title="Pronounce Kanji"
                        >
                          🔊
                        </button>
                        <div className={`ScoreCircle ${getScoreColorClass(currentCard.score)}`}>
                          <span>{currentCard.score ?? 0}</span>
                          <small>Score</small>
                        </div>
                      </div>
                    </div>

                    {/* STRICTLY FILTERED RELATED VOCABULARY SECTION */}
                    {showVocab && (
                      <div className="RelatedVocabSection" onClick={(e) => e.stopPropagation()}>
                        <div className="VocabSectionHeader">
                          <h3 className="VocabSectionTitle">
                            Related Vocabulary ({currentCard.relatedVocabs.length})
                          </h3>
                          <span className="StrictBadge">
                            ✨ 100% learned kanjis only
                          </span>
                        </div>

                        {currentCard.relatedVocabs.length === 0 ? (
                          <div className="NoMatchingVocabNotice">
                            <p>
                              No vocabulary words in your Firebase collection currently use <em>only</em> your
                              learned kanjis for 「{currentCard.character}」.
                            </p>
                            <small>
                              As you unlock more kanjis or add vocabulary, relevant words will appear here
                              automatically!
                            </small>
                          </div>
                        ) : (
                          <div className="VocabCardList">
                            {currentCard.relatedVocabs.map((vocab, idx) => (
                              <div key={idx} className="VocabCardItem">
                                <div className="VocabCardLeft">
                                  <div className="VocabKanjiText">{vocab.kanji}</div>
                                  <div className="VocabReadingText">{vocab.word}</div>
                                </div>
                                <div className="VocabMeaningText">{vocab.meaning}</div>
                                <div className="VocabItemActions">
                                  <button
                                    className="VocabAudioBtn"
                                    onClick={() => speakText(vocab.word || vocab.kanji)}
                                    title="Listen"
                                  >
                                    🔊
                                  </button>
                                  {vocab.confidence !== undefined && (
                                    <span className="VocabConfidenceBadge">
                                      {vocab.confidence}%
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* ANKI GRADING RESPONSE BUTTONS */}
              {isFlipped ? (
                <div className="AnkiResponseBar">
                  <button
                    className={`AnkiGradeBtn grade-again ${selectedDifficulty === 'again' ? 'selected' : ''}`}
                    onClick={() => handleRateCard('again')}
                  >
                    <span className="GradeEmoji">❌</span>
                    <span className="GradeLabel">Again</span>
                    <span className="GradeShortcut"><kbd>1</kbd></span>
                    <span className="GradeSubtext">-15 Score</span>
                  </button>

                  <button
                    className={`AnkiGradeBtn grade-hard ${selectedDifficulty === 'hard' ? 'selected' : ''}`}
                    onClick={() => handleRateCard('hard')}
                  >
                    <span className="GradeEmoji">⚠️</span>
                    <span className="GradeLabel">Hard</span>
                    <span className="GradeShortcut"><kbd>2</kbd></span>
                    <span className="GradeSubtext">+5 Score</span>
                  </button>

                  <button
                    className={`AnkiGradeBtn grade-good ${selectedDifficulty === 'good' ? 'selected' : ''}`}
                    onClick={() => handleRateCard('good')}
                  >
                    <span className="GradeEmoji">👍</span>
                    <span className="GradeLabel">Good</span>
                    <span className="GradeShortcut"><kbd>3</kbd></span>
                    <span className="GradeSubtext">+15 Score</span>
                  </button>

                  <button
                    className={`AnkiGradeBtn grade-easy ${selectedDifficulty === 'easy' ? 'selected' : ''}`}
                    onClick={() => handleRateCard('easy')}
                  >
                    <span className="GradeEmoji">🌟</span>
                    <span className="GradeLabel">Easy</span>
                    <span className="GradeShortcut"><kbd>4</kbd></span>
                    <span className="GradeSubtext">+25 Score</span>
                  </button>
                </div>
              ) : (
                <div className="CardControlsBar">
                  <button className="NavArrowBtn" onClick={prevCard} title="Previous card">
                    ← Previous
                  </button>
                  <button className="FlipMainBtn" onClick={handleFlip}>
                    Flip Card (<kbd>Space</kbd>)
                  </button>
                  <button className="NavArrowBtn" onClick={nextCard} title="Next card">
                    Next →
                  </button>
                </div>
              )}

              {/* Keyboard Shortcuts Hint Legend */}
              <div className="KeyboardHintsBar">
                <span className="HintPiece"><kbd>Space</kbd> Flip</span>
                <span className="HintPiece"><kbd>1</kbd> Again</span>
                <span className="HintPiece"><kbd>2</kbd> Hard</span>
                <span className="HintPiece"><kbd>3</kbd> Good</span>
                <span className="HintPiece"><kbd>4</kbd> Easy</span>
                <span className="HintPiece"><kbd>←</kbd> / <kbd>→</kbd> Navigate</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* VIEW 2: UNLOCKED VOCABULARY PRACTICE                         */}
      {/* ============================================================ */}
      {activeSubTab === 'vocab_practice' && (
        <div className="UnlockedVocabView">
          <div className="VocabViewHeader">
            <div>
              <h2>Unlocked Vocabulary Practice ({unlockedVocabList.length})</h2>
              <p>
                Every single word in this deck is composed <strong>exclusively</strong> of the kanjis you have
                learned. No unknown kanjis will ever appear here!
              </p>
            </div>
            <div className="CoveragePill">
              Scaffolding Coverage: <strong>{analytics.coveragePercent}%</strong> of Firebase Vocab
            </div>
          </div>

          {unlockedVocabList.length === 0 ? (
            <div className="EmptyKanjiState">
              <div className="EmptyStateIcon">📚</div>
              <h2>No Unlocked Vocabulary Yet</h2>
              <p>
                None of your Firebase vocabulary words currently consist entirely of your learned kanjis.
                Unlock more kanjis in the <strong>Manage Kanjis</strong> tab to expand your vocabulary reach!
              </p>
              <button className="PrimaryActionButton" onClick={() => setActiveSubTab('manage_kanjis')}>
                Go to Kanji Catalog
              </button>
            </div>
          ) : (
            <div className="VocabPracticeLayout">
              {/* Vocab Flashcard */}
              <div
                className={`VocabFlashcard ${isVocabFlipped ? 'flipped' : ''}`}
                onClick={() => setIsVocabFlipped((p) => !p)}
              >
                <div className="VocabFlashcardInner">
                  {/* Front */}
                  <div className="VocabFace FrontFace">
                    <span className="VocabBadge">Unlocked Word</span>
                    <div className="BigVocabKanji">
                      {unlockedVocabList[vocabCardIndex]?.kanji || unlockedVocabList[vocabCardIndex]?.word}
                    </div>
                    <span className="TapFlipHint">Tap or click to reveal reading & meaning</span>
                  </div>

                  {/* Back */}
                  <div className="VocabFace BackFace">
                    <div className="BackVocabReading">
                      {unlockedVocabList[vocabCardIndex]?.word}
                    </div>
                    <div className="BackVocabMeaning">
                      {unlockedVocabList[vocabCardIndex]?.meaning}
                    </div>

                    <div className="ComponentKanjisList">
                      <h4>Component Kanjis Learned:</h4>
                      <div className="KanjiComponentChips">
                        {getKanjisInText(unlockedVocabList[vocabCardIndex]?.kanji || '').map((kChar) => {
                          const kInfo = learnedKanjis[kChar] || getKanjiDetails(kChar);
                          return (
                            <div key={kChar} className="KanjiChip">
                              <span className="ChipChar">{kChar}</span>
                              <span className="ChipMeaning">{kInfo?.meaning}</span>
                              <span className="ChipScore">{kInfo?.score ?? 0}%</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      className="VocabAudioBtnLarge"
                      onClick={(e) => {
                        e.stopPropagation();
                        speakText(unlockedVocabList[vocabCardIndex]?.word);
                      }}
                    >
                      🔊 Pronounce Word
                    </button>
                  </div>
                </div>
              </div>

              {/* Vocab Navigation Bar */}
              <div className="VocabNavControls">
                <button
                  className="NavArrowBtn"
                  onClick={() => {
                    setIsVocabFlipped(false);
                    setVocabCardIndex((prev) => (prev - 1 + unlockedVocabList.length) % unlockedVocabList.length);
                  }}
                >
                  ← Previous Word
                </button>
                <span className="VocabIndexText">
                  {vocabCardIndex + 1} / {unlockedVocabList.length}
                </span>
                <button
                  className="NavArrowBtn"
                  onClick={() => {
                    setIsVocabFlipped(false);
                    setVocabCardIndex((prev) => (prev + 1) % unlockedVocabList.length);
                  }}
                >
                  Next Word →
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ============================================================ */}
      {/* VIEW 3: MANAGE KANJIS & LEVEL CATALOG                        */}
      {/* ============================================================ */}
      {activeSubTab === 'manage_kanjis' && (
        <div className="ManageKanjisView">
          {/* Level Tabs & Bulk Unlock Actions */}
          <div className="CatalogControlPanel">
            <div className="LevelTabsRow">
              {['N5', 'N4', 'N3', 'ALL'].map((lvl) => (
                <button
                  key={lvl}
                  className={`LevelTabBtn ${catalogLevelTab === lvl ? 'active' : ''}`}
                  onClick={() => setCatalogLevelTab(lvl)}
                >
                  {lvl === 'ALL' ? 'All Learned' : `${lvl} Level`}
                </button>
              ))}
            </div>

            {catalogLevelTab !== 'ALL' && (
              <button
                className="BulkUnlockBtn"
                onClick={() => handleUnlockLevel(catalogLevelTab)}
              >
                ⚡ Unlock All {catalogLevelTab} Kanjis
              </button>
            )}
          </div>

          {/* Search & Custom Kanji Input Bar */}
          <div className="SearchAndAddBar">
            <div className="SearchBox">
              <span className="SearchIcon">🔍</span>
              <input
                type="text"
                placeholder="Search by Kanji (e.g. 日), meaning (e.g. water), or reading..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="ClearSearchBtn" onClick={() => setSearchQuery('')}>
                  ✕
                </button>
              )}
            </div>

            <div className="CustomKanjiAddBox">
              <input
                type="text"
                placeholder="Add custom kanji (e.g. 桜, 愛)..."
                value={customKanjiInput}
                onChange={(e) => setCustomKanjiInput(e.target.value)}
              />
              <button className="AddCustomBtn" onClick={handleAddCustomKanji}>
                + Add Kanji
              </button>
            </div>
          </div>

          {/* Kanji Grid Display */}
          <div className="KanjiCatalogGrid">
            {(() => {
              // Get candidate list based on level tab or search
              let sourceList = [];
              if (catalogLevelTab === 'ALL') {
                sourceList = Object.values(learnedKanjis).map((k) => ({
                  ...getKanjiDetails(k.character),
                  ...k,
                }));
              } else {
                sourceList = getKanjisByLevel(catalogLevelTab);
              }

              if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase().trim();
                sourceList = sourceList.filter(
                  (item) =>
                    item.character.includes(q) ||
                    (item.meaning && item.meaning.toLowerCase().includes(q)) ||
                    (item.onyomi && item.onyomi.includes(q)) ||
                    (item.kunyomi && item.kunyomi.includes(q))
                );
              }

              if (sourceList.length === 0) {
                return (
                  <div className="NoGridResults">
                    <p>No kanjis found matching your criteria.</p>
                  </div>
                );
              }

              return sourceList.map((item) => {
                const char = item.character;
                const isLearned = !!learnedKanjis[char];
                const score = learnedKanjis[char]?.score ?? 0;
                const relatedCount = isLearned
                  ? getRelatedVocabsForKanji(char, allVocabs, learnedKanjiSet).length
                  : 0;

                return (
                  <div
                    key={char}
                    className={`KanjiGridCard ${isLearned ? 'is-learned' : 'is-unlearned'}`}
                  >
                    <div className="CardHeaderMini">
                      <span className="MiniLevelBadge">{item.level || catalogLevelTab}</span>
                      {isLearned ? (
                        <span className={`MiniScoreBadge ${getScoreColorClass(score)}`}>
                          {score}%
                        </span>
                      ) : (
                        <span className="MiniStatusBadge">Not Learned</span>
                      )}
                    </div>

                    <div className="GridKanjiChar">{char}</div>
                    <div className="GridKanjiMeaning" title={item.meaning}>
                      {item.meaning}
                    </div>

                    {isLearned && (
                      <div className="GridUnlockedVocabCount">
                        🔓 {relatedCount} vocab
                      </div>
                    )}

                    <div className="GridCardActions">
                      <button
                        className={`ToggleLearnedBtn ${isLearned ? 'btn-remove' : 'btn-add'}`}
                        onClick={() => handleToggleKanji(item)}
                      >
                        {isLearned ? '✓ Learned' : '+ Learn'}
                      </button>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* VIEW 4: KNOWLEDGE MATRIX & SMART ANALYTICS                   */}
      {/* ============================================================ */}
      {activeSubTab === 'analytics' && (
        <div className="KnowledgeMatrixView">
          <div className="AnalyticsSummaryCards">
            <div className="AnalyticsCard card-green">
              <div className="AnalyticsIcon">🏆</div>
              <div className="AnalyticsNumber">{analytics.masteredCount}</div>
              <div className="AnalyticsTitle">Mastered Kanjis (80%+)</div>
              <div className="AnalyticsSub">Retention is solid and stable</div>
            </div>

            <div className="AnalyticsCard card-blue">
              <div className="AnalyticsIcon">📖</div>
              <div className="AnalyticsNumber">{analytics.learningCount}</div>
              <div className="AnalyticsTitle">In Active Review (40-79%)</div>
              <div className="AnalyticsSub">Regular SRS spaced practice</div>
            </div>

            <div className="AnalyticsCard card-orange">
              <div className="AnalyticsIcon">⚡</div>
              <div className="AnalyticsNumber">{analytics.strugglingCount}</div>
              <div className="AnalyticsTitle">Needs Practice (&lt;40%)</div>
              <div className="AnalyticsSub">Prioritize in your next revision</div>
            </div>

            <div className="AnalyticsCard card-purple">
              <div className="AnalyticsIcon">🔓</div>
              <div className="AnalyticsNumber">{analytics.unlockedVocabCount}</div>
              <div className="AnalyticsTitle">Scaffolded Vocabularies</div>
              <div className="AnalyticsSub">
                {analytics.coveragePercent}% of your {analytics.totalVocabs} Firebase words
              </div>
            </div>
          </div>

          {/* Level by Level Scaffolding Breakdown */}
          <div className="LevelBreakdownSection">
            <h3>JLPT Level Scaffolding Progress</h3>
            <div className="LevelProgressGrid">
              {Object.entries(analytics.levelCounts).map(([lvl, data]) => {
                const pct = data.total > 0 ? Math.round((data.learned / data.total) * 100) : 0;
                return (
                  <div key={lvl} className="LevelProgressCard">
                    <div className="LvlCardHeader">
                      <span className="LvlBadgeLarge">{lvl}</span>
                      <span className="LvlCountFraction">
                        <strong>{data.learned}</strong> / {data.total} Kanjis
                      </span>
                    </div>
                    <div className="LvlProgressBar">
                      <div className="LvlProgressFill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="LvlCardFooter">
                      <span>{pct}% Unlocked</span>
                      {data.learned < data.total && (
                        <button
                          className="LvlUnlockInlineBtn"
                          onClick={() => handleUnlockLevel(lvl)}
                        >
                          Unlock All {lvl}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Kanji;