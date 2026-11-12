import type { Policy } from "../policy/schema.js";
import { COMMENT_MARKER } from "../report/comment.js";
import type { CommentData, GitHubApi, PullRef } from "./api.js";

export const LABEL_META = {
  assisted: { color: "0e8a16", description: "AI-assisted contribution, disclosed per policy" },
  undisclosed: {
    color: "d93f0b",
    description: "AI signals detected; disclosure required by policy",
  },
} as const;

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/**
 * A comment only qualifies as one this tool posted when its body starts with COMMENT_MARKER
 * (an anchored check — the renderer guarantees the marker is the literal first thing it emits,
 * and Task 7 sanitizes echoed contributor text so the marker cannot be forged mid-body), AND its
 * author matches.
 *
 * Author matching has two modes. When the caller can resolve its own authenticated identity
 * (`identity`, from `GitHubApi.getAuthenticatedLogin`), match on that login directly — this is
 * what makes `disclose-ai check --apply` and any Action wired to a personal access token
 * recognise their own prior comment instead of posting a fresh one every run, since a PAT's
 * comments are authored by a human account, not a Bot. `GET /user` returns 403 for the Action's
 * default `GITHUB_TOKEN`, so `identity` is undefined in exactly that case, and we fall back to
 * the original Bot-type rule — this is the normal path for the Action and must keep working with
 * no extra configuration. Without either check, a contributor could post their own comment
 * starting with the marker and hijack every future update.
 */
function isOwnComment(c: CommentData, identity: string | undefined): boolean {
  if (!(c.body ?? "").startsWith(COMMENT_MARKER)) return false;
  if (identity !== undefined) return (c.user?.login ?? "").toLowerCase() === identity.toLowerCase();
  return c.user?.type === "Bot";
}

/**
 * Looks up this tool's own comment, if any. Exported so callers that need to know whether a
 * comment already exists (e.g. `runGate`, to decide whether a passing pull request should still
 * get its stale comment updated) can do the lookup once and hand the result to `upsertComment`
 * rather than paying for a second `listComments` call.
 */
export async function findOwnComment(
  api: GitHubApi,
  ref: PullRef,
): Promise<CommentData | undefined> {
  const [identity, comments] = await Promise.all([
    api.getAuthenticatedLogin(),
    api.listComments(ref),
  ]);
  return comments.find((c) => isOwnComment(c, identity));
}

/** A lookup the caller already performed, so `upsertComment`'s first attempt can reuse it. */
export interface KnownComment {
  existing: CommentData | undefined;
}

export async function upsertComment(
  api: GitHubApi,
  ref: PullRef,
  body: string,
  known?: KnownComment,
): Promise<"created" | "updated"> {
  // On the first attempt, reuse a caller-supplied lookup when one was given. On the retry,
  // always re-list — this is what makes a lost-response case (the write succeeded but the
  // response was lost) update the now-existing comment instead of creating a duplicate.
  const attempt = async (useKnown: boolean): Promise<"created" | "updated"> => {
    const existing = useKnown && known ? known.existing : await findOwnComment(api, ref);
    if (existing) {
      await api.updateComment(ref.owner, ref.repo, existing.id, body);
      return "updated";
    }
    await api.createComment(ref, body);
    return "created";
  };
  try {
    return await attempt(true);
  } catch {
    return await attempt(false);
  }
}

export interface LabelSyncResult {
  added: string[];
  removed: string[];
  warnings: string[];
}

export async function syncLabels(
  api: GitHubApi,
  ref: PullRef,
  add: string[],
  remove: string[],
  names: Policy["enforcement"]["labels"],
): Promise<LabelSyncResult> {
  const result: LabelSyncResult = { added: [], removed: [], warnings: [] };

  for (const name of add) {
    const meta = name === names.assisted ? LABEL_META.assisted : LABEL_META.undisclosed;
    try {
      await api.ensureLabel(ref.owner, ref.repo, name, meta.color, meta.description);
    } catch (err) {
      result.warnings.push(`could not create label "${name}": ${message(err)}`);
    }
  }
  if (add.length > 0) {
    try {
      await api.addLabels(ref, add);
      result.added.push(...add);
    } catch (err) {
      result.warnings.push(`could not add labels ${add.join(", ")}: ${message(err)}`);
    }
  }
  for (const name of remove) {
    try {
      await api.removeLabel(ref, name);
      result.removed.push(name);
    } catch (err) {
      result.warnings.push(`could not remove label "${name}": ${message(err)}`);
    }
  }
  return result;
}
