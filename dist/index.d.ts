import { z } from 'zod';

interface ExecOptions {
    cwd: string;
    env: NodeJS.ProcessEnv;
    timeoutMs: number;
    stdin: string;
}
interface ExecResult {
    code: number | null;
    stdout: string;
    stderr: string;
    timedOut: boolean;
}
type Exec = (cmd: string, args: string[], opts: ExecOptions) => Promise<ExecResult>;
declare const defaultExec: Exec;

declare const SIGNAL_IDS: readonly ["coauthor-trailer", "branch-prefix", "bot-author", "session-trailer", "commit-pattern"];
declare const policySchema: z.ZodObject<{
    version: z.ZodLiteral<1>;
    disclosure: z.ZodDefault<z.ZodObject<{
        required: z.ZodDefault<z.ZodEnum<["when-detected", "always", "never"]>>;
        fields: z.ZodDefault<z.ZodArray<z.ZodEnum<["tool", "extent"]>, "many">>;
        heading: z.ZodDefault<z.ZodString>;
        no_ai_phrase: z.ZodDefault<z.ZodString>;
    }, "strict", z.ZodTypeAny, {
        required: "when-detected" | "always" | "never";
        fields: ("tool" | "extent")[];
        heading: string;
        no_ai_phrase: string;
    }, {
        required?: "when-detected" | "always" | "never" | undefined;
        fields?: ("tool" | "extent")[] | undefined;
        heading?: string | undefined;
        no_ai_phrase?: string | undefined;
    }>>;
    detection: z.ZodDefault<z.ZodObject<{
        signals: z.ZodDefault<z.ZodArray<z.ZodEnum<["coauthor-trailer", "branch-prefix", "bot-author", "session-trailer", "commit-pattern"]>, "many">>;
        min_confidence: z.ZodDefault<z.ZodEnum<["high", "medium", "low"]>>;
        custom_patterns: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    }, "strict", z.ZodTypeAny, {
        signals: ("coauthor-trailer" | "branch-prefix" | "bot-author" | "session-trailer" | "commit-pattern")[];
        min_confidence: "high" | "medium" | "low";
        custom_patterns: string[];
    }, {
        signals?: ("coauthor-trailer" | "branch-prefix" | "bot-author" | "session-trailer" | "commit-pattern")[] | undefined;
        min_confidence?: "high" | "medium" | "low" | undefined;
        custom_patterns?: string[] | undefined;
    }>>;
    enforcement: z.ZodDefault<z.ZodObject<{
        mode: z.ZodDefault<z.ZodEnum<["comment+label", "label-only", "fail"]>>;
        comment_on_pass: z.ZodDefault<z.ZodBoolean>;
        labels: z.ZodDefault<z.ZodObject<{
            assisted: z.ZodDefault<z.ZodString>;
            undisclosed: z.ZodDefault<z.ZodString>;
        }, "strict", z.ZodTypeAny, {
            assisted: string;
            undisclosed: string;
        }, {
            assisted?: string | undefined;
            undisclosed?: string | undefined;
        }>>;
        exempt: z.ZodDefault<z.ZodObject<{
            users: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
            bots: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
        }, "strict", z.ZodTypeAny, {
            users: string[];
            bots: string[];
        }, {
            users?: string[] | undefined;
            bots?: string[] | undefined;
        }>>;
    }, "strict", z.ZodTypeAny, {
        mode: "comment+label" | "label-only" | "fail";
        comment_on_pass: boolean;
        labels: {
            assisted: string;
            undisclosed: string;
        };
        exempt: {
            users: string[];
            bots: string[];
        };
    }, {
        mode?: "comment+label" | "label-only" | "fail" | undefined;
        comment_on_pass?: boolean | undefined;
        labels?: {
            assisted?: string | undefined;
            undisclosed?: string | undefined;
        } | undefined;
        exempt?: {
            users?: string[] | undefined;
            bots?: string[] | undefined;
        } | undefined;
    }>>;
    review: z.ZodDefault<z.ZodObject<{
        codex: z.ZodDefault<z.ZodObject<{
            enabled: z.ZodDefault<z.ZodBoolean>;
            model: z.ZodDefault<z.ZodString>;
            min_changed_lines: z.ZodDefault<z.ZodNumber>;
            max_diff_kb: z.ZodDefault<z.ZodNumber>;
            timeout_seconds: z.ZodDefault<z.ZodNumber>;
        }, "strict", z.ZodTypeAny, {
            enabled: boolean;
            model: string;
            min_changed_lines: number;
            max_diff_kb: number;
            timeout_seconds: number;
        }, {
            enabled?: boolean | undefined;
            model?: string | undefined;
            min_changed_lines?: number | undefined;
            max_diff_kb?: number | undefined;
            timeout_seconds?: number | undefined;
        }>>;
    }, "strict", z.ZodTypeAny, {
        codex: {
            enabled: boolean;
            model: string;
            min_changed_lines: number;
            max_diff_kb: number;
            timeout_seconds: number;
        };
    }, {
        codex?: {
            enabled?: boolean | undefined;
            model?: string | undefined;
            min_changed_lines?: number | undefined;
            max_diff_kb?: number | undefined;
            timeout_seconds?: number | undefined;
        } | undefined;
    }>>;
}, "strict", z.ZodTypeAny, {
    version: 1;
    disclosure: {
        required: "when-detected" | "always" | "never";
        fields: ("tool" | "extent")[];
        heading: string;
        no_ai_phrase: string;
    };
    detection: {
        signals: ("coauthor-trailer" | "branch-prefix" | "bot-author" | "session-trailer" | "commit-pattern")[];
        min_confidence: "high" | "medium" | "low";
        custom_patterns: string[];
    };
    enforcement: {
        mode: "comment+label" | "label-only" | "fail";
        comment_on_pass: boolean;
        labels: {
            assisted: string;
            undisclosed: string;
        };
        exempt: {
            users: string[];
            bots: string[];
        };
    };
    review: {
        codex: {
            enabled: boolean;
            model: string;
            min_changed_lines: number;
            max_diff_kb: number;
            timeout_seconds: number;
        };
    };
}, {
    version: 1;
    disclosure?: {
        required?: "when-detected" | "always" | "never" | undefined;
        fields?: ("tool" | "extent")[] | undefined;
        heading?: string | undefined;
        no_ai_phrase?: string | undefined;
    } | undefined;
    detection?: {
        signals?: ("coauthor-trailer" | "branch-prefix" | "bot-author" | "session-trailer" | "commit-pattern")[] | undefined;
        min_confidence?: "high" | "medium" | "low" | undefined;
        custom_patterns?: string[] | undefined;
    } | undefined;
    enforcement?: {
        mode?: "comment+label" | "label-only" | "fail" | undefined;
        comment_on_pass?: boolean | undefined;
        labels?: {
            assisted?: string | undefined;
            undisclosed?: string | undefined;
        } | undefined;
        exempt?: {
            users?: string[] | undefined;
            bots?: string[] | undefined;
        } | undefined;
    } | undefined;
    review?: {
        codex?: {
            enabled?: boolean | undefined;
            model?: string | undefined;
            min_changed_lines?: number | undefined;
            max_diff_kb?: number | undefined;
            timeout_seconds?: number | undefined;
        } | undefined;
    } | undefined;
}>;
type Policy = z.infer<typeof policySchema>;
type EnforcementMode = Policy["enforcement"]["mode"];
declare const DEFAULT_POLICY: Policy;

