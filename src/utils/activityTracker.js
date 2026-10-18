import { ref, runTransaction } from 'firebase/database';
import db from '../Components/firebase';

/**
 * Standard effort points per learning action.
 * Higher cognitive effort tasks (e.g., passage translation, reading, listening comprehension)
 * award more effort points than single-item reviews.
 */
export const ACTION_EFFORT_MAP = {
  // Kanji
  kanji_review: 1,       // Single SRS flashcard review / rating
  kanji_vocab_review: 1, // Single unlocked vocab word review
  kanji_add: 2,          // Unlocking / adding new kanji to learning queue

  // Vocabulary
  vocab_quiz: 1,         // Single vocabulary multiple-choice revision question
  vocab_add: 2,          // Adding a new vocabulary word to library

  // Grammar
  grammar_learned: 3,    // Mastering / marking a grammar pattern as learned
  grammar_add: 3,        // Adding and defining a custom grammar rule

  // Listening
  listening_quiz: 3,     // Listening comprehension question answered

  // Contextual Translation (Nihongo Naka Ni)
  translation_checked: 5,// Translating full daily passage and checking comparison

  // Reading (Reading.jsx)
  reading_submitted: 5,  // Answering and submitting reading comprehension questions
};

/**
 * Effort level thresholds:
 * Level 0: 0 pts (Inactive / Neutral)
 * Level 1: 1 - 4 pts (Light)
 * Level 2: 5 - 11 pts (Moderate)
 * Level 3: 12 - 19 pts (High)
 * Level 4: 20+ pts (Very High)
 */
export const EFFORT_TIERS = [
  { min: 0,  max: 0,        level: 0, label: 'No activity', colorClass: 'level-0' },
  { min: 1,  max: 4,        level: 1, label: 'Light effort', colorClass: 'level-1' },
  { min: 5,  max: 11,       level: 2, label: 'Moderate effort', colorClass: 'level-2' },
  { min: 12, max: 19,       level: 3, label: 'High effort', colorClass: 'level-3' },
  { min: 20, max: Infinity, level: 4, label: 'Very high effort', colorClass: 'level-4' },
];

/**
 * Convert any date to a YYYY-MM-DD string in the user's LOCAL timezone.
 * Avoids UTC day-shift bugs caused by toISOString().
 *
 * @param {Date|string|number} [date=new Date()]
 * @returns {string} e.g. "2026-10-18"
 */
export function getLocalDateKey(date = new Date()) {
  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) {
    const fallback = new Date();
    return `${fallback.getFullYear()}-${String(fallback.getMonth() + 1).padStart(2, '0')}-${String(fallback.getDate()).padStart(2, '0')}`;
  }
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Calculate effort level metadata from an effort score.
 *
 * @param {number} effortScore
 * @returns {{ level: number, label: string, colorClass: string }}
 */
export function getEffortLevel(effortScore = 0) {
  const score = Math.max(0, Number(effortScore) || 0);
  for (const tier of EFFORT_TIERS) {
    if (score >= tier.min && score <= tier.max) {
      return {
        level: tier.level,
        label: tier.label,
        colorClass: tier.colorClass,
        score,
      };
    }
  }
  return {
    level: 4,
    label: 'Very high effort',
    colorClass: 'level-4',
    score,
  };
}

/**
 * Normalize an activity record from Firebase.
 * Fully preserves backward-compatibility with legacy numeric values (e.g. `2`).
 *
 * @param {*} rawVal
 * @returns {{ count: number, effort: number, sections: Object<string, { count: number, effort: number }> }}
 */
export function normalizeDayData(rawVal) {
  if (rawVal === null || rawVal === undefined) {
    return { count: 0, effort: 0, sections: {} };
  }

  // Legacy format: rawVal is a simple number, e.g. 1, 2, 5
  if (typeof rawVal === 'number') {
    const num = Math.max(0, Math.round(rawVal));
    return {
      count: num,
      effort: num,
      sections: num > 0 ? { legacy: { count: num, effort: num } } : {},
    };
  }

  // Modern structured object format
  if (typeof rawVal === 'object') {
    const count = Math.max(0, Number(rawVal.count ?? rawVal.totalActivities ?? rawVal.effort ?? 0));
    const effort = Math.max(0, Number(rawVal.effort ?? rawVal.effortScore ?? rawVal.count ?? 0));

    const normalizedSections = {};
    if (rawVal.sections && typeof rawVal.sections === 'object') {
      for (const [secKey, secVal] of Object.entries(rawVal.sections)) {
        if (typeof secVal === 'number') {
          normalizedSections[secKey] = { count: secVal, effort: secVal };
        } else if (secVal && typeof secVal === 'object') {
          normalizedSections[secKey] = {
            count: Number(secVal.count ?? secVal.effort ?? 0),
            effort: Number(secVal.effort ?? secVal.count ?? 0),
          };
        }
      }
    }

    return {
      count,
      effort,
      sections: normalizedSections,
      lastUpdated: rawVal.lastUpdated || null,
    };
  }

  return { count: 0, effort: 0, sections: {} };
}

