const LEVELS = ['debug', 'info', 'warn', 'error'];
const level = process.env.LOG_LEVEL || 'info';
const threshold = LEVELS.indexOf(level);

function logAt(idx, obj) {
  if (idx < threshold) return;
  const payload = {
    ts: new Date().toISOString(),
    ...obj
  };
  process.stdout.write(JSON.stringify(payload) + '\n');
}

export const logger = {
  debug: (msg, extra = {}) => logAt(0, { level: 'debug', msg, ...extra }),
  info:  (msg, extra = {}) => logAt(1, { level: 'info',  msg, ...extra }),
  warn:  (msg, extra = {}) => logAt(2, { level: 'warn',  msg, ...extra }),
  error: (msg, extra = {}) => logAt(3, { level: 'error', msg, ...extra }),
};
