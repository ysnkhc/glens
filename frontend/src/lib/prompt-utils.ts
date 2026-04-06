/**
 * prompt-utils.ts — Single source of truth for prompt extraction and constraint detection.
 * Used by both analyzer-service.ts and consensus-predictor.ts.
 */

/**
 * Extract AI prompt strings from contract code using regex patterns.
 * Matches exec_prompt() calls with single/double/triple quoted strings.
 */
export function extractPrompts(code: string): string[] {
  const prompts: string[] = [];
  const patterns = [
    /exec_prompt\s*\(\s*f?"""([\s\S]*?)"""\s*\)/g,
    /exec_prompt\s*\(\s*f?'''([\s\S]*?)'''\s*\)/g,
    /exec_prompt\s*\(\s*f?"([^"]*?)"\s*\)/g,
    /exec_prompt\s*\(\s*f?'([^']*?)'\s*\)/g,
  ];

  for (const pat of patterns) {
    let match;
    while ((match = pat.exec(code)) !== null) {
      if (match[1] && match[1].trim().length > 0) {
        prompts.push(match[1].trim());
      }
    }
  }

  // Second pass: extract multi-line concatenated string prompts
  // Matches patterns like exec_prompt(f"part1" "part2" "part3")
  const blockRegex = /exec_prompt\s*\(([\s\S]*?)\)/g;
  let blockMatch;
  while ((blockMatch = blockRegex.exec(code)) !== null) {
    const block = blockMatch[1];
    const segmentRegex = /f?["']{1,3}([\s\S]*?)["']{1,3}/g;
    let segMatch;
    const segments: string[] = [];
    while ((segMatch = segmentRegex.exec(block)) !== null) {
      if (segMatch[1]) {
        segments.push(segMatch[1]);
      }
    }
    const joined = segments.join(" ").trim();
    if (joined.length >= 10) {
      prompts.push(joined);
    }
  }

  // Deduplicate prompts
  return [...new Set(prompts)];
}

/**
 * Keywords that indicate a prompt constrains its output format.
 */
export const CONSTRAINED_KEYWORDS = [
  "ONLY", "EXACT", "EXACTLY", "MUST", "RETURN ONLY",
  "one word", "JSON only", "valid JSON",
  "POSITIVE, NEGATIVE, or NEUTRAL",
  "YES or NO",
  "city name", "TOXIC or SAFE", "decimal places",
  "Return ONLY", "nothing else",
];

/**
 * Check whether a prompt contains output-constraining keywords.
 */
export function isPromptConstrained(prompt: string): boolean {
  const upper = prompt.toUpperCase();
  return CONSTRAINED_KEYWORDS.some((kw) => upper.includes(kw.toUpperCase()));
}
