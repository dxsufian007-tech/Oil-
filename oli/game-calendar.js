/* Oli - game-calendar.js  (Game Time & Calendar: the date of the game)
 *
 * The game has ONE clock: Company.hours (game hours since the start).  This file only turns that number into a date and back, using the real Gregorian calendar:
 * real month lengths (28/29/30/31 days), leap years, and a start on 1 January 2026 00:00.  It has no state, no timer and no DOM, so it can never drift away from the clock.
 * Day 0 is the first day.  dayIdx = floor(hours / 24).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.OliCalendar = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const START = { year: 2026, month: 1, day: 1 };
  const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
  const MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const DAYS_AR = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
  const DIM = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const isLeap = y => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  const daysInMonth = (y, m) => m === 2 && isLeap(y) ? 29 : DIM[m - 1];
  const daysInYear = y => isLeap(y) ? 366 : 365;
  const ORIGIN = Date.UTC(START.year, START.month - 1, START.day) / 86400000;                // days since 1970-01-01 of the first game day (pure arithmetic: no time zone, no "now")

  /* a whole day index -> its date */
  function dateOfDay(dayIdx) {
    dayIdx = Math.max(0, Math.floor(+dayIdx || 0)); const d = new Date((ORIGIN + dayIdx) * 86400000);
    const year = d.getUTCFullYear(), month = d.getUTCMonth() + 1, day = d.getUTCDate();
    return { dayIdx, year, month, day, weekday: d.getUTCDay(), daysInMonth: daysInMonth(year, month), dayOfYear: Math.round((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 1)) / 86400000) + 1 };
  }
  /* game hours -> date and time of day */
  function fromHours(hours) {
    hours = Math.max(0, +hours || 0); const dd = dateOfDay(Math.floor(hours / 24)), hour = Math.floor(hours % 24);
    return Object.assign(dd, { hours, hour, minute: Math.floor((hours % 1) * 60), monthName: MONTHS_AR[dd.month - 1], weekdayName: DAYS_AR[dd.weekday],
      text: pad(dd.day) + '/' + pad(dd.month) + '/' + dd.year + ' ' + pad(hour) + ':00', textAr: dd.day + ' ' + MONTHS_AR[dd.month - 1] + ' ' + dd.year });
  }
  const pad = n => String(n).padStart(2, '0');
  /* the day index of a calendar date (inverse of dateOfDay) */
  function dayOf(year, month, day) { return Math.round(Date.UTC(year, month - 1, day) / 86400000 - ORIGIN); }
  const isMonthStart = dayIdx => dateOfDay(dayIdx).day === 1;
  const isYearStart = dayIdx => { const d = dateOfDay(dayIdx); return d.month === 1 && d.day === 1; };
  /* days from the start of dayIdx's hour to the first day of the next month */
  function daysToMonthEnd(hours) { const d = fromHours(hours); return d.daysInMonth - d.day + 1 - (d.hours % 24) / 24; }
  /* the hour number `n` months later on the same day of the month (clamped to the month's last day) */
  function addMonths(hours, n) {
    const d = fromHours(hours); let m = d.month - 1 + Math.max(0, Math.floor(n)), y = d.year + Math.floor(m / 12); m = m % 12 + 1;
    return dayOf(y, m, Math.min(d.day, daysInMonth(y, m))) * 24 + (hours % 24);
  }
  return { START, MONTHS_AR, MONTHS_EN, DAYS_AR, isLeap, daysInMonth, daysInYear, dateOfDay, fromHours, dayOf, isMonthStart, isYearStart, daysToMonthEnd, addMonths };
});
