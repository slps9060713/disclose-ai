export const TEMPLATE_NAMES = ["standard", "strict", "light"] as const;
export type TemplateName = (typeof TEMPLATE_NAMES)[number];

const HEADER = `# disclose-ai policy
# Docs: https://github.com/slps9060713/disclose-ai#policy-file
# This file declares how AI-assisted contributions are handled in this repository.
# It asks for disclosure. It does not prohibit AI tools.
version: 1
`;

const TEMPLATES: Record<TemplateName, string> = {
  standard: `${HEADER}
disclosure:
  required: when-detected      # ask for disclosure only when AI signals are detected
  fields: [tool, extent]
  heading: "AI Disclosure"

enforcement:
  mode: comment+label          # comment + labels, never blocks the PR
  comment_on_pass: false
`,
  strict: `${HEADER}
disclosure:
  required: always             # every PR must disclose, including "No AI tools were used"
  fields: [tool, extent]
  heading: "AI Disclosure"
  no_ai_phrase: "No AI tools were used"

enforcement:
  mode: fail                   # the check fails until disclosure is present
  comment_on_pass: false
`,
  light: `${HEADER}
disclosure:
  required: when-detected

enforcement:
  mode: label-only             # labels only, no comments
`,
};

export function getTemplate(name: TemplateName): string {
  return TEMPLATES[name];
}
