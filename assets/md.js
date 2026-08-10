/**
 * Minimal markdown renderer for the subset declared in docs/content-spec.md:
 * h1-h3, paragraphs, bold/italic/inline-code, fenced code blocks, flat lists,
 * links, blockquotes, --- rules, simple pipe tables.
 *
 * Everything is HTML-escaped before any markup is produced, so authored
 * content can never inject markup. There is no raw-HTML passthrough.
 */

const SENTINEL = "\u0000";
const SPAN_RE = /\u0000(\d+)\u0000/g;

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ESC[c]);
}

/** Safe href: allow only https/http/mailto/relative-hash. */
function safeHref(raw) {
  const url = raw.trim();
  if (/^(https?:\/\/|mailto:|#|\/)/i.test(url)) return escapeHtml(url);
  return "#";
}

/** Inline formatting. Input MUST already be HTML-escaped. */
function inline(text) {
  // Pull code spans out first so their contents are never re-formatted.
  const spans = [];
  let out = text.replace(/`([^`]+)`/g, (_, code) => {
    spans.push(code);
    return SENTINEL + (spans.length - 1) + SENTINEL;
  });

  out = out
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_, label, url) => `<a href="${safeHref(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    // Italics must hug their content, so arithmetic like `2 * 3 * 4` is left alone.
    .replace(/(^|[\s(])\*([^*\s\n](?:[^*\n]*[^*\s\n])?)\*(?=$|[\s.,;:!?)])/g, "$1<em>$2</em>");

  return out.replace(SPAN_RE, (_, i) => `<code>${spans[Number(i)]}</code>`);
}

function tableRow(line) {
  return line
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|")
    .map((c) => c.trim());
}

const isDivider = (line) => /^\s*\|?[\s:|-]*-[\s:|-]*\|?\s*$/.test(line) && line.includes("-");

export function renderMarkdown(src) {
  if (!src) return "";
  const lines = escapeHtml(src.replace(/\r\n?/g, "\n")).split("\n");
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // fenced code
    const fence = line.match(/^\s*```+\s*([\w+-]*)\s*$/);
    if (fence) {
      const lang = fence[1] || "";
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```+\s*$/.test(lines[i])) body.push(lines[i++]);
      i++; // closing fence
      const attr = lang ? ` data-lang="${lang}"` : "";
      html.push(`<pre${attr}><code>${body.join("\n")}</code></pre>`);
      continue;
    }

    // blank
    if (!line.trim()) { i++; continue; }

    // horizontal rule
    if (/^\s*(---+|\*\*\*+|___+)\s*$/.test(line)) { html.push("<hr>"); i++; continue; }

    // heading
    const h = line.match(/^\s*(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      html.push(`<h${level}>${inline(h[2].trim())}</h${level}>`);
      i++;
      continue;
    }

    // table: header row followed by a divider row
    if (line.includes("|") && i + 1 < lines.length && isDivider(lines[i + 1])) {
      const head = tableRow(line);
      i += 2;
      const body = [];
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) {
        body.push(tableRow(lines[i]));
        i++;
      }
      const thead = `<tr>${head.map((c) => `<th>${inline(c)}</th>`).join("")}</tr>`;
      const tbody = body
        .map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join("")}</tr>`)
        .join("");
      html.push(`<div class="tablescroll"><table><thead>${thead}</thead><tbody>${tbody}</tbody></table></div>`);
      continue;
    }

    // blockquote (consecutive > lines merge into one)
    if (/^\s*&gt;\s?/.test(line)) {
      const buf = [];
      while (i < lines.length && /^\s*&gt;\s?/.test(lines[i])) {
        buf.push(lines[i].replace(/^\s*&gt;\s?/, ""));
        i++;
      }
      html.push(`<blockquote>${inline(buf.join(" ").trim())}</blockquote>`);
      continue;
    }

    // lists (flat only)
    const bullet = line.match(/^\s*[-*+]\s+(.*)$/);
    const numbered = line.match(/^\s*\d+[.)]\s+(.*)$/);
    if (bullet || numbered) {
      const ordered = Boolean(numbered);
      const items = [];
      while (i < lines.length) {
        const m = ordered
          ? lines[i].match(/^\s*\d+[.)]\s+(.*)$/)
          : lines[i].match(/^\s*[-*+]\s+(.*)$/);
        if (!m) {
          // a plain indented continuation line belongs to the previous item
          if (items.length && /^\s{2,}\S/.test(lines[i]) && lines[i].trim()) {
            items[items.length - 1] += " " + lines[i].trim();
            i++;
            continue;
          }
          break;
        }
        items.push(m[1]);
        i++;
      }
      const tag = ordered ? "ol" : "ul";
      html.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join("")}</${tag}>`);
      continue;
    }

    // paragraph: gather until blank or a line that starts another block
    const para = [];
    while (i < lines.length && lines[i].trim()) {
      const l = lines[i];
      if (
        /^\s*(#{1,3})\s+/.test(l) ||
        /^\s*```/.test(l) ||
        /^\s*[-*+]\s+/.test(l) ||
        /^\s*\d+[.)]\s+/.test(l) ||
        /^\s*&gt;\s?/.test(l) ||
        /^\s*(---+|\*\*\*+|___+)\s*$/.test(l) ||
        (l.includes("|") && i + 1 < lines.length && isDivider(lines[i + 1]))
      ) break;
      para.push(l.trim());
      i++;
    }
    if (para.length) html.push(`<p>${inline(para.join(" "))}</p>`);
  }

  return html.join("\n");
}

/** Split content markdown into the spec's `## Section` blocks. */
export function splitSections(src) {
  const out = [];
  const lines = (src || "").split("\n");
  let current = { title: null, lines: [] };
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) inFence = !inFence;
    const h2 = !inFence && line.match(/^\s*##\s+(?!#)(.*)$/);
    if (h2) {
      out.push(current);
      current = { title: h2[1].trim(), lines: [] };
    } else {
      current.lines.push(line);
    }
  }
  out.push(current);
  return out
    .map((s) => ({ title: s.title, body: s.lines.join("\n").trim() }))
    .filter((s) => s.title || s.body);
}
