import "./Consistency.css"

const ConsistencyGraph = ({ activityData = {} }) => {
  const DAYS = 365;
  const today = new Date();

  const getLevel = (count) => {
    if (count === 0) return "";
    if (count <= 2) return "level-2";
    if (count <= 4) return "level-3";
    return "level-4";
  };

  const daysArray = Array.from({ length: DAYS }, (_, i) => {
    const date = new Date(today);
    date.setDate(today.getDate() - (DAYS - i - 1));

    const key = date.toISOString().split("T")[0];

    return {
      date,
      key,
      count: activityData[key] || 0,
      level: getLevel(activityData[key] || 0),
      month: date.getMonth(),
      isMonthStart: date.getDate() === 1,
    };
  });

  return (
    <div className="graph-wrapper">
      <div className="months-row">
        {daysArray.map((day, index) => {
          if (!day.isMonthStart) return null;

          const weekIndex = Math.floor(index / 7);
          const monthName = day.date.toLocaleString("default", {month: "short",});

          return (
            <span key={day.key} className="month-label" style={{ gridColumnStart: weekIndex + 1 }}>{monthName}</span>
          );
        })}
      </div>

      <div className="consistency-container">
        {daysArray.map((day) => (
          <div
            key={day.key}
            className={`day ${day.level}`}
            title={`${day.key}: ${day.count} activities`}
          />
        ))}
      </div>
    </div>
  );
};

export default ConsistencyGraph;