type Confidence = "high" | "medium" | "low";
declare const CONFIDENCE_RANK: Record<Confidence, number>;
type SignalId = "coauthor-trailer" | "branch-prefix" | "bot-author" | "session-trailer" | "commit-pattern";
type Tool = "claude" | "codex" | "copilot" | "cursor" | "devin" | "gemini" | "aider" | "cline" | "jules" | "unknown";
interface Commit {
    sha: string;
    message: string;
    author: {
        name: string;
        email: string;
        login?: string;
    };
}
interface PullRequestContext {
    owner: string;
    repo: string;
    number: number;
    title: string;
    body: string;
    author: {
        login: string;
        type: "User" | "Bot";
    };
    headRef: string;
    baseRef: string;
    commits: Commit[];
    additions: number;
    deletions: number;
    changedFiles: number;
    labels: string[];
    diff?: string;
}
interface Signal {
    id: SignalId;
    tool: Tool;
    confidence: Confidence;
    evidence: string;
    source: {
        kind: "commit" | "branch" | "author" | "body";
        ref?: string;
    };
}
interface Disclosure {
    present: boolean;
    noAi: boolean;
    tool?: string;
    extent?: string;
    missingFields: string[];
    raw?: string;
}
type VerdictStatus = "pass" | "needs-disclosure" | "skipped" | "invalid-policy";
interface Verdict {
    status: VerdictStatus;
    aiDetected: boolean;
    signals: Signal[];
    disclosure: Disclosure;
    labelsToAdd: string[];
    labelsToRemove: string[];
    checklist: string[];
    reasons: string[];
}
interface TriageData {
    description_matches_diff: "yes" | "partial" | "no";
    tests_included: boolean;
    risk_areas: string[];
    suggested_review_depth: "skim" | "standard" | "deep";
    flags: string[];
    summary: string;
}
type TriageResult = {
    ok: true;
    data: TriageData;
} | {
    ok: false;
    reason: string;
};

