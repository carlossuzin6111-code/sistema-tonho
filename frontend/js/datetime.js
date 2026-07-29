// Timestamps from the API are UTC. Display conversion stays exclusively in the browser.
(function attachDateTime(global) {
  function parseUtc(value) {
    if (!value) return null;
    const raw = String(value).trim();
    const normalized = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw)
      ? raw
      : `${raw.replace(' ', 'T')}Z`;
    const date = new Date(normalized);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function format(value, options) {
    const date = parseUtc(value);
    return date ? new Intl.DateTimeFormat(undefined, options).format(date) : '-';
  }

  global.AppDateTime = Object.freeze({
    parseUtc,
    date: value => format(value, { day: '2-digit', month: '2-digit', year: 'numeric' }),
    shortDate: value => format(value, { day: 'numeric', month: 'short' }),
    time: value => format(value, { hour: '2-digit', minute: '2-digit' }),
    dateTime: value => format(value, { dateStyle: 'short', timeStyle: 'short' })
  });
})(window);
