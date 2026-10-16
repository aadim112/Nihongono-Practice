import kanjiCatalog from '../data/kanjiCatalog.json';

// Detect if a character is a Kanji (CJK Unified Ideograph)
export const isKanji = (char) => {
  if (!char || typeof char !== 'string') return false;
  return /[\u4e00-\u9faf\u3400-\u4dbf]/.test(char);
};

// Extract all unique kanji characters from a text string
export const getKanjisInText = (text) => {
  if (!text || typeof text !== 'string') return [];
  const chars = [...text];
  const kanjis = [];
  for (const c of chars) {
    if (isKanji(c) && !kanjis.includes(c)) {
      kanjis.push(c);
    }
  }
  return kanjis;
};

// Fast lookup map for kanji catalog details
const catalogMap = new Map();
['N5', 'N4', 'N3'].forEach((lvl) => {
  const items = kanjiCatalog[lvl] || [];
  items.forEach((item) => {
    catalogMap.set(item.character, { ...item, level: lvl });
  });
});

// Retrieve details for a kanji
export const getKanjiDetails = (character) => {
  if (!character) return null;
  if (catalogMap.has(character)) {
    return catalogMap.get(character);
  }
  return {
    character,
    meaning: 'Custom Kanji',
    onyomi: '',
    kunyomi: '',
    strokes: 0,
    level: 'Custom',
  };
};

// Get all kanjis defined in a given level
export const getKanjisByLevel = (level = 'N5') => {
  const normalizedLevel = level.toUpperCase();
  return kanjiCatalog[normalizedLevel] || [];
};

/**
 * STRICT VOCAB FILTERING:
 * Determines if a vocab item is fully readable with the user's currently learned kanji set.
 * If the word contains ANY kanji that is NOT in learnedKanjiSet, it returns FALSE.
 * Pure kana words without any kanji return true.
 */
export const isVocabReadableWithLearnedKanji = (vocabItem, learnedKanjiSet) => {
  if (!vocabItem) return false;
  const kanjiText = vocabItem.kanji || '';
  const kanjisInWord = getKanjisInText(kanjiText);

  // If word has no kanji (pure kana), it is readable
  if (kanjisInWord.length === 0) return true;

  // Every single kanji in the word MUST be in the user's learned set
  return kanjisInWord.every((k) => learnedKanjiSet.has(k));
};

/**
 * Get all vocabulary words from allVocab that contain the target kanji,
 * AND where 100% of the kanjis in that word are in the learnedKanjiSet!
 */
export const getRelatedVocabsForKanji = (targetKanji, allVocabs = [], learnedKanjiSet = new Set()) => {
  if (!targetKanji || !Array.isArray(allVocabs)) return [];

  return allVocabs.filter((item) => {
    const kanjiText = item?.kanji || '';
    if (!kanjiText.includes(targetKanji)) return false;

    // Strict constraint: NO unlearned kanji allowed in this vocab item!
    return isVocabReadableWithLearnedKanji(item, learnedKanjiSet);
  });
};

/**
 * Filter an entire vocab collection to only words that are 100% readable
 * with the learned kanjis (excluding pure kana unless specified).
 */
export const getUnlockedVocabs = (allVocabs = [], learnedKanjiSet = new Set(), includePureKana = false) => {
  if (!Array.isArray(allVocabs)) return [];

  return allVocabs.filter((item) => {
    const kanjiText = item?.kanji || '';
    const kanjisInWord = getKanjisInText(kanjiText);

    if (kanjisInWord.length === 0) {
      return includePureKana;
    }

    return kanjisInWord.every((k) => learnedKanjiSet.has(k));
  });
};

/**
 * Anki SM-2 / SRS Scoring calculation for a Kanji card review
 * Rating: 'again' | 'hard' | 'good' | 'easy'
 */
