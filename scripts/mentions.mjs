// Finds the @words GitHub would turn into mentions in Markdown. The release
// notes script and the smoke test import it; CONTRIBUTING.md, "Mentions",
// says why a release must carry none.
//
//   import { bareMentions } from './mentions.mjs';

const FENCE = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[^\n]*$/gm;
const MENTION = /(?<![\w`/])@[A-Za-z0-9][\w-]*/g;

export function bareMentions(markdown) {
  const prose = markdown.replace(FENCE, '').replace(/<!--[\s\S]*?-->/g, '');
  return prose.split('`').flatMap((part, index) => (index % 2 === 1 ? [] : part.match(MENTION) ?? []));
}
