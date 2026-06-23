/**
 * Sanitizer.js — allowlist HTML sanitizer (zero dependencies)
 *
 * WHY THIS EXISTS
 * ---------------
 * The AI is asked to return content blocks that contain raw HTML (e.g. the
 * "prose" and "callout" block types in AIService.generateBlocks). That HTML is
 * built from a *source the user did not necessarily write* — a photographed page,
 * a PDF, or text someone else shared — so a prompt-injection in the source could
 * steer the model into emitting <script>, <img onerror=…>, javascript: URLs, etc.
 * Inserting that straight into innerHTML is a stored-XSS sink that, inside the
 * Android WebView, can reach the native bridges (file save / print).
 *
 * RULE: never assign AI/source-derived HTML to innerHTML directly. Run it through
 * Sanitizer.clean(html) first, OR use Sanitizer.setHTML(el, html).
 *
 * This uses the browser's own parser (an inert <template>, never executed) and
 * walks the tree removing any tag/attribute not on the allowlist and any
 * dangerous URL scheme. For a higher-assurance production build, prefer
 * DOMPurify (https://github.com/cure53/DOMPurify) and bundle it locally — this
 * module is a safe, self-contained baseline for when that isn't available.
 */
const Sanitizer = (function () {
  // Tags allowed in rendered note/block HTML. No <script>, <style>, <iframe>,
  // <object>, <embed>, <form>, <link>, <meta>, event-bearing media, etc.
  const ALLOWED_TAGS = new Set([
    'p','br','hr','span','div','b','strong','i','em','u','s','small','sub','sup',
    'mark','code','pre','kbd','samp','blockquote','q','cite','abbr',
    'ul','ol','li','dl','dt','dd',
    'table','thead','tbody','tfoot','tr','th','td','caption','colgroup','col',
    'h1','h2','h3','h4','h5','h6','figure','figcaption',
  ]);

  // Attributes allowed on any element. Deliberately excludes every on* handler,
  // style (can load url()/expression), src, href, srcset, formaction, etc.
  const ALLOWED_ATTRS = new Set([
    'class','title','colspan','rowspan','scope','dir','lang','align','aria-label','role',
  ]);

  function scrub(node) {
    // Walk a static snapshot of children so removals don't disturb iteration.
    const children = Array.prototype.slice.call(node.childNodes);
    for (const child of children) {
      if (child.nodeType === 1) { // element
        const tag = child.tagName.toLowerCase();
        if (!ALLOWED_TAGS.has(tag)) {
          // Drop the element but keep its (sanitized) text so content survives.
          const text = document.createTextNode(child.textContent || '');
          child.parentNode.replaceChild(text, child);
          continue;
        }
        // Strip every attribute that isn't explicitly allowed.
        for (const attr of Array.prototype.slice.call(child.attributes)) {
          const name = attr.name.toLowerCase();
          if (!ALLOWED_ATTRS.has(name) || name.startsWith('on')) {
            child.removeAttribute(attr.name);
          }
        }
        scrub(child);
      } else if (child.nodeType === 8) { // comment — could hide conditional markup
        child.parentNode.removeChild(child);
      }
      // text nodes (type 3) are left as-is; they cannot execute
    }
  }

  return {
    /** Return a sanitized HTML string safe to assign to innerHTML. */
    clean(html) {
      if (html == null) return '';
      const tpl = document.createElement('template'); // inert: contents never run
      tpl.innerHTML = String(html);
      scrub(tpl.content);
      return tpl.innerHTML;
    },

    /** Convenience: sanitize and assign in one call. */
    setHTML(el, html) {
      if (el) el.innerHTML = this.clean(html);
      return el;
    },
  };
})();

if (typeof window !== 'undefined') window.Sanitizer = Sanitizer;
if (typeof module !== 'undefined' && module.exports) module.exports = Sanitizer;