/**
 * Normalize an entire dictionary of activity days.
 *
 * @param {Object} rawActivityMap
 * @returns {Object<string, { count: number, effort: number, sections: Object }>}
 */
export function normalizeActivityMap(rawActivityMap = {}) {
  if (!rawActivityMap || typeof rawActivityMap !== 'object') return {};
  const normalized = {};
  for (const [key, val] of Object.entries(rawActivityMap)) {
    // Only process valid date keys (e.g. YYYY-MM-DD)
    if (/^\d{4}-\d{2}-\d{2}$/.test(key)) {
      normalized[key] = normalizeDayData(val);
    }
  }
  return normalized;
}

// In-memory deduplication set to prevent duplicate dispatches within session
const sessionProcessedActivityIds = new Set();

/**
 * Record a meaningful learning activity.
 * Idempotent, deduplicated, atomic via Firebase Realtime Database transaction,
 * and updates in the user's local timezone.
 *
 * @param {number|string} userId
 * @param {Object} options
 * @param {string} options.section - 'kanji' | 'vocab' | 'grammar' | 'listening' | 'translate' | 'reading'
 * @param {string} options.action  - e.g. 'kanji_review', 'vocab_quiz', etc.
 * @param {string|number} [options.itemId] - Unique identifier for the question/word/rule
 * @param {number} [options.effort] - Custom effort score (defaults to ACTION_EFFORT_MAP[action] || 1)
 * @param {string} [options.dateKey] - Optional override date key (defaults to local today)
 * @param {Object} [options.metadata] - Optional additional context
 * @returns {Promise<{ success: boolean, skipped?: boolean, reason?: string, data?: Object }>}
 */
export async function recordLearningActivity(userId, {
  section,
  action,
  itemId,
  effort,
  dateKey,
  metadata = {},
}) {
  if (userId === undefined || userId === null || !section || !action) {
    console.warn('[ActivityTracker] Invalid parameters:', { userId, section, action });
    return { success: false, skipped: true, reason: 'invalid_parameters' };
  }

  const effectiveDate = dateKey || getLocalDateKey();
  const effectiveEffort = Math.max(1, Number(effort) || ACTION_EFFORT_MAP[action] || 1);

  // Generate unique idempotency key
  const safeItemId = itemId !== undefined && itemId !== null ? String(itemId) : `${Date.now()}`;
  const activityId = `${section}:${action}:${safeItemId}:${effectiveDate}`;

  // Client-side fast deduplication check
  if (sessionProcessedActivityIds.has(activityId)) {
    return { success: true, skipped: true, reason: 'duplicate_in_session' };
  }
  sessionProcessedActivityIds.add(activityId);

  // Keep set size reasonable
  if (sessionProcessedActivityIds.size > 2000) {
    const firstKey = sessionProcessedActivityIds.values().next().value;
    sessionProcessedActivityIds.delete(firstKey);
  }

  // Broadcast local event for immediate responsive UI feedback
  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    try {
      window.dispatchEvent(
        new CustomEvent('nihongo_activity_recorded', {
          detail: {
            userId,
            dateKey: effectiveDate,
            section,
            action,
            effort: effectiveEffort,
            activityId,
          },
        })
      );
    } catch (_) {}
  }

  // Persist atomically to Firebase Realtime Database
  try {
    const dayRef = ref(db, `${userId}/Consistency/${effectiveDate}`);

    const result = await runTransaction(dayRef, (currentVal) => {
      // Normalize current record (handles legacy numbers and existing objects)
      const normalized = normalizeDayData(currentVal);

      // Check if this activity ID was already processed in database
      const existingProcessedIds = (currentVal && typeof currentVal === 'object' && currentVal.processedIds) || {};
      if (existingProcessedIds[activityId]) {
        return; // Abort transaction without modifying
      }

      const newCount = normalized.count + 1;
      const newEffort = normalized.effort + effectiveEffort;

      const currentSection = normalized.sections[section] || { count: 0, effort: 0 };
      const updatedSections = {
        ...normalized.sections,
        [section]: {
          count: currentSection.count + 1,
          effort: currentSection.effort + effectiveEffort,
        },
      };

      // Keep last 50 processed activity IDs to prevent infinite growth
      const updatedProcessedIds = { ...existingProcessedIds, [activityId]: Date.now() };
      const processedKeys = Object.keys(updatedProcessedIds);
      if (processedKeys.length > 50) {
        delete updatedProcessedIds[processedKeys[0]];
      }

      return {
        count: newCount,
        effort: newEffort,
        sections: updatedSections,
        processedIds: updatedProcessedIds,
        lastUpdated: Date.now(),
      };
    });

    if (result && result.committed) {
      return { success: true, data: result.snapshot ? result.snapshot.val() : null };
    } else if (result && !result.committed) {
      return { success: true, skipped: true, reason: 'already_recorded' };
    }
    return { success: true };
  } catch (error) {
    console.error('[ActivityTracker] Error recording activity in Firebase:', error);
    // Don't crash caller on network/Firebase errors
    return { success: false, error: error.message };
  }
}
