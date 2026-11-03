// Refresh the "Recent writing" section of README.md from https://gokul.site/blog.
// Zero dependencies: Node 20+ (global fetch). Exits non-zero, leaving README
// untouched, if the page can't be fetched or no posts are found, so a markup
// change on the site fails the workflow loudly instead of emptying the section.
import { readFile, writeFile } from 'node:fs/promises';

const SITE = 'https://gokul.site';
const LIMIT = 3;
const README = new URL('../../README.md', import.meta.url);
const START = '<!-- blog:start -->';
const END = '<!-- blog:end -->';

const decode = (s) =>
  s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .trim();

// Markdown link text: escape brackets so a title can't break the link.
const md = (s) => s.replace(/([[\]\\])/g, '\\$1');

export function parsePosts(html) {
  const posts = new Map();
  // Each post on /blog is <a href="/blog/<slug>"> ... title ... <time dateTime="YYYY-MM-DD"> ... </a>
  for (const m of html.matchAll(/<a\b[^>]*href="\/blog\/([a-z0-9-]+)"[^>]*>([\s\S]*?)<\/a>/gi)) {
    const [, slug, inner] = m;
    const date = inner.match(/dateTime="(\d{4}-\d{2}-\d{2})/i)?.[1];
    const title =
      inner.match(new RegExp(`blog-title-${slug}"[^>]*>([^<]+)<`))?.[1] ??
      inner.match(/<span[^>]*>([^<]{3,})<\/span>\s*<time/i)?.[1];
    if (date && title && !posts.has(slug)) {
      posts.set(slug, { slug, date, title: decode(title), url: `${SITE}/blog/${slug}` });
    }
  }
  return [...posts.values()].sort((a, b) => b.date.localeCompare(a.date));
}

async function main() {
  const res = await fetch(`${SITE}/blog`, { headers: { 'user-agent': 'gokulkrishh-readme-bot' } });
  if (!res.ok) throw new Error(`GET ${SITE}/blog -> ${res.status}`);
  const posts = parsePosts(await res.text()).slice(0, LIMIT);
  if (posts.length === 0) throw new Error('No posts parsed from /blog; markup may have changed.');

  const readme = await readFile(README, 'utf8');
  const i = readme.indexOf(START);
  const j = readme.indexOf(END);
  if (i === -1 || j === -1 || j < i) throw new Error('blog markers missing from README.md');

  const list = posts.map((p) => `- [${md(p.title)}](${p.url})`).join('\n');
  const next = `${readme.slice(0, i + START.length)}\n${list}\n${readme.slice(j)}`;

  if (next === readme) {
    console.log('README already up to date.');
    return;
  }
  await writeFile(README, next);
  console.log(`Updated README with ${posts.length} posts:\n${list}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
