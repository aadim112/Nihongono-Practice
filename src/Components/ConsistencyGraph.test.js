import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import ConsistencyGraph from './ConsistencyGraph';
import { getLocalDateKey } from '../utils/activityTracker';

describe('ConsistencyGraph component', () => {
  const todayKey = getLocalDateKey(new Date());

  test('renders header, legend, and 0 total points when activityData is empty', () => {
    render(<ConsistencyGraph activityData={{}} user={0} />);

    expect(screen.getByText('Consistency')).toBeInTheDocument();
    expect(screen.getByText('0 pts')).toBeInTheDocument();
    expect(screen.getByText(/Start a streak today/i)).toBeInTheDocument();
    expect(screen.getByText('Less')).toBeInTheDocument();
    expect(screen.getByText('More')).toBeInTheDocument();
  });

  test('preserves and displays legacy numeric activity data properly', () => {
    const legacyData = {
      [todayKey]: 3,
    };

    render(<ConsistencyGraph activityData={legacyData} user={0} />);

    // Legacy value of 3 should count as 3 pts
    expect(screen.getByText('3 pts')).toBeInTheDocument();
    expect(screen.getByText('Past Activity')).toBeInTheDocument();
  });

  test('renders multi-section activity breakdown correctly', () => {
    const multiSectionData = {
      [todayKey]: {
        count: 6,
        effort: 14,
        sections: {
          kanji: { count: 3, effort: 3 },
          vocab: { count: 2, effort: 2 },
          listening: { count: 1, effort: 3 },
          translate: { count: 0, effort: 0 },
        },
      },
    };

    render(<ConsistencyGraph activityData={multiSectionData} user={0} />);

    // Total effort in badge
    expect(screen.getByText('14 pts')).toBeInTheDocument();

    // Section breakdown items in detail card
    expect(screen.getByText('Kanji')).toBeInTheDocument();
    expect(screen.getByText('Vocab')).toBeInTheDocument();
    expect(screen.getByText('Listening')).toBeInTheDocument();
    expect(screen.getByText('High effort')).toBeInTheDocument();
  });

  test('clicking/focusing a day square updates detail inspector', () => {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 2);
    const pastDateKey = getLocalDateKey(pastDate);

    const testData = {
      [pastDateKey]: {
        count: 4,
        effort: 8,
        sections: {
          grammar: { count: 2, effort: 6 },
          vocab: { count: 2, effort: 2 },
        },
      },
    };

    render(<ConsistencyGraph activityData={testData} user={0} />);

    const squares = screen.getAllByRole('gridcell');
    // Find the button with the pastDateKey title or aria-label
    const targetSquare = squares.find((sq) =>
      sq.getAttribute('aria-label')?.includes(pastDateKey)
    );

    expect(targetSquare).toBeDefined();
    if (targetSquare) {
      fireEvent.click(targetSquare);
      // Detail view now inspects that day
      expect(screen.getByText('Moderate effort')).toBeInTheDocument();
      expect(screen.getByText('Grammar')).toBeInTheDocument();
    }
  });

  test('renders all 5 effort levels with appropriate classes', () => {
    const d1 = new Date(); d1.setDate(d1.getDate() - 1);
    const d2 = new Date(); d2.setDate(d2.getDate() - 2);
    const d3 = new Date(); d3.setDate(d3.getDate() - 3);
    const d4 = new Date(); d4.setDate(d4.getDate() - 4);

    const activityData = {
      [getLocalDateKey(d1)]: { count: 1, effort: 2, sections: { kanji: { count: 1, effort: 2 } } }, // Light (level-1)
      [getLocalDateKey(d2)]: { count: 3, effort: 7, sections: { vocab: { count: 3, effort: 7 } } },  // Moderate (level-2)
      [getLocalDateKey(d3)]: { count: 5, effort: 15, sections: { translate: { count: 3, effort: 15 } } }, // High (level-3)
      [getLocalDateKey(d4)]: { count: 8, effort: 24, sections: { listening: { count: 8, effort: 24 } } }, // Very High (level-4)
    };

    render(<ConsistencyGraph activityData={activityData} user={0} />);

    const squares = screen.getAllByRole('gridcell');
    expect(squares.some(sq => sq.classList.contains('level-1'))).toBe(true);
    expect(squares.some(sq => sq.classList.contains('level-2'))).toBe(true);
    expect(squares.some(sq => sq.classList.contains('level-3'))).toBe(true);
    expect(squares.some(sq => sq.classList.contains('level-4'))).toBe(true);
  });

  test('updates in real time when nihongo_activity_recorded event is dispatched', () => {
    const { container } = render(<ConsistencyGraph activityData={{}} user={0} />);

    // Initially 0 pts
    expect(screen.getByText('0 pts')).toBeInTheDocument();

    // Dispatch activity event
    fireEvent(
      window,
      new CustomEvent('nihongo_activity_recorded', {
        detail: {
          userId: 0,
          dateKey: todayKey,
          section: 'kanji',
          action: 'kanji_review',
          effort: 1,
        },
      })
    );

    // Should now show 1 pts in real-time
    expect(screen.getByText('1 pts')).toBeInTheDocument();
  });
});
