#!/usr/bin/env node
/**
 * Programmatic SEO: generates one static page per dictionary name
 * (names/<name>.html), an A–Z index (names/index.html), and sitemap.xml.
 *
 * Pulls NAME_DICT / kanji tables / conversion logic straight out of
 * index.html so pages can never drift from the live generator.
 *
 * Usage:
 *   node scripts/build-name-pages.mjs                       # placeholder base URL
 *   SITE_BASE=https://kanjiname.example node scripts/build-name-pages.mjs
 *
 * Re-run after every change to the kanji tables, then commit the output.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASE = (process.env.SITE_BASE || "https://REPLACE-WITH-YOUR-DOMAIN.example").replace(/\/$/, "");

const html = readFileSync(join(root, "index.html"), "utf8");
const start = html.indexOf("const NAME_DICT");
const end = html.indexOf("let current =");
if (start < 0 || end < 0) throw new Error("could not locate data section in index.html");
const core = new Function(
  html.slice(start, end) +
  "\nreturn { NAME_DICT, nameToKana, parseMorae, candidatesFor, pick };"
)();

const STYLES = [
  ["cool", "侍 Samurai"],
  ["elegant", "雅 Elegant"],
  ["lucky", "福 Lucky"],
  ["funny", "笑 Funny"],
];

function convert(name, style) {
  const kana = core.nameToKana(name);
  const morae = core.parseMorae(kana).filter(m => !m.sep);
  const picks = morae.map(m => {
    const c = core.pick(core.candidatesFor(m.kana), style, false);
    return { kana: m.kana, kanji: c[0], meaning: c[1] };
  });
  return { kana, picks, kanji: picks.map(p => p.kanji).join("") };
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function pageFor(name) {
  const display = cap(name);
  const styles = STYLES.map(([id, label]) => ({ id, label, ...convert(name, id) }));
  const main = styles[0];
  const meanings = main.picks.map(p => p.meaning.split(";")[0]).join(", ");
  const title = `${display} in Japanese Kanji — ${main.kanji} (${main.kana})`;
  const desc = `The name ${display} written in real Japanese kanji: ${main.kanji}, pronounced ${main.kana}. Character meanings: ${meanings}. See samurai, elegant, lucky and funny versions, plus wallpapers and a tattoo sheet.`;
  const rows = styles.map(st => `
      <section>
        <h2>${esc(st.label)}</h2>
        <p class="big" lang="ja">${esc(st.kanji)}</p>
        <table>
          ${st.picks.map(p => `<tr><td lang="ja" class="k">${esc(p.kanji)}</td><td lang="ja" class="r">${esc(p.kana)}</td><td>${esc(p.meaning)}</td></tr>`).join("\n          ")}
        </table>
      </section>`).join("\n");
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${BASE}/names/${name}.html">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<link rel="stylesheet" href="page.css">
</head>
<body>
<main>
  <p class="crumb"><a href="../index.html">漢字命名所 Kanji Name Generator</a> / <a href="index.html">Names</a></p>
  <h1>${esc(display)} in Japanese Kanji</h1>
  <p class="lede">In Japan, foreign names are written by sound — a centuries-old art called <em>ateji</em> 当て字.
     <strong>${esc(display)}</strong> is pronounced <span lang="ja">${esc(main.kana)}</span> in Japanese,
     and can be written with real kanji as <span lang="ja" class="inline-k">${esc(main.kanji)}</span> — a name meaning ${esc(meanings)}.</p>
  ${rows}
  <p class="cta"><a href="../index.html?f=${encodeURIComponent(display)}">Customize ${esc(display)} — swap characters, get wallpapers, a certificate &amp; a tattoo sheet →</a></p>
  <footer>Every kanji above is real and readable. Negative characters (death, sickness, insults) are excluded by design. · <a href="../legal.html">Legal &amp; Privacy</a></footer>
</main>
</body>
</html>
`;
}

const names = Object.keys(core.NAME_DICT).sort();
mkdirSync(join(root, "names"), { recursive: true });

// shared stylesheet (kept tiny; brush font loaded once from ../fonts/)
writeFileSync(join(root, "names", "page.css"), `
@font-face { font-family: "Yuji Syuku"; src: url(../fonts/yuji-subset.woff2) format("woff2"); font-display: swap; }
:root { --ink:#100e0b; --card:#191611; --cream:#f2e9d5; --dim:#a2967f; --gold:#c2a35c; --line:rgba(194,163,92,.22); }
* { margin:0; padding:0; box-sizing:border-box; }
body { background:var(--ink); color:var(--cream); font-family:"Iowan Old Style","Palatino Linotype",Georgia,serif; line-height:1.65; padding:2.5rem 1.2rem 4rem; }
main { max-width:680px; margin:0 auto; }
a { color:var(--gold); }
.crumb { font-size:.8rem; margin-bottom:1.6rem; }
h1 { font-size:1.7rem; margin-bottom:.8rem; letter-spacing:.02em; }
.lede { color:var(--dim); margin-bottom:1.8rem; }
.inline-k { font-family:"Yuji Syuku",serif; color:var(--cream); font-size:1.15em; }
section { background:var(--card); border:1px solid var(--line); border-radius:12px; padding:1.3rem 1.5rem; margin-bottom:1.1rem; }
h2 { font-size:.78rem; letter-spacing:.28em; text-transform:uppercase; color:var(--gold); margin-bottom:.5rem; }
.big { font-family:"Yuji Syuku",serif; font-size:2.6rem; line-height:1.3; margin-bottom:.6rem; }
table { width:100%; border-collapse:collapse; font-size:.9rem; }
td { padding:.3rem .4rem; border-bottom:1px solid rgba(194,163,92,.12); color:var(--dim); }
tr:last-child td { border-bottom:none; }
.k { font-family:"Yuji Syuku",serif; font-size:1.4rem; color:var(--cream); width:2.5rem; }
.r { color:#cf6a52; width:4rem; font-size:.78rem; }
.cta { margin:1.6rem 0; font-size:1.02rem; }
footer { font-size:.78rem; color:#6e6552; margin-top:2rem; }
ul.az { list-style:none; columns:3; }
ul.az li { margin:.15rem 0; }
@media (max-width:520px){ ul.az{columns:2} }
`);

let count = 0;
for (const name of names) {
  writeFileSync(join(root, "names", `${name}.html`), pageFor(name));
  count++;
}

// A–Z index
const groups = {};
for (const n of names) (groups[n[0].toUpperCase()] ||= []).push(n);
const indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Names in Japanese Kanji, A–Z — 漢字命名所</title>
<meta name="description" content="Browse ${count}+ names written in real Japanese kanji with pronunciation and character meanings — samurai, elegant, lucky and funny versions of every name.">
<link rel="canonical" href="${BASE}/names/index.html">
<link rel="stylesheet" href="page.css">
</head>
<body>
<main>
  <p class="crumb"><a href="../index.html">漢字命名所 Kanji Name Generator</a></p>
  <h1>Names in Japanese Kanji, A–Z</h1>
  <p class="lede">${count} names converted to real kanji by sound (ateji 当て字), each with pronunciation and per-character meanings. Don't see yours? <a href="../index.html">Generate it instantly →</a></p>
  ${Object.keys(groups).sort().map(L => `<section><h2>${L}</h2><ul class="az">${groups[L].map(n => `<li><a href="${n}.html">${esc(cap(n))}</a></li>`).join("")}</ul></section>`).join("\n  ")}
  <footer><a href="../legal.html">Legal &amp; Privacy</a></footer>
</main>
</body>
</html>
`;
writeFileSync(join(root, "names", "index.html"), indexHtml);

// sitemap
const urls = [`${BASE}/index.html`, `${BASE}/names/index.html`, ...names.map(n => `${BASE}/names/${n}.html`)];
writeFileSync(join(root, "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map(u => `  <url><loc>${u}</loc></url>`).join("\n") + "\n</urlset>\n");
writeFileSync(join(root, "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${BASE}/sitemap.xml\n`);

console.log(`generated ${count} name pages + index + sitemap (base: ${BASE})`);
