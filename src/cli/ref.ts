import type { PullRef } from "../github/api.js";
import { CliError } from "./errors.js";

export function parsePullRef(input: string): PullRef {
  const s = input.trim();
  const url = /^https?:\/\/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/i.exec(s);
  if (url?.[1] && url[2] && url[3]) return { owner: url[1], repo: url[2], number: Number(url[3]) };
  const short = /^([^/\s#]+)\/([^/\s#]+)#(\d+)$/.exec(s);
  if (short?.[1] && short[2] && short[3])
    return { owner: short[1], repo: short[2], number: Number(short[3]) };
  throw new CliError(
    `Cannot parse pull request reference "${input}". Use owner/repo#123 or a GitHub pull request URL.`,
    2,
  );
}
