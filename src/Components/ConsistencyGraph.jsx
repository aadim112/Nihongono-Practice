import React from "react";
import "./Consistency.css";

const ConsistencyGraph = ({ activityData = {}, user }) => {
  const today = new Date();
  const currentDayOfWeek = today.getDay(); // 0: Sun, 6: Sat

  // Show 15 weeks (approx 3.5 - 4 months) to fit sidebar width
  const numWeeks = 15;
  const daysToSub = (numWeeks - 1) * 7 + currentDayOfWeek;
  const startDate = new Date(today);
  startDate.setDate(today.getDate() - daysToSub);

  const weeks = [];
  let currentWeek = [];
  let iterDate = new Date(startDate);

  while (iterDate <= today) {
    const key = iterDate.toISOString().split("T")[0];
    const count = activityData[key] || 0;

    currentWeek.push({
      date: new Date(iterDate),
      key,
      count,
      month: iterDate.toLocaleString("default", { month: "short" }),
      dayOfMonth: iterDate.getDate(),
      isMonthStart: iterDate.getDate() === 1 || iterDate.getDate() <= 7,
    });

    if (currentWeek.length === 7) {
      weeks.push(currentWeek);
      currentWeek = [];
    }

    iterDate.setDate(iterDate.getDate() + 1);
  }

  if (currentWeek.length > 0) {
    weeks.push(currentWeek);
  }

  const getLevelClass = (count) => {
    if (!count || count <= 0) return "level-0";
    if (count === 1) return "level-1";
    if (count === 2 || count === 3) return "level-2";
    if (count === 4 || count === 5) return "level-3";
    return "level-4";
  };

  // Extract unique month labels for columns
  const monthLabels = [];
  let lastMonth = "";
  weeks.forEach((w, wIndex) => {
    const firstDay = w[0];
    if (firstDay && firstDay.month !== lastMonth) {
      monthLabels.push({ label: firstDay.month, colIndex: wIndex });
      lastMonth = firstDay.month;
    }
  });

  // Calculate total contributions
  const totalContributions = Object.values(activityData).reduce(
    (acc, val) => acc + (typeof val === "number" ? val : 0),
    0
  );

  return (
    <div className="gh-consistency-card">
      <div className="gh-card-header">
        <div className="gh-header-title">
          <span className="gh-header-icon">📊</span>
          <span className="gh-title-text">Consistency</span>
        </div>
        <span className="gh-total-badge">{totalContributions} total</span>
      </div>

      <div className="gh-grid-wrapper">
        {/* Month labels */}
        <div className="gh-months-row">
          {weeks.map((_, wIndex) => {
            const m = monthLabels.find((mLabel) => mLabel.colIndex === wIndex);
            return (
              <div key={wIndex} className="gh-month-cell">
                {m ? m.label : ""}
              </div>
            );
          })}
        </div>

        {/* Contribution heatmap grid */}
        <div className="gh-grid">
          {weeks.map((week, wIndex) => (
            <div key={wIndex} className="gh-week-col">
              {week.map((day) => (
                <div
                  key={day.key}
                  className={`gh-day-square ${getLevelClass(day.count)}`}
                  title={`${day.key}: ${day.count} ${
                    day.count === 1 ? "activity" : "activities"
                  }`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="gh-legend-row">
        <span className="gh-legend-text">Less</span>
        <div className="gh-legend-squares">
          <span className="gh-day-square level-0" />
          <span className="gh-day-square level-1" />
          <span className="gh-day-square level-2" />
          <span className="gh-day-square level-3" />
          <span className="gh-day-square level-4" />
        </div>
        <span className="gh-legend-text">More</span>
      </div>
    </div>
  );
};

export default ConsistencyGraph;