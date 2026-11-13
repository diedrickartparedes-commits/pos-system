export function localDateKey(date: Date, timeZone = process.env.BUSINESS_TIMEZONE || "America/Belize") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function zonedMidnight(key: string, timeZone = process.env.BUSINESS_TIMEZONE || "America/Belize") {
  const [year, month, day] = key.split("-").map(Number);
  const guess = new Date(Date.UTC(year, month - 1, day));
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(guess);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const asUtc = Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second));
  return new Date(guess.getTime() - (asUtc - guess.getTime()));
}
export function nextDateKey(key: string) { const d=new Date(`${key}T00:00:00Z`);d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10); }
