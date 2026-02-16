import "./Consistency.css";

const ConsistencyGraph = ({ activityData = {} ,user}) => {
  const today = new Date();
  const sixMonthsAgo = new Date(today);
  sixMonthsAgo.setMonth(today.getMonth() - 6);

  // Calculate days between sixMonthsAgo and today
  const daysDiff = Math.ceil((today - sixMonthsAgo) / (1000 * 60 * 60 * 24));

  const daysArray = Array.from({ length: daysDiff + 1 }, (_, i) => {
    const date = new Date(sixMonthsAgo);
    date.setDate(sixMonthsAgo.getDate() + i);
    const key = date.toISOString().split("T")[0];
    return {
      date,
      key,
      count: activityData[key] || 0,
      hasActivity: (activityData[key] || 0) > 0,
      dayOfMonth: date.getDate(),
      month: date.toLocaleString("default", { month: "short" }),
      isMonthStart: date.getDate() === 1,
    };
  });

  return (
    <div className="timeline-wrapper">
      <div className="timeline-container">
        <div className="timeline-line"></div>
        {daysArray.map((day, index) => (
          <div key={day.key} className="timeline-item">
            <div
              className={`timeline-circle ${
                day.hasActivity ? "active" : "inactive"
              }`}
              title={`${day.date.toLocaleDateString()}: ${day.count} activities`}
            ></div>
            {day.isMonthStart && (
              <div className="timeline-month-label">
                {day.month}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ConsistencyGraph;