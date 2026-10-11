// Turns the wikitext/HTML stored in Bucket text fields into plain, compact text.

export function cleanWikitext(input: string | null | undefined): string {
  if (!input) return '';
  let s = String(input);
  // Skill chips: <span class="scp" data-skill="Agility" data-level="60">...</span> -> "60 Agility"
  s = s.replace(/<span[^>]*data-skill="([^"]+)"[^>]*data-level="([^"]+)"[^>]*>[\s\S]*?<\/span>/g, '$2 $1');
  s = s.replace(/\{\{SCP\|([^|}]+)\|([^|}]+)[^}]*\}\}/gi, '$2 $1');
  s = s.replace(/<sup[\s\S]*?<\/sup>/g, '');
  s = s.replace(/\[\[(?:File|Category):[^\]]*\]\]/gi, '');
  s = s.replace(/\[\[[^\]|]+\|([^\]]+)\]\]/g, '$1');
  s = s.replace(/\[\[([^\]]+)\]\]/g, '$1');
  s = s.replace(/\{\{[^{}]*\}\}/g, '');
  s = s.replace(/<br\s*\/?>/gi, '\n');
  s = s.replace(/<[^>]+>/g, '');
  s = s.replace(/'{2,}/g, '');
  s = s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
  // Wiki bullets (*, **, ***) -> indented markdown bullets.
  s = s
    .split('\n')
    .map((line) => {
      const m = line.match(/^(\*+)\s*(.*)$/);
      return m ? `${'  '.repeat(m[1].length - 1)}- ${m[2].trim()}` : line.trim();
    })
    .filter((line) => line && line !== '-')
    .join('\n');
  return s.trim();
}
