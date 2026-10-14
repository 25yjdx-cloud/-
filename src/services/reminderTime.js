export function normalizeReminderTime(value) {
  if (typeof value !== 'string') return '';
  const normalized = value.replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)))
    .trim()
    .replace(/[ص]/g, ' AM')
    .replace(/[م]/g, ' PM');
  const twelveHourTime = normalized.match(/^(\d{1,2}):([0-5]\d)\s*(AM|PM)$/i);
  if (twelveHourTime) {
    const inputHour = Number(twelveHourTime[1]);
    if (inputHour < 1 || inputHour > 12) return '';
    const hour = (inputHour % 12) + (twelveHourTime[3].toUpperCase() === 'PM' ? 12 : 0);
    return `${String(hour).padStart(2, '0')}:${twelveHourTime[2]}`;
  }
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(normalized) ? normalized : '';
}

export function formatReminderTime(value, locale = 'ar-EG') {
  const normalized = normalizeReminderTime(value);
  if (!normalized) return '';
  const [hour, minute] = normalized.split(':').map(Number);
  const date = new Date();
  date.setHours(hour, minute, 0, 0);
  const parts = new Intl.DateTimeFormat(locale, {
    hour: 'numeric',
    hour12: true,
  }).formatToParts(date);
  const hourPart = parts.find((part) => part.type === 'hour')?.value;
  const dayPeriod = parts.find((part) => part.type === 'dayPeriod')?.value;
  const localizedMinute = new Intl.NumberFormat(locale, {
    useGrouping: false,
    minimumIntegerDigits: 2,
  }).format(minute);
  if (!hourPart) return '';
  return `${hourPart}:${localizedMinute}${dayPeriod ? ` ${dayPeriod}` : ''}`;
}

export function getDueReminderKeys(reminders, now = new Date(), gracePeriodMs = 15 * 60 * 1000) {
  if (!(now instanceof Date) || !Number.isFinite(now.getTime())
    || !Number.isFinite(gracePeriodMs) || gracePeriodMs < 0
    || !reminders || typeof reminders !== 'object' || Array.isArray(reminders)) {
    return [];
  }
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const lastSent = reminders.lastSent && typeof reminders.lastSent === 'object'
    && !Array.isArray(reminders.lastSent)
    ? reminders.lastSent
    : {};
  return ['quran', 'morning', 'evening'].filter((key) => {
    const normalized = normalizeReminderTime(reminders[key]);
    if (!normalized || lastSent[key] === today) return false;
    const [hour, minute] = normalized.split(':').map(Number);
    const scheduledAt = new Date(now);
    scheduledAt.setHours(hour, minute, 0, 0);
    const delay = now.getTime() - scheduledAt.getTime();
    return delay >= 0 && delay <= gracePeriodMs;
  });
}
