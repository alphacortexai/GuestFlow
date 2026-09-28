import { useEffect, useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const weekdayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type BirthdayCalendarProps = {
  month: string;
  day: string;
  onChange: (month: string, day: string) => void;
};

export default function BirthdayCalendar({ month, day, onChange }: BirthdayCalendarProps) {
  const savedMonth = monthNames.indexOf(month);
  const [activeMonth, setActiveMonth] = useState(savedMonth >= 0 ? savedMonth : new Date().getMonth());
  const monthStart = new Date(2000, activeMonth, 1).getDay();
  const daysInMonth = new Date(2000, activeMonth + 1, 0).getDate();
  const days = useMemo(
    () => Array.from({ length: monthStart + daysInMonth }, (_, index) => index < monthStart ? null : index - monthStart + 1),
    [monthStart, daysInMonth],
  );

  useEffect(() => {
    if (savedMonth >= 0) setActiveMonth(savedMonth);
  }, [savedMonth]);

  const changeMonth = (nextMonth: number) => {
    const boundedMonth = Math.max(0, Math.min(11, nextMonth));
    setActiveMonth(boundedMonth);
    const selectedDay = Number(day);
    onChange(monthNames[boundedMonth], selectedDay > new Date(2000, boundedMonth + 1, 0).getDate() ? "" : day);
  };

  return (
    <div className="apple-calendar calendar-landscape">
      <section className="calendar-month-panel" aria-label="Choose birthday month">
        <div className="calendar-panel-heading"><span>01</span><div><strong>Choose a month</strong><small>Birthday month</small></div></div>
        <div className="month-grid">
          {monthNames.map((monthName, index) => (
            <button
              type="button"
              key={monthName}
              aria-label={monthName}
              aria-pressed={activeMonth === index}
              className={month === monthName ? "selected-month" : ""}
              onClick={() => changeMonth(index)}
            >{monthName.slice(0, 3)}</button>
          ))}
        </div>
      </section>
      <section className="calendar-day-panel" aria-label={`Choose a day in ${monthNames[activeMonth]}`}>
        <div className="calendar-toolbar">
          <button type="button" aria-label="Previous month" onClick={() => changeMonth(activeMonth - 1)} disabled={activeMonth === 0}><ChevronLeft size={17} /></button>
          <div><strong>{monthNames[activeMonth]}</strong><span>Birthday day</span></div>
          <button type="button" aria-label="Next month" onClick={() => changeMonth(activeMonth + 1)} disabled={activeMonth === 11}><ChevronRight size={17} /></button>
        </div>
        <div className="calendar-weekdays">{weekdayNames.map((weekday) => <span key={weekday}>{weekday}</span>)}</div>
        <div className="calendar-grid">
          {days.map((date, index) => date
            ? <button type="button" key={date} aria-pressed={month === monthNames[activeMonth] && day === String(date)} className={month === monthNames[activeMonth] && day === String(date) ? "selected-day" : ""} onClick={() => onChange(monthNames[activeMonth], String(date))}>{date}</button>
            : <span aria-hidden="true" key={`blank-${index}`} />)}
        </div>
      </section>
      <div className="calendar-selection"><CalendarDays size={16} /><span>{month && day ? `${day} ${month}` : "Select a month and day"}</span></div>
    </div>
  );
}
