const logger = {
  log(...args: unknown[]) { console.log(...args); },
  info(...args: unknown[]) { console.log(...args); },
  warn(...args: unknown[]) { console.warn(...args); },
  error(...args: unknown[]) { console.error(...args); },
  debug(...args: unknown[]) { console.debug(...args); },
};

export default logger;