export const calculateNextKanjiReview = (currentData = {}, rating = 'good') => {
  const currentScore = Number(currentData.score ?? 0);
  const currentStreak = Number(currentData.streak ?? 0);
  const currentReviews = Number(currentData.reviews ?? 0);
  const now = Date.now();

  let nextScore = currentScore;
  let nextStreak = currentStreak;
  let intervalDays = 1;
  let status = 'learning';

  switch (rating) {
    case 'again':
      nextStreak = 0;
      nextScore = Math.max(0, currentScore - 15);
      intervalDays = 0; // Review again in same session / 10 mins
      status = 'learning';
      break;

    case 'hard':
      nextScore = Math.min(100, currentScore + 5);
      // Hard keeps streak or slight bump
      intervalDays = Math.max(1, Math.round(currentStreak * 1.2));
      status = nextScore >= 80 ? 'mastered' : 'review';
      break;

    case 'good':
      nextStreak = currentStreak + 1;
      nextScore = Math.min(100, currentScore + 15);
      intervalDays = nextStreak === 1 ? 1 : nextStreak === 2 ? 3 : Math.round(nextStreak * 2.2);
      status = nextScore >= 80 ? 'mastered' : 'review';
      break;

    case 'easy':
      nextStreak = currentStreak + 2;
      nextScore = Math.min(100, currentScore + 25);
      intervalDays = nextStreak <= 2 ? 4 : Math.round(nextStreak * 3.5);
      status = 'mastered';
      break;

    default:
      break;
  }

  const nextReviewTimestamp = now + intervalDays * 24 * 60 * 60 * 1000;

  return {
    ...currentData,
    score: nextScore,
    streak: nextStreak,
    reviews: currentReviews + 1,
    intervalDays,
    lastReviewed: now,
    nextReview: nextReviewTimestamp,
    status,
    lastRating: rating,
  };
};

/**
 * Compute smart analytics for the knowledge dashboard
 */
export const computeKnowledgeAnalytics = (learnedKanjis = {}, allVocabs = [], catalog = kanjiCatalog) => {
  const learnedList = Object.values(learnedKanjis);
  const learnedCount = learnedList.length;
  const learnedSet = new Set(Object.keys(learnedKanjis));

  // Score distribution
  const mastered = learnedList.filter((k) => (Number(k.score) || 0) >= 80);
  const learning = learnedList.filter((k) => (Number(k.score) || 0) >= 40 && (Number(k.score) || 0) < 80);
  const struggling = learnedList.filter((k) => (Number(k.score) || 0) < 40);

  const totalScore = learnedList.reduce((acc, k) => acc + (Number(k.score) || 0), 0);
  const averageScore = learnedCount > 0 ? Math.round(totalScore / learnedCount) : 0;

  // Level breakdowns
  const levelCounts = {
    N5: { learned: 0, total: catalog.N5.length },
    N4: { learned: 0, total: catalog.N4.length },
    N3: { learned: 0, total: catalog.N3.length },
  };

  learnedList.forEach((k) => {
    const lvl = (k.level || 'N5').toUpperCase();
    if (levelCounts[lvl]) {
      levelCounts[lvl].learned += 1;
    }
  });

  // Vocab analysis
  const totalVocabs = Array.isArray(allVocabs) ? allVocabs.length : 0;
  const unlockedVocabs = getUnlockedVocabs(allVocabs, learnedSet, false);
  const unlockedVocabCount = unlockedVocabs.length;

  const coveragePercent = totalVocabs > 0 ? Math.round((unlockedVocabCount / totalVocabs) * 100) : 0;

  // Due for review count
  const now = Date.now();
  const dueCount = learnedList.filter((k) => !k.nextReview || k.nextReview <= now).length;

  return {
    totalLearned: learnedCount,
    averageScore,
    dueCount,
    masteredCount: mastered.length,
    learningCount: learning.length,
    strugglingCount: struggling.length,
    levelCounts,
    totalVocabs,
    unlockedVocabCount,
    coveragePercent,
    unlockedVocabs,
  };
};
