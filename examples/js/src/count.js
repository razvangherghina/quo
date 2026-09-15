// The count, chapter 3. Every ask on a relation carries the next number in
// one unbroken count, and the door honours each number once. It keeps the
// highest number honoured, the mark, and which numbers below it are spent,
// out to a span of sixty-four.

export const SPAN = 64;

// With the mark `m` and an arriving `n`: above the mark is honoured, the mark
// itself is refused, inside the span it is honoured once, and at or below the
// span it is refused.
export function honourable({ mark, spent }, n) {
  if (n > mark) return true;
  if (n === mark || n <= mark - SPAN) return false;
  return !spent.includes(n);
}

// An honoured number: above the mark it becomes the mark and the old mark is
// spent; inside the span it is spent. Nothing at or below the span is kept.
export function spend(record, n) {
  if (n > record.mark) {
    if (record.mark > 0) record.spent.push(record.mark);
    record.mark = n;
  } else {
    record.spent.push(n);
  }
  record.spent = record.spent.filter((s) => s > record.mark - SPAN);
}
