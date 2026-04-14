const EMOTICON_RULES: Array<{ pattern: RegExp; replace: string }> = [
  { pattern: /(^|[\s(])<3(?=$|[\s).,!?])/g, replace: '$1❤️' },
  { pattern: /(^|[\s(]);-?\)(?=$|[\s).,!?])/g, replace: '$1😉' },
  { pattern: /(^|[\s(]):-?D(?=$|[\s).,!?])/gi, replace: '$1😄' },
  { pattern: /(^|[\s(])X-?D(?=$|[\s).,!?])/gi, replace: '$1😆' },
  { pattern: /(^|[\s(]):-?P(?=$|[\s).,!?])/gi, replace: '$1😛' },
  { pattern: /(^|[\s(]):-?\((?=$|[\s).,!?])/g, replace: '$1🙁' },
  { pattern: /(^|[\s(]):-?\)(?=$|[\s).,!?])/g, replace: '$1🙂' },
];

export function replaceTextEmoticons(text: string): string {
  return EMOTICON_RULES.reduce(
    (result, rule) => result.replace(rule.pattern, rule.replace),
    text
  );
}
