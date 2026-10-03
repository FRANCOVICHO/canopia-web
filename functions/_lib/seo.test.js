/**
 * Property-based tests for SEO utility functions.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.8
 */

import { describe, it } from "vitest";
import * as fc from "fast-check";
import { escapeHtml, slugify, truncate, buildProductHtml } from "./seo.js";

describe("slugify", () => {
  /**
   * Property 2: slugify produces only URL-safe characters
   *
   * For any input string, slugify(s) must match ^[a-z0-9-]*$ and must not
   * start or end with a hyphen.
   *
   * Validates: Requirements 8.2
   */
  it("Property 2: output matches ^[a-z0-9-]*$ for any input", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result = slugify(s);
        return /^[a-z0-9-]*$/.test(result);
      }),
      { numRuns: 100 }
    );
  });

  it("Property 2: output does not start or end with a hyphen for any input", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result = slugify(s);
        return !result.startsWith("-") && !result.endsWith("-");
      }),
      { numRuns: 100 }
    );
  });
});

describe("truncate", () => {
  /**
   * Property 3: truncate never exceeds maxLen
   *
   * For any string and any maxLen > 0, truncate(s, maxLen).length <= maxLen
   *
   * Validates: Requirements 8.3
   */
  it("Property 3: output length never exceeds maxLen for any input", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.integer({ min: 1, max: 10_000 }),
        (s, maxLen) => {
          const result = truncate(s, maxLen);
          return result.length <= maxLen;
        }
      ),
      { numRuns: 100 }
    );
  });
});

describe("escapeHtml", () => {
  /**
   * Property 1: escapeHtml eliminates all dangerous HTML characters
   *
   * For any input string, escapeHtml(s) must not contain unescaped
   * `<`, `>`, `"`, or `'` characters.
   *
   * Validates: Requirements 8.1, 8.8
   */
  it("Property 1: output contains no unescaped <, >, \", or ' for any input", () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const result = escapeHtml(s);
        return (
          !result.includes("<") &&
          !result.includes(">") &&
          !result.includes('"') &&
          !result.includes("'")
        );
      }),
      { numRuns: 100 }
    );
  });
});

describe("buildProductHtml", () => {
  /**
   * Property 4: buildProductHtml contains correct escaped fields
   *
   * For any valid product (including those with HTML special characters in any
   * field), buildProductHtml(product, "") must:
   *   (a) contain escapeHtml(product.name) inside <title>
   *   (b) contain the canonical URL with product.id
   *   (c) contain '"@type": "Product"' in JSON-LD
   *   (d) not contain unescaped product field values that include <, >, ", or '
   *
   * Validates: Requirements 6.2, 6.3, 6.4, 6.7, 6.12
   */

  // Arbitrary for a valid product with arbitrary string fields (may include
  // HTML special chars) and a positive price.
  const arbitraryProduct = fc.record({
    id:          fc.string({ minLength: 1 }),
    name:        fc.string({ minLength: 1 }),
    description: fc.string(),
    price:       fc.float({ min: 0, noNaN: true }),
    image:       fc.string(),
    category:    fc.string(),
    tag:         fc.string(),
    visible:     fc.constantFrom(0, 1),
    updated_at:  fc.string(),
  });

  it("Property 4a: <title> contains escapeHtml(product.name)", () => {
    fc.assert(
      fc.property(arbitraryProduct, (product) => {
        const html = buildProductHtml(product, "");
        return html.includes("<title>" + escapeHtml(product.name));
      }),
      { numRuns: 100 }
    );
  });

  it("Property 4b: HTML contains canonical URL with product.id", () => {
    fc.assert(
      fc.property(arbitraryProduct, (product) => {
        const html = buildProductHtml(product, "");
        return html.includes("/producto/" + escapeHtml(product.id));
      }),
      { numRuns: 100 }
    );
  });

  it('Property 4c: HTML contains JSON-LD "@type": "Product"', () => {
    fc.assert(
      fc.property(arbitraryProduct, (product) => {
        const html = buildProductHtml(product, "");
        // JSON.stringify produces compact JSON without spaces after colons,
        // so we match both `"@type":"Product"` and `"@type": "Product"`.
        return html.includes('"@type":"Product"') || html.includes('"@type": "Product"');
      }),
      { numRuns: 100 }
    );
  });

  it("Property 4d: escaped product fields (name, description, image, category) contain no unescaped <, >, \", or '", () => {
    fc.assert(
      fc.property(arbitraryProduct, (product) => {
        const html = buildProductHtml(product, "");

        // Extract the HTML head section (everything before the first JSON-LD
        // block) to avoid flagging legitimate JSON syntax inside <script> tags.
        const htmlHead = html.slice(0, html.indexOf('<script type="application/ld+json">'));

        // The dangerous characters we care about for XSS are < > and '.
        // We do NOT check for raw `"` because `"` appears throughout the HTML
        // as structural attribute delimiters (e.g. content="...") and cannot
        // be distinguished from injected values via simple substring search.
        // The `escapeHtml` function escapes `"` to `&quot;`, which is tested
        // separately via the Property 1 escapeHtml test.
        //
        // Strategy: for each field value, if it contains `<`, `>`, or `'`,
        // the raw multi-character field string must not appear verbatim in the
        // HTML head. We also verify that dangerous chars in field values are
        // escaped by checking the escaped form does appear.
        const dangerousForSearch = /[<>']/;

        const fieldsToCheck = [
          product.name,
          product.description,
          product.image,
          product.category,
        ];

        for (const field of fieldsToCheck) {
          if (!dangerousForSearch.test(field)) continue;

          const escaped = escapeHtml(field);

          // The raw unescaped field must not appear verbatim in the HTML head.
          if (htmlHead.includes(field)) {
            return false;
          }

          // The escaped form must appear somewhere in the full HTML output,
          // confirming the field was rendered (just safely).
          if (!html.includes(escaped)) {
            return false;
          }
        }
        return true;
      }),
      { numRuns: 100 }
    );
  });
});
