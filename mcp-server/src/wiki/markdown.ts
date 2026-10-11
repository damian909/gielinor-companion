import { gfm } from '@joplin/turndown-plugin-gfm';
import { parse } from 'node-html-parser';
import TurndownService from 'turndown';

// Elements that are navigation, decoration or hidden: they cost tokens and carry no content.
const REMOVE = [
  'style',
  'script',
  'noscript',
  '.navbox',
  // Infoboxes render as huge sparse tables; wiki_lookup serves the same data compactly.
  '.infobox',
  '.rs-external-header-links',
  '.navigation-not-searchable',
  '.mw-editsection',
  '.reference',
  'sup.reference',
  '.mw-references-wrap',
  '.references',
  '.toc',
  '#toc',
  '.noprint',
  '.mw-empty-elt',
  '.hidden',
  '.messagebox.metadata',
  '.rs-calc-container',
  'img',
  'audio',
  'video',
  'map',
].join(',');

/** Bump when the conversion changes, so cached pages are converted again. */
export const MARKDOWN_VERSION = 4;

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' });
turndown.use(gfm);
// Keep link text only: URLs would multiply the size of every page.
turndown.addRule('linkText', { filter: 'a', replacement: (content) => content });
turndown.addRule('dropEmptyCells', {
  filter: (node) => node.nodeName === 'SPAN' && (node.textContent ?? '').trim() === '',
  replacement: () => '',
});

export function htmlToMarkdown(html: string): string {
  const root = parse(html, { comment: false });
  for (const el of root.querySelectorAll(REMOVE)) el.remove();
  for (const el of root.querySelectorAll('[style]')) {
    if (/display\s*:\s*none/i.test(el.getAttribute('style') ?? '')) el.remove();
  }
  // Bare skill/quest-point icons without a level ("[QP icon] Completion of …") add nothing.
  for (const el of root.querySelectorAll('.scp[data-skill]')) {
    if (!el.getAttribute('data-level') && !el.text.trim()) el.remove();
  }
  // Icon-only links (rune costs, skill icons) have no text once images are gone; use their title.
  for (const a of root.querySelectorAll('a[title]')) {
    if (!a.text.trim()) a.set_content(` ${escapeHtml(a.getAttribute('title') ?? '')}`);
  }
  // Skill requirement chips render as an icon plus a number; spell the skill out.
  for (const el of root.querySelectorAll('[data-skill][data-level]')) {
    el.set_content(`${el.getAttribute('data-level')} ${el.getAttribute('data-skill')}`);
  }
  // With images gone, icon grids (navigation tables) leave empty rows; drop them, and drop
  // tables that are left with a single row.
  for (const tr of root.querySelectorAll('tr')) {
    if (!tr.text.trim()) tr.remove();
  }
  for (const t of root.querySelectorAll('table')) {
    if (t.querySelectorAll('tr').length <= 1) t.remove();
  }
  // The GFM table rule leaves tables as raw HTML when a cell holds lists or paragraphs (e.g.
  // diary and quest tables). Flatten every cell to one line of text so they become markdown.
  for (const cell of root.querySelectorAll('td, th')) {
    const items = cell.querySelectorAll('li').filter((li) => !li.parentNode?.closest('li'));
    const parts = items.length ? items.map((li) => li.text) : [cell.text];
    const flat = parts
      .map((p) => p.replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .join('; ');
    cell.set_content(escapeHtml(flat));
  }
  const md = turndown
    .turndown(root.toString())
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
  return promoteHeaderRows(md);
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Wiki tables put their header cells in the first body row, which yields an empty markdown header; use that row instead. */
function promoteHeaderRows(md: string): string {
  const lines = md.split('\n');
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (/^\|(\s*\|)+$/.test(lines[i]) && /^\|(\s*-+\s*\|)+$/.test(lines[i + 1] ?? '') && /^\|.*\S.*\|$/.test(lines[i + 2] ?? '')) {
      out.push(lines[i + 2], lines[i + 1]);
      i += 2;
      continue;
    }
    out.push(lines[i]);
  }
  return out.join('\n');
}

/** Trims to roughly `max` characters on a line boundary and says so. */
export function clip(text: string, max: number): { text: string; clipped: boolean } {
  if (text.length <= max) return { text, clipped: false };
  const cut = text.lastIndexOf('\n', max);
  return { text: text.slice(0, cut > max * 0.6 ? cut : max), clipped: true };
}
