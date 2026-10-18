import {
  getLocalDateKey,
  getEffortLevel,
  normalizeDayData,
  normalizeActivityMap,
  recordLearningActivity,
  ACTION_EFFORT_MAP,
  EFFORT_TIERS,
} from './activityTracker';

// Mock Firebase Realtime Database
jest.mock('../Components/firebase', () => ({}));
jest.mock('firebase/database', () => ({
  ref: jest.fn((db, path) => ({ path })),
  runTransaction: jest.fn(async (refObj, updateFn) => {
    // Simulate transaction execution
    const mockInitialData = null;
    const result = updateFn(mockInitialData);
    return {
      committed: result !== undefined,
      snapshot: {
        val: () => result,
      },
    };
  }),
}));

describe('activityTracker utility', () => {
  describe('getLocalDateKey', () => {
    test('returns YYYY-MM-DD formatted according to local timezone', () => {
      const testDate = new Date(2026, 9, 18, 14, 30, 0); // Oct 18, 2026 local time
      const key = getLocalDateKey(testDate);
      expect(key).toBe('2026-10-18');
    });

    test('handles date boundary correctly without UTC drift', () => {
      // 11:30 PM local time on Dec 31
      const lateNight = new Date(2026, 11, 31, 23, 30, 0);
      expect(getLocalDateKey(lateNight)).toBe('2026-12-31');

      // 12:05 AM local time on Jan 1
      const earlyMorning = new Date(2027, 0, 1, 0, 5, 0);
      expect(getLocalDateKey(earlyMorning)).toBe('2027-01-01');
    });

    test('gracefully falls back on invalid date input', () => {
      const key = getLocalDateKey('invalid-date-string');
      expect(key).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
  });

  describe('getEffortLevel', () => {
    test('correctly maps 0 effort points to Level 0 (No activity)', () => {
      const res = getEffortLevel(0);
      expect(res.level).toBe(0);
      expect(res.label).toBe('No activity');
      expect(res.colorClass).toBe('level-0');
    });

    test('correctly maps 1-4 effort points to Level 1 (Light effort)', () => {
      expect(getEffortLevel(1).level).toBe(1);
      expect(getEffortLevel(4).level).toBe(1);
      expect(getEffortLevel(3).colorClass).toBe('level-1');
      expect(getEffortLevel(3).label).toBe('Light effort');
    });

    test('correctly maps 5-11 effort points to Level 2 (Moderate effort)', () => {
      expect(getEffortLevel(5).level).toBe(2);
      expect(getEffortLevel(11).level).toBe(2);
      expect(getEffortLevel(8).colorClass).toBe('level-2');
      expect(getEffortLevel(8).label).toBe('Moderate effort');
    });

    test('correctly maps 12-19 effort points to Level 3 (High effort)', () => {
      expect(getEffortLevel(12).level).toBe(3);
      expect(getEffortLevel(19).level).toBe(3);
      expect(getEffortLevel(15).colorClass).toBe('level-3');
      expect(getEffortLevel(15).label).toBe('High effort');
    });

    test('correctly maps 20+ effort points to Level 4 (Very high effort)', () => {
      expect(getEffortLevel(20).level).toBe(4);
      expect(getEffortLevel(50).level).toBe(4);
      expect(getEffortLevel(25).colorClass).toBe('level-4');
      expect(getEffortLevel(25).label).toBe('Very high effort');
    });
  });

  describe('normalizeDayData & backward compatibility', () => {
    test('handles null and undefined without crashing', () => {
      expect(normalizeDayData(null)).toEqual({ count: 0, effort: 0, sections: {} });
      expect(normalizeDayData(undefined)).toEqual({ count: 0, effort: 0, sections: {} });
    });

    test('preserves existing legacy numeric records', () => {
      const legacyVal = 4;
      const normalized = normalizeDayData(legacyVal);
      expect(normalized.count).toBe(4);
      expect(normalized.effort).toBe(4);
      expect(normalized.sections.legacy).toEqual({ count: 4, effort: 4 });
    });

    test('normalizes structured modern activity objects', () => {
      const modernRecord = {
        count: 7,
        effort: 16,
        sections: {
          kanji: { count: 3, effort: 3 },
          vocab: { count: 2, effort: 2 },
          listening: { count: 1, effort: 3 },
          translate: { count: 1, effort: 5 },
          reading: { count: 0, effort: 0 },
        },
      };

      const normalized = normalizeDayData(modernRecord);
      expect(normalized.count).toBe(7);
      expect(normalized.effort).toBe(16);
      expect(normalized.sections.kanji).toEqual({ count: 3, effort: 3 });
      expect(normalized.sections.translate).toEqual({ count: 1, effort: 5 });
    });

    test('normalizeActivityMap filters invalid dates and normalizes entries', () => {
      const rawMap = {
        '2026-10-17': 2,
        '2026-10-18': { count: 3, effort: 6, sections: { grammar: { count: 2, effort: 6 } } },
        'invalid-key': 'ignore-me',
      };

      const normalized = normalizeActivityMap(rawMap);
      expect(Object.keys(normalized)).toEqual(['2026-10-17', '2026-10-18']);
      expect(normalized['2026-10-17'].count).toBe(2);
      expect(normalized['2026-10-18'].effort).toBe(6);
    });
  });

  describe('ACTION_EFFORT_MAP scoring weights', () => {
    test('defines sensible weights for all learning modules', () => {
      expect(ACTION_EFFORT_MAP.kanji_review).toBe(1);
      expect(ACTION_EFFORT_MAP.vocab_quiz).toBe(1);
      expect(ACTION_EFFORT_MAP.kanji_add).toBe(2);
      expect(ACTION_EFFORT_MAP.vocab_add).toBe(2);
      expect(ACTION_EFFORT_MAP.grammar_learned).toBe(3);
      expect(ACTION_EFFORT_MAP.grammar_add).toBe(3);
      expect(ACTION_EFFORT_MAP.listening_quiz).toBe(3);
      expect(ACTION_EFFORT_MAP.translation_checked).toBe(5);
      expect(ACTION_EFFORT_MAP.reading_submitted).toBe(5);
    });
  });

  describe('recordLearningActivity', () => {
    test('records learning activity and dispatches event', async () => {
      const dispatchSpy = jest.spyOn(window, 'dispatchEvent');

      const res = await recordLearningActivity(0, {
        section: 'kanji',
        action: 'kanji_review',
        itemId: '日',
        effort: 1,
      });

      expect(res.success).toBe(true);
      expect(dispatchSpy).toHaveBeenCalled();
      dispatchSpy.mockRestore();
    });

    test('prevents duplicate event submission within session', async () => {
      const firstCall = await recordLearningActivity(0, {
        section: 'vocab',
        action: 'vocab_quiz',
        itemId: 'word-101',
        dateKey: '2026-10-18',
      });
      expect(firstCall.success).toBe(true);

      // Immediate second call with identical parameters
      const secondCall = await recordLearningActivity(0, {
        section: 'vocab',
        action: 'vocab_quiz',
        itemId: 'word-101',
        dateKey: '2026-10-18',
      });
      expect(secondCall.skipped).toBe(true);
      expect(secondCall.reason).toBe('duplicate_in_session');
    });

    test('rejects missing section or action cleanly without throwing', async () => {
      const res = await recordLearningActivity(0, {
        section: '',
        action: '',
      });
      expect(res.skipped).toBe(true);
      expect(res.reason).toBe('invalid_parameters');
    });

    test('supports tracking across all learning modules with expected default efforts', async () => {
      const modules = [
        { section: 'kanji', action: 'kanji_review', itemId: '木', expectedEffort: 1 },
        { section: 'vocab', action: 'vocab_quiz', itemId: 'v-1', expectedEffort: 1 },
        { section: 'grammar', action: 'grammar_learned', itemId: 'g-1', expectedEffort: 3 },
        { section: 'listening', action: 'listening_quiz', itemId: 'l-1', expectedEffort: 3 },
        { section: 'translate', action: 'translation_checked', itemId: 't-1', expectedEffort: 5 },
        { section: 'reading', action: 'reading_submitted', itemId: 'r-1', expectedEffort: 5 },
      ];

      for (const m of modules) {
        const res = await recordLearningActivity(0, {
          section: m.section,
          action: m.action,
          itemId: m.itemId,
          dateKey: '2026-10-19',
        });
        expect(res.success).toBe(true);
      }
    });

    test('preserves existing progress when normalizing multi-day maps', () => {
      const mixedHistory = {
        '2026-10-10': 1,
        '2026-10-11': 4,
        '2026-10-12': { count: 8, effort: 18, sections: { kanji: { count: 8, effort: 18 } } },
      };

      const normalized = normalizeActivityMap(mixedHistory);
      expect(normalized['2026-10-10'].effort).toBe(1);
      expect(normalized['2026-10-11'].effort).toBe(4);
      expect(normalized['2026-10-12'].effort).toBe(18);
      expect(normalized['2026-10-12'].count).toBe(8);
    });
  });
});
