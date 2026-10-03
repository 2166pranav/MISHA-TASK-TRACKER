/* Natural-language schedule parser. Uses pinned Chrono v2 when available, with a small local fallback. */
(function () {
  const chronoPromise = import('https://cdn.jsdelivr.net/npm/chrono-node@2.10.2/+esm').catch(() => null);
  const pad = number => String(number).padStart(2, '0');
  const keyOf = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const dateTimeOf = date => `${keyOf(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;

  function parseDuration(title, fallback = 60) {
    const match = String(title || '').match(/!\s*(?:(\d+)\s*h(?:ours?)?)?\s*(?:(\d+)\s*m(?:in(?:ute)?s?)?)?/i);
    if (!match || (!match[1] && !match[2])) return { title: String(title || '').trim(), minutes: Math.max(15, Number(fallback) || 60), shortcut: false };
    const minutes = Math.max(15, Math.min(1440, (Number(match[1]) || 0) * 60 + (Number(match[2]) || 0)));
    return { title: String(title || '').replace(match[0], ' ').replace(/\s+/g, ' ').trim(), minutes, shortcut: true };
  }
  function extractRecurrence(text) {
    let cleaned = text;
    const rules = [
      { pattern: /\bevery\s+other\s+day\b/i, recurrence: { kind: 'interval', intervalDays: 2, phrase: 'Every other day' } },
      { pattern: /\bevery\s+(\d+)\s+days?\b/i, make: match => ({ kind: 'interval', intervalDays: Number(match[1]), phrase: `Every ${match[1]} days` }) },
      { pattern: /\b(?:every\s+weekday|weekdays)\b/i, recurrence: { kind: 'weekdays', phrase: 'Weekdays' } },
      { pattern: /\b(?:every\s+day|daily)\b/i, recurrence: { kind: 'interval', intervalDays: 1, phrase: 'Daily' } },
      { pattern: /\b(?:every\s+week|weekly)\b/i, recurrence: { kind: 'interval', intervalDays: 7, phrase: 'Weekly' } }
    ];
    let recurrence = null;
    for (const rule of rules) {
      const match = cleaned.match(rule.pattern);
      if (match) { recurrence = rule.make ? rule.make(match) : { ...rule.recurrence }; cleaned = cleaned.replace(match[0], ' '); break; }
    }
    cleaned = cleaned.replace(/\b(?:starting|start(?:ing)?|beginning|from)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    return { recurrence, cleaned };
  }
  function explicitDateCue(text) {
    return /\b(?:today|tomorrow|tonight|day after tomorrow|next\s+(?:week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|this\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?))\b/i.test(text);
  }
  function parseTimeFallback(text) {
    let match = text.match(/\b(?:at\s*)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
    if (!match) match = text.match(/\bat\s+(\d{1,2}):(\d{2})\b/i);
    if (!match) return null;
    let hour = Number(match[1]), minute = Number(match[2] || 0);
    if (match[3]) { const meridian = match[3].toLowerCase(); if (meridian === 'pm' && hour < 12) hour += 12; if (meridian === 'am' && hour === 12) hour = 0; }
    return { hour: Math.min(23, hour), minute: Math.min(59, minute) };
  }
  function parseFallback(text, now) {
    const date = new Date(now); date.setSeconds(0, 0);
    const relative = text.match(/\bin\s+(\d+)\s+(minutes?|mins?|hours?|hrs?|days?)\b/i);
    if (relative) { const count = Number(relative[1]); const unit = relative[2].toLowerCase(); date.setTime(date.getTime() + count * (unit.startsWith('m') ? 60000 : unit.startsWith('h') ? 3600000 : 86400000)); return date; }
    if (/\bday after tomorrow\b/i.test(text)) date.setDate(date.getDate() + 2);
    else if (/\btomorrow|tonight\b/i.test(text)) date.setDate(date.getDate() + 1);
    else if (/\btoday\b/i.test(text)) { /* keep date */ }
    else {
      const iso = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      if (iso) date.setFullYear(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
      else {
        const weekdays = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const wanted = weekdays.findIndex(day => new RegExp(`\\b${day}\\b`, 'i').test(text));
        if (wanted >= 0) { let delta = (wanted - date.getDay() + 7) % 7; if (delta === 0 || /\bnext\b/i.test(text)) delta += 7; date.setDate(date.getDate() + delta); }
      }
    }
    const time = parseTimeFallback(text);
    if (time) { date.setHours(time.hour, time.minute, 0, 0); if (!explicitDateCue(text) && date <= now) date.setDate(date.getDate() + 1); }
    else date.setHours(0, 0, 0, 0);
    return date;
  }
  function recurrenceText(rule) { return rule?.phrase || ''; }
  function formatDate(dateKey, now = new Date()) {
    if (!dateKey) return '';
    if (dateKey === keyOf(now)) return 'Today';
    const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1);
    if (dateKey === keyOf(tomorrow)) return 'Tomorrow';
    return new Date(`${dateKey}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }
  function formatTime(time) {
    if (!time) return '';
    const [hour, minute] = time.split(':').map(Number);
    const date = new Date(); date.setHours(hour, minute, 0, 0);
    return date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  }
  async function parse(text, now = new Date()) {
    text = String(text || '').trim();
    if (!text) return null;
    const { recurrence, cleaned } = extractRecurrence(text);
    const explicit = explicitDateCue(text);
    let chrono = null;
    try { chrono = await chronoPromise; } catch (_) { /* local fallback below */ }
    let date = null;
    if (chrono?.parseDate) {
      try { date = chrono.parseDate(cleaned || text, now, { forwardDate: true }); } catch (_) { date = null; }
    }
    if (!date || Number.isNaN(date.getTime())) date = parseFallback(cleaned || text, now);
    else {
      const hasTime = /\b(?:at\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\bat\s+\d{1,2}:\d{2}\b/i.test(cleaned);
      if (!hasTime) date.setHours(0, 0, 0, 0);
      if (recurrence && !explicit) {
        const first = new Date(now); first.setDate(first.getDate() + 1);
        first.setHours(hasTime ? date.getHours() : 0, hasTime ? date.getMinutes() : 0, 0, 0);
        date = first;
      } else if (hasTime && !explicit && date <= now) date.setDate(date.getDate() + 1);
    }
    const dateKey = keyOf(date);
    const time = /\b(?:at\s*)?\d{1,2}(?::\d{2})?\s*(?:am|pm)\b|\bat\s+\d{1,2}:\d{2}\b/i.test(cleaned) ? `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}` : '';
    const rule = recurrence ? { ...recurrence, startDate: dateKey } : null;
    const label = `${formatDate(dateKey, now)}${time ? ` ${formatTime(time)}` : ''}`;
    return { date: dateKey, time, startAt: time ? dateTimeOf(date) : '', allDay: !time, recurrence: rule, label, recurrenceLabel: recurrenceText(rule), source: text };
  }
  window.TaskScheduleParser = { parse, parseDuration, formatDate, formatTime };
})();
