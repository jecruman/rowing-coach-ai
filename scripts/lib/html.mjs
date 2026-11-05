// Zero-dependency readers for server-rendered pages, so integrity checks can bind each value to its label
// instead of searching the whole page with includes(). Built for Astro and React SSR output: attributes in any
// order, `<!-- -->` separators React puts between adjacent text nodes, and escaped entities.

const NAMED_ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

// A start tag whose quoted attribute values may contain `>`.
const ATTRS = String.raw`((?:[^>"']|"[^"]*"|'[^']*')*)`;

export function decodeEntities(text) {
  return text.replace(/&(#x[0-9a-f]+|#[0-9]+|[a-z]+);/gi, (entity, code) => {
    if (code[0] === "#") {
      const point = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isNaN(point) ? entity : String.fromCodePoint(point);
    }
    return NAMED_ENTITIES[code.toLowerCase()] ?? entity;
  });
}

// Tags become a space so adjacent cells do not run together; whitespace (including &nbsp;) then collapses,
// so a value and its delta in a nested span read as "1:55 (−10 s)". Comments are dropped without a space,
// because React splits one visible text ("2000<!-- --> m") into several nodes.
export function textContent(html) {
  const text = html
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]*>/g, " ");
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

// Attribute names are lower-cased; a bare attribute (`checked`, `selected`) maps to "".
function parseAttributes(source) {
  const attrs = {};
  for (const [, name, double, single, bare] of source.matchAll(
    /([^\s=/"'>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g,
  )) {
    attrs[name.toLowerCase()] = decodeEntities(double ?? single ?? bare ?? "");
  }
  return attrs;
}

// Ordered [label, value] pairs; a `dd` pairs with the nearest `dt` before it, so a label with several values
// yields several pairs.
export function definitionPairs(html) {
  const pairs = [];
  let label = "";
  for (const [, tag, , inner] of html.matchAll(new RegExp(String.raw`<(dt|dd)\b${ATTRS}>([\s\S]*?)<\/\1>`, "gi"))) {
    if (tag.toLowerCase() === "dt") label = textContent(inner);
    else pairs.push([label, textContent(inner)]);
  }
  return pairs;
}

// Each `<section>` as its attributes and inner HTML, in page order. Sections must not nest (none do in this app).
export function sections(html) {
  return [...html.matchAll(new RegExp(String.raw`<section\b${ATTRS}>([\s\S]*?)<\/section>`, "gi"))].map(
    ([, raw, inner]) => ({ attrs: parseAttributes(raw), html: inner }),
  );
}

// Text of each `tag` element that holds only text (comments allowed), in page order: a row's own cells, not the
// wrappers around them.
export function leafTexts(html, tag) {
  return [...html.matchAll(new RegExp(String.raw`<${tag}\b${ATTRS}>((?:[^<]|<!--[\s\S]*?-->)*)<\/${tag}>`, "gi"))].map(
    ([, , inner]) => textContent(inner),
  );
}

// Each link as its href, inner HTML and text, in page order.
export function links(html) {
  return [...html.matchAll(new RegExp(String.raw`<a\b${ATTRS}>([\s\S]*?)<\/a>`, "gi"))].map(([, raw, inner]) => ({
    href: parseAttributes(raw).href ?? "",
    html: inner,
    text: textContent(inner),
  }));
}

// What a browser would submit: named, enabled controls; radios and checkboxes only when checked; the selected
// option of a select (the first when none is marked); textarea content with the one leading newline HTML drops.
// Submit buttons are left out, since a browser sends one only when it is clicked.
export function formControls(html) {
  const controls = {};
  const source = html.replace(/<!--[\s\S]*?-->/g, "");

  for (const [, raw] of source.matchAll(new RegExp(String.raw`<input\b${ATTRS}>`, "gi"))) {
    const attrs = parseAttributes(raw);
    const type = (attrs.type ?? "text").toLowerCase();
    if (!attrs.name || "disabled" in attrs || ["submit", "button", "reset", "image"].includes(type)) continue;
    if ((type === "radio" || type === "checkbox") && !("checked" in attrs)) continue;
    controls[attrs.name] = attrs.value ?? (type === "checkbox" || type === "radio" ? "on" : "");
  }

  for (const [, raw, inner] of source.matchAll(new RegExp(String.raw`<select\b${ATTRS}>([\s\S]*?)<\/select>`, "gi"))) {
    const attrs = parseAttributes(raw);
    if (!attrs.name || "disabled" in attrs) continue;
    const options = [...inner.matchAll(new RegExp(String.raw`<option\b${ATTRS}>([\s\S]*?)<\/option>`, "gi"))].map(
      ([, optionRaw, text]) => ({ attrs: parseAttributes(optionRaw), text }),
    );
    const chosen = options.find((option) => "selected" in option.attrs) ?? options[0];
    if (chosen) controls[attrs.name] = chosen.attrs.value ?? textContent(chosen.text);
  }

  for (const [, raw, inner] of source.matchAll(
    new RegExp(String.raw`<textarea\b${ATTRS}>([\s\S]*?)<\/textarea>`, "gi"),
  )) {
    const attrs = parseAttributes(raw);
    if (!attrs.name || "disabled" in attrs) continue;
    controls[attrs.name] = decodeEntities(inner.replace(/^\r?\n/, ""));
  }

  return controls;
}
