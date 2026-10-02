// Turns dictated or pasted text into an answer key.
// "Number one B, number two C"  ->  { 1: "B", 2: "C" }
// "1B 2C 3A", "1. B", "item 4 true", "bilang lima tama" also work.
// The teacher always reviews the result in the key grid before saving.

const ONES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8,
  nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
  sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  isa: 1, dalawa: 2, tatlo: 3, apat: 4, lima: 5, anim: 6, pito: 7, walo: 8, siyam: 9, sampu: 10,
};

const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
  dalawampu: 20, tatlumpu: 30, apatnapu: 40, limampu: 50, animnapu: 60, pitumpu: 70,
  walumpu: 80, siyamnapu: 90,
};

const FILLER = new Set([
  "number", "numbers", "no", "num", "item", "items", "numero", "bilang", "answer", "answers",
  "is", "ay", "sagot", "ang", "the", "and", "at", "po", "ok", "okay", "next", "then",
  "question", "q", "letter", "ito", "sa",
]);

// Speech engines often return spelled-out letters.
const ALIASES: Record<string, string> = {
  a: "A", eh: "A",
  b: "B", bee: "B", be: "B",
  c: "C", see: "C", sea: "C",
  d: "D", dee: "D",
  e: "E", ee: "E",
  t: "T", true: "T", tama: "T",
  f: "F", false: "F", mali: "F",
};

function readNumber(tokens: string[], i: number): { value: number; length: number } | null {
  const t = tokens[i];
  if (!t) return null;
  if (/^\d+$/.test(t)) return { value: parseInt(t, 10), length: 1 };

  const tens = TENS[t];
  if (tens !== undefined) {
    const next = tokens[i + 1];
    const ones = next !== undefined ? ONES[next] : undefined;
    if (ones !== undefined && ones >= 1 && ones <= 9) return { value: tens + ones, length: 2 };
    return { value: tens, length: 1 };
  }

  if (t.startsWith("labing-")) {
    const ones = ONES[t.slice(7)];
    if (ones !== undefined && ones >= 1 && ones <= 9) return { value: 10 + ones, length: 1 };
  }

  const ones = ONES[t];
  if (ones !== undefined) return { value: ones, length: 1 };
  return null;
}

export interface ParsedKey {
  answers: Record<number, string>;
  warnings: string[];
}

export function parseAnswerKeyText(text: string, allowed: string[], maxItem: number): ParsedKey {
  const answers: Record<number, string> = {};
  const warnings: string[] = [];

  const tokens = text
    .toLowerCase()
    .replace(/'t\b/g, " ")
    .replace(/(\d)([a-z])/g, "$1 $2")
    .replace(/([a-z])(\d)/g, "$1 $2")
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean);

  let pending: number | null = null;

  for (let i = 0; i < tokens.length; i += 1) {
    const tok = tokens[i];
    if (tok === undefined || FILLER.has(tok)) continue;

    const num = readNumber(tokens, i);
    if (num) {
      if (pending !== null) warnings.push(`Item ${pending} has no answer.`);
      pending = num.value;
      i += num.length - 1;
      continue;
    }

    const answer = ALIASES[tok];
    if (answer && allowed.includes(answer)) {
      if (pending === null) {
        warnings.push(`Answer "${answer}" has no item number before it.`);
      } else if (pending < 1 || pending > maxItem) {
        warnings.push(`Item ${pending} is outside this assessment (1 to ${maxItem}).`);
        pending = null;
      } else {
        const previous = answers[pending];
        if (previous !== undefined && previous !== answer) {
          warnings.push(`Item ${pending} was given twice (${previous}, then ${answer}). Using ${answer}.`);
        }
        answers[pending] = answer;
        pending = null;
      }
      continue;
    }

    warnings.push(`Could not use "${tok}".`);
  }

  if (pending !== null) warnings.push(`Item ${pending} has no answer.`);
  return { answers, warnings };
}