interface PromptInput {
    ctx: PullRequestContext;
    policy: Policy;
    diff: string;
}
declare function buildTriagePrompt({ ctx, policy, diff }: PromptInput): {
    prompt: string;
    truncated: boolean;
};

/** Pinned Codex CLI version. Bump deliberately; the output format is validated against triageSchema either way. */
declare const CODEX_CLI_VERSION = "0.155.0";
interface TriageDeps {
    exec: Exec;
    apiKey: string;
    model?: string;
    codexVersion?: string;
    mkTmpDir?: () => Promise<string>;
}
declare function runTriage(ctx: PullRequestContext, policy: Policy, deps: TriageDeps): Promise<TriageResult>;

declare const triageSchema: z.ZodObject<{
    description_matches_diff: z.ZodEnum<["yes", "partial", "no"]>;
    tests_included: z.ZodBoolean;
    risk_areas: z.ZodArray<z.ZodString, "many">;
    suggested_review_depth: z.ZodEnum<["skim", "standard", "deep"]>;
    flags: z.ZodArray<z.ZodString, "many">;
    summary: z.ZodString;
}, "strict", z.ZodTypeAny, {
    description_matches_diff: "yes" | "partial" | "no";
    tests_included: boolean;
    risk_areas: string[];
    suggested_review_depth: "skim" | "standard" | "deep";
    flags: string[];
    summary: string;
}, {
    description_matches_diff: "yes" | "partial" | "no";
    tests_included: boolean;
    risk_areas: string[];
    suggested_review_depth: "skim" | "standard" | "deep";
    flags: string[];
    summary: string;
}>;
declare const TRIAGE_JSON_SCHEMA: {
    readonly type: "object";
    readonly additionalProperties: false;
    readonly required: readonly ["description_matches_diff", "tests_included", "risk_areas", "suggested_review_depth", "flags", "summary"];
    readonly properties: {
        readonly description_matches_diff: {
            readonly type: "string";
            readonly enum: readonly ["yes", "partial", "no"];
        };
        readonly tests_included: {
            readonly type: "boolean";
        };
        readonly risk_areas: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
                readonly maxLength: 80;
            };
            readonly maxItems: 6;
        };
        readonly suggested_review_depth: {
            readonly type: "string";
            readonly enum: readonly ["skim", "standard", "deep"];
        };
        readonly flags: {
            readonly type: "array";
            readonly items: {
                readonly type: "string";
                readonly maxLength: 160;
            };
            readonly maxItems: 6;
        };
        readonly summary: {
            readonly type: "string";
            readonly maxLength: 280;
        };
    };
};

interface DecideInput {
    policy: Policy;
    signals: Signal[];
    disclosure: Disclosure;
    ctx: PullRequestContext;
}
declare function invalidPolicyVerdict(errors: string[]): Verdict;
declare function planLabels(current: string[], names: Policy["enforcement"]["labels"], wantAssisted: boolean, wantUndisclosed: boolean): {
    add: string[];
    remove: string[];
};
declare function buildChecklist(cfg: Policy["disclosure"], d: Disclosure): string[];
declare function decide({ policy, signals, disclosure, ctx }: DecideInput): Verdict;

declare function parseDisclosure(body: string, cfg: Policy["disclosure"]): Disclosure;

interface PullRef {
    owner: string;
    repo: string;
    number: number;
}
interface PullData {
    title: string;
    body: string | null;
    user: {
        login: string;
        type: string;
    } | null;
    head: {
        ref: string;
    };
    base: {
        ref: string;
    };
    additions: number;
    deletions: number;
    changed_files: number;
    labels: Array<{
        name: string;
    }>;
}
interface CommitData {
    sha: string;
    commit: {
        message: string;
        author: {
            name?: string | null;
            email?: string | null;
        } | null;
    };
    author: {
        login: string;
    } | null;
}
interface CommentData {
    id: number;
    body?: string;
    user: {
        login: string;
        type?: string;
    } | null;
}
interface GitHubApi {
    getPull(ref: PullRef): Promise<PullData>;
    listCommits(ref: PullRef): Promise<CommitData[]>;
    getDiff(ref: PullRef): Promise<string>;
    getFileText(owner: string, repo: string, path: string, ref: string): Promise<string | undefined>;
    listComments(ref: PullRef): Promise<CommentData[]>;
    /**
     * The login of the identity this client is authenticated as, or undefined when it cannot be
     * determined. `GET /user` returns 403 for the Action's default `GITHUB_TOKEN` (it has no user
     * to authenticate as), so undefined is the expected, normal result there -- callers must treat
     * it as "unknown", not as an error.
     */
    getAuthenticatedLogin(): Promise<string | undefined>;
    createComment(ref: PullRef, body: string): Promise<void>;
    updateComment(owner: string, repo: string, commentId: number, body: string): Promise<void>;
    addLabels(ref: PullRef, labels: string[]): Promise<void>;
    removeLabel(ref: PullRef, label: string): Promise<void>;
    ensureLabel(owner: string, repo: string, name: string, color: string, description: string): Promise<void>;
}
declare function createOctokitApi(token: string): GitHubApi;

