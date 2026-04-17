const EMOTICON_RULES: Array<{ pattern: RegExp; replace: string }> = [
  { pattern: /<\/3/g, replace: '💔' },
  { pattern: /<3/g, replace: '❤️' },
  { pattern: /(^|[^:/]);-?\)/g, replace: '$1😉' },
  { pattern: /(^|[^:/]):-?D/gi, replace: '$1😄' },
  { pattern: /(^|[^:/])x-?D/gi, replace: '$1😆' },
  { pattern: /(^|[^:/]):-?P/gi, replace: '$1😛' },
  { pattern: /(^|[^:/]):-?\(/g, replace: '$1🙁' },
  { pattern: /(^|[^:/]):'\(/g, replace: '$1😢' },
  { pattern: /(^|[^:/]):-?\)/g, replace: '$1🙂' },
  { pattern: /(^|[^:/]):-?[oO]/g, replace: '$1😮' },
  { pattern: /(^|[^:/]):-?\|/g, replace: '$1😐' },
  { pattern: /(^|[^:/]):-?\//g, replace: '$1😕' },
  { pattern: /(^|[^:/])(?:B|8)-?\)/g, replace: '$1😎' },
  { pattern: /(^|[^:/]):-?\*/g, replace: '$1😘' },
];

export function replaceTextEmoticons(text: string): string {
  return EMOTICON_RULES.reduce(
    (result, rule) => result.replace(rule.pattern, rule.replace),
    text
  );
}

export function getPlainMessagePreview(text: string, maxLength: number): string {
  return replaceTextEmoticons(text)
    .replace(/[*_~`#>\[\]()!]/g, '')
    .replace(/\n+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
