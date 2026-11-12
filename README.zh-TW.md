# disclose-ai

> AI 貢獻政策即程式碼。偵測由 AI 協助完成的 pull request,依你的專案希望的方式要求揭露,並可選擇讓 Codex 執行結構化的初步審查。

[![npm](https://img.shields.io/npm/v/disclose-ai)](https://www.npmjs.com/package/disclose-ai)
[![downloads](https://img.shields.io/npm/dm/disclose-ai)](https://www.npmjs.com/package/disclose-ai)
[![CI](https://github.com/slps9060713/disclose-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/slps9060713/disclose-ai/actions/workflows/ci.yml)
[![Marketplace](https://img.shields.io/badge/GitHub%20Marketplace-disclose--ai-blue?logo=github)](https://github.com/marketplace/actions/disclose-ai)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)

[English](README.md)

維護者正被 AI 產生的 pull request 淹沒。多數專案的對策只是在 `CONTRIBUTING.md` 裡寫一段沒人會讀的文字。disclose-ai 把那段文字變成一次兩分鐘的安裝:用一份 YAML 檔宣告你的政策,之後每個 pull request 都會被檢查、貼上標籤,並在需要時收到一則友善的留言,清楚說明該補上什麼。

它要求的是**揭露**,不是禁用。正如 ghostty 維護者所說:「問題在人,不在工具。」

## 功能

- **從五種訊號偵測 AI 參與**:co-author trailer(Claude、Codex、Copilot、Cursor、Devin、Gemini、Jules)、agent 分支前綴(`codex/`、`claude/`、`copilot/`、`cursor/`、`devin/`、`cline/`、`aider/`、`gemini/`、`jules/`)、bot 帳號、session-id trailer,以及像 `(aider)` 或 "Generated with Claude Code" 這類的 commit 訊息樣式。
- **讀取 pull request 描述中的揭露內容**(工具與程度),並依你的政策套用規則:一律要求揭露、只在偵測到時要求,或完全不要求。
- **留下一則會就地更新的留言**,列出證據與可直接複製貼上的範本,並同步兩個 label:`ai-assisted` 與 `ai-undisclosed`。
- **可選擇用 Codex 進行審查**:`codex exec --output-schema` 會在唯讀沙箱中執行,回報描述是否與 diff 相符、是否包含測試,以及建議的人工審查深度。
- **絕不核准、絕不合併,也絕不 checkout 或執行 pull request 的程式碼。**

## 快速開始

```bash
npx disclose-ai init --with-workflow
git add .github && git commit -m "ci: add disclose-ai"
```

這會寫入 `.github/ai-policy.yml`(`standard` 模板:留言與貼標籤,絕不阻擋)以及 `.github/workflows/disclose-ai.yml`。要啟用 Codex 審查,加入一個 `OPENAI_API_KEY` repository secret 即可,不需要其他設定。

## 政策檔

```yaml
# .github/ai-policy.yml
version: 1

disclosure:
  required: when-detected        # when-detected | always | never
  fields: [tool, extent]         # what the disclosure must state
  heading: "AI Disclosure"       # section title to look for in the PR description
  no_ai_phrase: "No AI tools were used"

detection:
  signals: [coauthor-trailer, branch-prefix, bot-author, session-trailer, commit-pattern]
  min_confidence: medium         # high | medium | low
  custom_patterns: []            # extra regexes matched against commit messages

enforcement:
  mode: comment+label            # comment+label | label-only | fail
  comment_on_pass: false
  labels: { assisted: ai-assisted, undisclosed: ai-undisclosed }
  exempt:
    users: []
    bots: ["dependabot[bot]", "renovate[bot]", "github-actions[bot]"]

review:
  codex:
    enabled: false
    model: ""                    # empty = Codex CLI default
    min_changed_lines: 20
    max_diff_kb: 200
    timeout_seconds: 180
```

除了 `version` 以外,每個欄位都是選填的。CLI 內建三種模板:

| 模板 | 揭露要求 | 模式 | 適用情境 |
|---|---|---|---|
| `standard`(預設) | 偵測到才要求 | comment + label | 想要能見度又不想造成阻力 |
| `strict` | 一律要求,包含「No AI tools were used」 | `fail` | 想採用 ghostty 的模式:每個 pull request 都要聲明 AI 使用情形 |
| `light` | 偵測到才要求 | 僅 label | 只想要統計數據 |

`npx disclose-ai init --template strict --with-workflow`

## 貢獻者會看到什麼

當政策要求揭露,而描述裡還沒有揭露內容時:

> ### 🤖 AI disclosure needed
> This repository asks contributors to disclose AI assistance. Signals suggest an AI coding tool was involved, and the pull request description does not yet include a complete disclosure. This is not a rejection.
>
> **What was detected**
> - `coauthor-trailer` (high, claude): commit a1a1a1a: Co-authored-by: Claude <noreply@anthropic.com>
>
> **What to do**
> - [ ] Add a "## AI Disclosure" section to the pull request description.
> - [ ] State the tool you used (for example Claude Code, Codex, Cursor, Copilot).
> - [ ] State the extent: what the tool produced, and what you reviewed, changed and tested yourself.
> - [ ] If no AI tools were involved, write "No AI tools were used" in that section instead.

（上面的留言內容以英文呈現,因為這正是工具實際貼出的文字,一字不改。）貢獻者編輯描述後,workflow 會在 `edited` 事件重新執行,同一則留言會被更新,label 也會改成 `ai-assisted`。

## 安全模型

disclose-ai 執行在 `pull_request_target` 上,才能對來自 fork 的 pull request留言。這個事件只有在 workflow 絕不執行不受信任的程式碼時才安全,因此:

- 產生出來的 workflow **沒有 `actions/checkout` 步驟**。pull request 的中繼資料、commit 與 diff 都是透過 GitHub API 以文字形式讀取。
- 這個 action 把相依套件全部打包進去;pull request 裡的任何內容都不會被安裝或執行。
- Codex 審查在一個**全新的空暫存目錄**中執行,並使用**唯讀沙箱**、`--ignore-rules`、`--ignore-user-config` 與 `--ephemeral`,讓 pull request 無法透過 `AGENTS.md` 之類的檔案夾帶指令。diff 是以不受信任的文字形式傳入。輸出結果會依 JSON schema 驗證,並當作資料呈現,而非指令。
- 沒有任何程式碼路徑會核准或合併 pull request。

這個專案自己的 dogfood workflow(`.github/workflows/disclose-ai.yml`)確實有執行 `actions/checkout`——這是安全的,原因是它觸發於 `pull_request_target`,在這個事件下預設 checkout 的一律是**base** 分支,絕不是 pull request 的 head,所以它 checkout 的是這個 repository 自己受信任的程式碼,然後才執行 `uses: ./`。CLI 幫使用者產生的 workflow(如上)則完全沒有 checkout 步驟,因為它執行的是已發佈的 action,而不是本機的 checkout。

發現問題?請見 [SECURITY.md](SECURITY.md)。

## CLI

```bash
npx disclose-ai init [--template standard|strict|light] [--with-workflow] [--force]
npx disclose-ai validate [.github/ai-policy.yml]
npx disclose-ai check owner/repo#123          # dry run: prints what the action would do
npx disclose-ai check <pr-url> --apply --json # actually comment and label
```

`check` 會依序使用 `--token`、`GITHUB_TOKEN` 或 `GH_TOKEN`,最後才是 `gh auth token`。它執行的偵測、揭露解析與政策評估邏輯與 Action 相同,但**絕不**執行 Codex 審查——即使政策裡 `review.codex.enabled` 設為 `true` 也一樣。如果 Action 有啟用審查,它貼出的留言會多一段「Automated first-pass triage by Codex」,而 `check` 的輸出不會顯示這一段。

## Action 參考

（Input/Output 對照表以英文列出,與 `action.yml` 逐一對應,方便直接比對設定。）

| Input | Default | Purpose |
|---|---|---|
| `github-token` | `${{ github.token }}` | read the PR, write comments and labels |
| `policy-path` | `.github/ai-policy.yml` | policy file, read from the base branch |
| `mode` | from policy | override `enforcement.mode` |
| `codex-enabled` | from policy | override `review.codex.enabled` |
| `openai-api-key` | empty | enables Codex triage |
| `codex-model` | from policy | override the model |
| `dry-run` | `false` | evaluate and print only |

`mode`、`codex-enabled` 與 `codex-model` 在 `action.yml` 裡本身都預設是空字串;空值代表「不覆寫,交由政策檔決定」,這也是上表「from policy」實際的意思。

Outputs: `status` (`pass`, `needs-disclosure`, `skipped`, `invalid-policy`), `detected`, `signals` (JSON), `labels`.

## 與其他方案比較

- **CONTRIBUTING.md 裡的一段文字**:不具強制力,審查時也看不到。disclose-ai 讓政策直接出現在 pull request 本身上。
- **只做 co-author trailer 偵測的工具**:偵測只是這裡五種訊號之一,而且光偵測並不會告訴貢獻者該做什麼。disclose-ai 會解析揭露內容、套用政策、同步 label,還能做審查。
- **完整的 AI 審查機器人**:disclose-ai 是一道關卡加上初步審查,不是審查者。它從不留下程式碼審查意見,也從不核准。

## 未來規劃

- `disclose-ai log`:一個給貢獻者用的指令,把本機的 Codex 或 Claude Code session 紀錄整理成 pull request 用的「agent 工作紀錄」。
- 用同一組訊號與 Codex schema 做 issue 分類。
- 組織層級的政策。

## 用 AI 打造,並且揭露

這個專案本身就是用 AI 編碼工具開發的。它自己的 pull request 也採用 `strict` 模板由 disclose-ai 把關。同一個 repository 內發出的 pull request 還會由 `openai/codex-action` 審查;來自 fork 的 pull request 則會跳過這項檢查,因為 fork 在 `pull_request` 事件中拿不到 repository secrets。詳見 [`.github/ai-policy.yml`](.github/ai-policy.yml)。

## 授權

MIT
