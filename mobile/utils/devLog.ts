// ---------------------------------------------------------------------------
// utils/devLog.ts — logging that only happens in development builds
//
// Release builds stay quiet (no receipt text, emails or amounts in the
// phone's logs). console.warn / console.error are kept for real problems.
// ---------------------------------------------------------------------------
const dev = typeof __DEV__ !== "undefined" ? __DEV__ : process.env.NODE_ENV !== "production";
const noop = () => {};

export const devLog: (...args: unknown[]) => void = dev ? console.log.bind(console) : noop;
export const devTime: (label: string) => void = dev ? console.time.bind(console) : noop;
export const devTimeEnd: (label: string) => void = dev ? console.timeEnd.bind(console) : noop;
