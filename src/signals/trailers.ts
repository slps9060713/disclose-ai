export interface Trailer {
  key: string;
  value: string;
}

const TRAILER_LINE = /^([A-Za-z][A-Za-z0-9-]*)\s*:\s*(.+?)\s*$/;

/** Lenient scan: every "Key: value" line anywhere in the message. Callers filter by key. */
export function parseTrailers(message: string): Trailer[] {
  const out: Trailer[] = [];
  for (const raw of message.replace(/\r\n/g, "\n").split("\n")) {
    const m = TRAILER_LINE.exec(raw.trim());
    if (m?.[1] && m[2]) out.push({ key: m[1], value: m[2] });
  }
  return out;
}

export function parsePerson(value: string): { name: string; email: string } {
  const m = /^(.*?)\s*<([^>]*)>\s*$/.exec(value.trim());
  if (m) return { name: (m[1] ?? "").trim(), email: (m[2] ?? "").trim() };
  return { name: value.trim(), email: "" };
}