declare function fetchPullRequestContext(api: GitHubApi, ref: PullRef): Promise<PullRequestContext>;
declare function fetchPolicyText(api: GitHubApi, ref: PullRef, baseRef: string, path: string): Promise<string | undefined>;

declare const LABEL_META: {
    readonly assisted: {
        readonly color: "0e8a16";
        readonly description: "AI-assisted contribution, disclosed per policy";
    };
    readonly undisclosed: {
        readonly color: "d93f0b";
        readonly description: "AI signals detected; disclosure required by policy";
    };
};
/** A lookup the caller already performed, so `upsertComment`'s first attempt can reuse it. */
interface KnownComment {
    existing: CommentData | undefined;
}
declare function upsertComment(api: GitHubApi, ref: PullRef, body: string, known?: KnownComment): Promise<"created" | "updated">;
interface LabelSyncResult {
    added: string[];
    removed: string[];
    warnings: string[];
}
declare function syncLabels(api: GitHubApi, ref: PullRef, add: string[], remove: string[], names: Policy["enforcement"]["labels"]): Promise<LabelSyncResult>;

type PolicyParseResult = {
    ok: true;
    policy: Policy;
    source: "file" | "default";
} | {
    ok: false;
    errors: string[];
};
declare function parsePolicy(text: string | undefined): PolicyParseResult;

declare const TEMPLATE_NAMES: readonly ["standard", "strict", "light"];
type TemplateName = (typeof TEMPLATE_NAMES)[number];
declare function getTemplate(name: TemplateName): string;

declare const COMMENT_MARKER = "<!-- disclose-ai:v1 -->";
interface RenderOptions {
    policyPath: string;
    policySource: "file" | "default";
    projectUrl: string;
}
declare function shouldComment(verdict: Verdict, policy: Policy): boolean;
declare function renderComment(verdict: Verdict, triage: TriageResult | undefined, policy: Policy, opts: RenderOptions): string;

declare const PROJECT_URL = "https://github.com/slps9060713/disclose-ai";
type Triager = (ctx: PullRequestContext, policy: Policy) => Promise<TriageResult>;
interface GateInputs {
    ref: PullRef;
    policyPath: string;
    apply: boolean;
    modeOverride?: EnforcementMode;
    codexEnabledOverride?: boolean;
    projectUrl?: string;
}
interface GateDeps {
    api: GitHubApi;
    triage?: Triager;
    log?: (message: string) => void;
}
interface GateResult {
    ctx: PullRequestContext;
    policy: Policy;
    policySource: "file" | "default" | "invalid";
    policyErrors: string[];
    verdict: Verdict;
    triage?: TriageResult;
    comment?: string;
    commented: "created" | "updated" | "skipped";
    labelsAdded: string[];
    labelsRemoved: string[];
    finalLabels: string[];
    warnings: string[];
    exitCode: 0 | 1;
}
declare function runGate(inputs: GateInputs, deps: GateDeps): Promise<GateResult>;

declare function detectSignals(ctx: PullRequestContext, detection: Policy["detection"]): Signal[];

export { CODEX_CLI_VERSION, COMMENT_MARKER, CONFIDENCE_RANK, type Commit, type Confidence, DEFAULT_POLICY, type Disclosure, type EnforcementMode, type Exec, type GateDeps, type GateInputs, type GateResult, type GitHubApi, LABEL_META, type LabelSyncResult, PROJECT_URL, type Policy, type PolicyParseResult, type PullRef, type PullRequestContext, type RenderOptions, SIGNAL_IDS, type Signal, type SignalId, TEMPLATE_NAMES, TRIAGE_JSON_SCHEMA, type TemplateName, type Tool, type TriageData, type TriageDeps, type TriageResult, type Triager, type Verdict, type VerdictStatus, buildChecklist, buildTriagePrompt, createOctokitApi, decide, defaultExec, detectSignals, fetchPolicyText, fetchPullRequestContext, getTemplate, invalidPolicyVerdict, parseDisclosure, parsePolicy, planLabels, policySchema, renderComment, runGate, runTriage, shouldComment, syncLabels, triageSchema, upsertComment };
