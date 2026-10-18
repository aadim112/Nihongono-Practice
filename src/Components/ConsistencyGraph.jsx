import React, { useState, useMemo, useEffect, useRef } from "react";
import "./Consistency.css";
import {
  getLocalDateKey,
  getEffortLevel,
  normalizeActivityMap,
  normalizeDayData,
  EFFORT_TIERS,
} from "../utils/activityTracker";

const SECTION_META = {
  kanji: { label: "Kanji", icon: "🈸" },
  vocab: { label: "Vocab", icon: "📖" },
  grammar: { label: "Grammar", icon: "⛩️" },
  listening: { label: "Listening", icon: "🎧" },
  translate: { label: "Translate", icon: "✍️" },
  reading: { label: "Reading", icon: "📚" },
  legacy: { label: "Past Activity", icon: "⭐" },
};

const ConsistencyGraph = ({ activityData = {}, user }) => {
  const [selectedDayKey, setSelectedDayKey] = useState(null);
  const [hoveredDayKey, setHoveredDayKey] = useState(null);
  const [localActivityData, setLocalActivityData] = useState(activityData);
  const containerRef = useRef(null);

  // Sync external activityData
  useEffect(() => {
    setLocalActivityData(activityData);
  }, [activityData]);

  // Listen to instantaneous local activity events
  useEffect(() => {
    const handleLocalActivity = (event) => {
      const detail = event?.detail;
      if (!detail) return;
      if (detail.userId !== undefined && detail.userId !== user) return;

      const { dateKey, section, effort } = detail;
      setLocalActivityData((prev) => {
        const prevMap = prev || {};
        const prevDayRaw = prevMap[dateKey];
        const normalized = normalizeDayData(prevDayRaw);

        const currentSec = normalized.sections[section] || { count: 0, effort: 0 };
        const updatedSections = {
          ...normalized.sections,
          [section]: {
            count: currentSec.count + 1,
            effort: currentSec.effort + (Number(effort) || 1),
          },
        };

        return {
          ...prevMap,
          [dateKey]: {
            count: normalized.count + 1,
            effort: normalized.effort + (Number(effort) || 1),
            sections: updatedSections,
            lastUpdated: Date.now(),
          },
        };
      });
    };

    window.addEventListener("nihongo_activity_recorded", handleLocalActivity);
    return () => {
      window.removeEventListener("nihongo_activity_recorded", handleLocalActivity);
    };
  }, [user]);

  // Normalize all incoming activity data
  const normalizedMap = useMemo(() => {
    return normalizeActivityMap(localActivityData);
  }, [localActivityData]);

  // Compute weeks & days in the user's local timezone
  const { weeks, monthLabels, stats } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const currentDayOfWeek = today.getDay(); // 0: Sun, 6: Sat

    // 15 weeks accommodates desktop sidebar and mobile screens cleanly
    const numWeeks = 15;
    const daysToSub = (numWeeks - 1) * 7 + currentDayOfWeek;
    const startDate = new Date(today);
    startDate.setDate(today.getDate() - daysToSub);

    const generatedWeeks = [];
    let currentWeek = [];
    let iterDate = new Date(startDate);

    let totalEffort = 0;
    let totalActivities = 0;
    let activeDaysCount = 0;

    while (iterDate <= today) {
      const key = getLocalDateKey(iterDate);
      const dayData = normalizedMap[key] || { count: 0, effort: 0, sections: {} };
      const effortMeta = getEffortLevel(dayData.effort);

      if (dayData.effort > 0 || dayData.count > 0) {
        activeDaysCount += 1;
        totalEffort += dayData.effort;
        totalActivities += dayData.count;
      }

      currentWeek.push({
        date: new Date(iterDate),
        key,
        count: dayData.count,
        effort: dayData.effort,
        sections: dayData.sections || {},
        effortMeta,
        month: iterDate.toLocaleString("default", { month: "short" }),
        dayOfMonth: iterDate.getDate(),
        isToday: key === getLocalDateKey(today),
      });

      if (currentWeek.length === 7) {
        generatedWeeks.push(currentWeek);
        currentWeek = [];
      }

      iterDate.setDate(iterDate.getDate() + 1);
    }

    if (currentWeek.length > 0) {
      generatedWeeks.push(currentWeek);
    }

    // Extract month headers
    const mLabels = [];
    let lastMonth = "";
    generatedWeeks.forEach((w, wIndex) => {
      const firstDay = w[0];
      if (firstDay && firstDay.month !== lastMonth) {
        mLabels.push({ label: firstDay.month, colIndex: wIndex });
        lastMonth = firstDay.month;
      }
    });

    // Calculate streak
    let currentStreak = 0;
    let checkDate = new Date(today);
    const todayKey = getLocalDateKey(today);
    const todayData = normalizedMap[todayKey];

    // If today is inactive, start checking from yesterday for streak continuity
    if (!todayData || (todayData.effort === 0 && todayData.count === 0)) {
      checkDate.setDate(checkDate.getDate() - 1);
    }

    while (true) {
      const checkKey = getLocalDateKey(checkDate);
      const cData = normalizedMap[checkKey];
      if (cData && (cData.effort > 0 || cData.count > 0)) {
        currentStreak += 1;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    return {
      weeks: generatedWeeks,
      monthLabels: mLabels,
      stats: {
        totalEffort,
        totalActivities,
        activeDaysCount,
        currentStreak,
      },
    };
  }, [normalizedMap]);

  // Determine active day for the inspection view
  const activeDayKey = hoveredDayKey || selectedDayKey || getLocalDateKey(new Date());
  const activeDayData = useMemo(() => {
    const raw = normalizedMap[activeDayKey] || { count: 0, effort: 0, sections: {} };
    const effortMeta = getEffortLevel(raw.effort);

    // Format human-readable date
    let formattedDate = activeDayKey;
    try {
      const [year, month, day] = activeDayKey.split("-").map(Number);
      const d = new Date(year, month - 1, day);
      formattedDate = d.toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch (_) {}

    return {
      key: activeDayKey,
      formattedDate,
      count: raw.count,
      effort: raw.effort,
      effortMeta,
      sections: raw.sections || {},
      isToday: activeDayKey === getLocalDateKey(new Date()),
    };
  }, [activeDayKey, normalizedMap]);

  const hasActivity = activeDayData.count > 0 || activeDayData.effort > 0;
  const sectionEntries = Object.entries(activeDayData.sections).filter(
    ([, sec]) => (sec?.count ?? 0) > 0 || (sec?.effort ?? 0) > 0
  );

  return (
    <div
      className="gh-consistency-card"
      ref={containerRef}
      role="region"
      aria-label="Learning consistency and activity heatmap"
    >
      {/* Header */}
      <div className="gh-card-header">
        <div className="gh-header-title">
          <span className="gh-header-icon" aria-hidden="true">🔥</span>
          <div className="gh-title-group">
            <span className="gh-title-text">Consistency</span>
            <span className="gh-streak-text">
              {stats.currentStreak > 0
                ? `${stats.currentStreak} day streak`
                : "Start a streak today"}
            </span>
          </div>
        </div>
        <div className="gh-header-badges">
          <span
            className="gh-total-badge"
            title={`${stats.totalEffort} total effort points from ${stats.totalActivities} learning activities`}
            aria-label={`${stats.totalEffort} effort points`}
          >
            {stats.totalEffort} pts
          </span>
        </div>
      </div>

      {/* Grid area */}
      <div className="gh-grid-wrapper">
        {/* Month labels */}
        <div className="gh-months-row" aria-hidden="true">
          {weeks.map((_, wIndex) => {
            const m = monthLabels.find((mLabel) => mLabel.colIndex === wIndex);
            return (
              <div key={wIndex} className="gh-month-cell">
                {m ? m.label : ""}
              </div>
            );
          })}
        </div>

        {/* Heatmap Grid */}
        <div
          className="gh-grid"
          role="grid"
          aria-label="15-week learning activity calendar"
        >
          {weeks.map((week, wIndex) => (
            <div key={wIndex} className="gh-week-col" role="row">
              {week.map((day) => {
                const isSelected = day.key === activeDayKey;
                const ariaLabelText = `${day.key}: ${day.effort} effort points (${day.effortMeta.label}), ${day.count} activities`;

                return (
                  <button
                    key={day.key}
                    type="button"
                    role="gridcell"
                    aria-label={ariaLabelText}
                    aria-selected={isSelected}
                    tabIndex={0}
                    className={`gh-day-square ${day.effortMeta.colorClass} ${
                      isSelected ? "is-selected" : ""
                    } ${day.isToday ? "is-today" : ""}`}
                    onMouseEnter={() => setHoveredDayKey(day.key)}
                    onMouseLeave={() => setHoveredDayKey(null)}
                    onClick={() =>
                      setSelectedDayKey((prev) =>
                        prev === day.key ? null : day.key
                      )
                    }
                    onFocus={() => setHoveredDayKey(day.key)}
                    onBlur={() => setHoveredDayKey(null)}
                    title={ariaLabelText}
                  >
                    {/* Accessible visual indicator for High and Very High levels */}
                    {day.effortMeta.level >= 3 && (
                      <span className="gh-day-pip" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Effort Legend */}
      <div className="gh-legend-row" aria-label="Activity effort legend">
        <span className="gh-legend-text">Less</span>
        <div className="gh-legend-squares">
          {EFFORT_TIERS.map((tier) => (
            <span
              key={tier.level}
              className={`gh-legend-square ${tier.colorClass}`}
              title={`${tier.label} (${
                tier.max === Infinity
                  ? `${tier.min}+ pts`
                  : tier.min === 0
                  ? "0 pts"
                  : `${tier.min}-${tier.max} pts`
              })`}
              aria-label={tier.label}
            />
          ))}
        </div>
        <span className="gh-legend-text">More</span>
      </div>

      {/* Responsive Inspector / Detail View */}
      <div
        className={`gh-detail-card ${hasActivity ? "has-data" : "is-empty"}`}
        aria-live="polite"
      >
        <div className="gh-detail-header">
          <div className="gh-detail-date">
            <span className="gh-detail-date-text">
              {activeDayData.formattedDate}
            </span>
            {activeDayData.isToday && (
              <span className="gh-today-chip">Today</span>
            )}
          </div>
          <span
            className={`gh-detail-level-tag ${activeDayData.effortMeta.colorClass}`}
          >
            {activeDayData.effortMeta.label}
          </span>
        </div>

        <div className="gh-detail-metrics">
          <div className="gh-metric-item">
            <span className="gh-metric-num">{activeDayData.effort}</span>
            <span className="gh-metric-label">Effort Pts</span>
          </div>
          <div className="gh-metric-divider" aria-hidden="true" />
          <div className="gh-metric-item">
            <span className="gh-metric-num">{activeDayData.count}</span>
            <span className="gh-metric-label">Activities</span>
          </div>
        </div>

        {/* Breakdown by Learning Section */}
        {sectionEntries.length > 0 ? (
          <div className="gh-breakdown-list">
            {sectionEntries.map(([secKey, secVal]) => {
              const meta = SECTION_META[secKey] || {
                label: secKey.charAt(0).toUpperCase() + secKey.slice(1),
                icon: "📌",
              };
              const count = secVal?.count ?? 0;
              const effort = secVal?.effort ?? 0;

              return (
                <div key={secKey} className="gh-breakdown-item">
                  <div className="gh-breakdown-label">
                    <span className="gh-breakdown-icon" aria-hidden="true">
                      {meta.icon}
                    </span>
                    <span>{meta.label}</span>
                  </div>
                  <div className="gh-breakdown-counts">
                    <span className="gh-breakdown-count">
                      {count} {count === 1 ? "act" : "acts"}
                    </span>
                    <span className="gh-breakdown-effort">
                      +{effort} pts
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="gh-detail-empty-hint">
            No learning logged on this day.
          </div>
        )}
      </div>
    </div>
  );
};

export default ConsistencyGraph;