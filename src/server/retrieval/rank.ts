import type { MaterialHit } from "../materials";

export function rankMaterials(rows: MaterialHit[], terms: string[], groups: number[], strongTerms: string[], limit: number): MaterialHit[] {
  const ranked: MaterialHit[] = [];
  for (const row of rows) {
    const body = row.content.toLowerCase();
    const heading = (row.heading ?? "").toLowerCase();
    const title = row.materialTitle.toLowerCase();
    const bodyGroups = new Set<number>(), headingGroups = new Set<number>(), titleGroups = new Set<number>();
    let first = Infinity;
    terms.forEach((raw, i) => {
      const word = raw.toLowerCase();
      const pos = body.indexOf(word);
      if (pos >= 0) {
        bodyGroups.add(groups[i]);
        first = Math.min(first, pos);
      }
      if (heading.includes(word)) headingGroups.add(groups[i]);
      if (title.includes(word)) titleGroups.add(groups[i]);
    });
    const strong = strongTerms.some(t => body.includes(t.toLowerCase()));
    if (!headingGroups.size && !strong && (bodyGroups.size === 0 || (bodyGroups.size === 1 && !titleGroups.size))) continue;
    const score = bodyGroups.size * 10 + (strong ? 8 : 0) + Math.min(headingGroups.size, 3) * 4
      + Math.min(titleGroups.size, 3) * 2 + 2 / (1 + first / 100);
    ranked.push({ ...row, score });
  }
  ranked.sort((a, b) => b.score - a.score || a.chunkId.localeCompare(b.chunkId));
  const seen = new Set<string>();
  return ranked.filter(row => {
    const key = row.versionId + ":" + row.content.trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}
