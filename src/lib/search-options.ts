// src/lib/search-options.ts

// Search for pickers where the teacher types part of a name.
// Ignores case, accents and dots/commas ("cadelina" finds "Achilles Asher C. Cadeliña"),
// and matches words in any order ("lanuzo aldrin" finds "Aldrin Lanuzo").

const fold = (text: string) =>
  text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[.,'’]/g, "")
    .toLowerCase();

export function filterOptions<T extends { label: string }>(options: T[], query: string): T[] {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return options;
  return options.filter((option) => {
    const label = fold(option.label);
    return words.every((word) => label.includes(word));
  });
}