// ============================================================
// holidays.gs — India holiday catalog + selection (Config-backed)
// Festival dates are lunar/solar and shift yearly; this catalog is 2026.
// ============================================================

function getHolidayCatalog() {
  return { success: true, catalog: [
    { date: '2026-01-26', name: 'Republic Day',        national: true },
    { date: '2026-08-15', name: 'Independence Day',    national: true },
    { date: '2026-10-02', name: 'Gandhi Jayanti',      national: true },
    { date: '2026-03-04', name: 'Holi',                national: false },
    { date: '2026-03-21', name: 'Eid-ul-Fitr',         national: false },
    { date: '2026-04-14', name: 'Dr Ambedkar Jayanti', national: false },
    { date: '2026-05-01', name: 'Maharashtra Day',     national: false },
    { date: '2026-05-27', name: 'Eid-ul-Adha (Bakri)', national: false },
    { date: '2026-08-28', name: 'Raksha Bandhan',      national: false },
    { date: '2026-09-04', name: 'Janmashtami',         national: false },
    { date: '2026-09-14', name: 'Ganesh Chaturthi',    national: false },
    { date: '2026-10-20', name: 'Dussehra',            national: false },
    { date: '2026-11-08', name: 'Diwali',              national: false },
    { date: '2026-11-24', name: 'Guru Nanak Jayanti',  national: false },
    { date: '2026-12-25', name: 'Christmas',           national: false }
  ] };
}

function _nationalHolidayDates_() {
  return getHolidayCatalog().catalog.filter(function(h){ return h.national; })
    .map(function(h){ return h.date; });
}

function getHolidays() {
  var raw = String(getConfigValue('Holidays') || '').trim();
  var chosen = raw ? raw.split(',').map(function(s){ return s.trim(); }).filter(Boolean) : [];
  // National holidays are always observed, even if never explicitly ticked.
  var all = _nationalHolidayDates_().concat(chosen);
  var uniq = all.filter(function(d, i){ return all.indexOf(d) === i; });
  return { success: true, dates: uniq };
}

function saveHolidays(dates, token) {
  _requireAdmin_(token);
  var clean = (dates || []).map(function(s){ return String(s).trim(); })
    .filter(function(s){ return /^\d{4}-\d{2}-\d{2}$/.test(s); });
  saveConfig([{ Key: 'Holidays', Value: clean.join(',') }], token);
  return { success: true };
}

function isHoliday(dateStr) {
  return getHolidays().dates.indexOf(String(dateStr)) !== -1;
}
