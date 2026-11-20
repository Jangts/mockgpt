/**
 * Web page text source: URL discovery, guarded retrieval, text extraction and diagnostics.
 *
 * Answers one question for the text generators — "what readable text is at this URL?" — while
 * classifying the ways real pages refuse to answer: authentication redirects, verification
 * interstitials, firewall blocks, unsupported encodings, render-only pages and empty bodies.
 * Every outcome is turned into a stable `MOCK_WEB_*` code plus bounded metadata, and the optional
 * `fallback` string is used only for retrieval-class failures, never for cancellation or a
 * rejected destination.
 */
import { sampleText } from '../generators/text-analysis.js';
import { charLength } from '../shared/text.js';
import { Readability } from '@mozilla/readability';
import { parseHTML } from 'linkedom';
import type { GenerationContext } from '../types.js';
import type { TextSource } from '../generators/text.js';
import {
  abortable,
  chars,
  checkSynchronous,
  integer,
  MockGPTError,
  breakWhile,
} from '../shared/utils.js';
import {
  checkUrl,
  pageHeaders,
  readPublicPage,
  type LoadedPage,
  type WebProfile,
  type PageProgress,
} from './http.js';

export { isPublicAddress } from './http.js';
export type { LoadedPage, WebProfile } from './http.js';

/** Configuration of `sources.web`. */
export interface WebOptions {
  /** Fixed URL or synchronous selector; when omitted the prompt must contain exactly one URL. */
  url?: string | ((context: GenerationContext) => string);
  /** Header profile; only `browser` (alias `crawler`) exists today. Default `browser`. */
  profile?: WebProfile;
  /** Content negotiation only; never copies browser cookies or model credentials. */
  headers?: Record<string, string>;
  /** Total retrieval deadline in milliseconds (1-120 000); default 20 000. */
  timeoutMs?: number;
  /**
   * Maximum page size in bytes (1-20 971 520); default 2 MiB, applied before and after decoding.
   */
  maxBytes?: number;
  /** Maximum characters of extracted text kept for analysis (1-1 000 000); default 30 000. */
  maxChars?: number;
  /** Redirect budget (0-10); default 3. Each target is re-validated like the original URL. */
  maxRedirects?: number;
  /** Explicit replacement source text on retrieval failure; request cancellation still throws. */
  fallback?: string;
  /**
   * Trusted offline/custom transport. It owns its destination policy; not supplied by remote
   * clients.
   */
  load?: (url: URL, signal: AbortSignal, maxBytes: number) => Promise<LoadedPage>;
}

/**
 * Resolve the URL to retrieve.
 *
 * An explicit selector never silently falls back to the prompt: returning `undefined` is a
 * configuration error, which keeps fixtures from quietly reading a different page.
 *
 * @param context Per-call context, used for the prompt and for calling the selector.
 * @param choice Configured URL or selector.
 * @returns Validated HTTP(S) URL.
 * @throws MockGPTError `MOCK_WEB_URL` when the value is invalid, contains credentials, or when no
 * selector is configured and the prompt does not contain exactly one URL.
 * @throws MockGPTError `MOCK_CONFIG` when a selector returns a non-string or a promise.
 */
function urlFrom(context: GenerationContext, choice: WebOptions['url']): URL {
  const selected = typeof choice === 'function' ? choice(context) : choice;
  if (choice !== undefined)
    checkSynchronous(selected, 'string', 'Web URL selector must return a string synchronously');
  // Trailing punctuation is excluded so a URL inside prose is still detected as one URL.
  const matches = context.prompt.match(/https?:\/\/[^\s<>"'，。！？）)]+/g) ?? [];
  breakWhile(
    !(selected !== undefined || matches.length === 1),
    () => new MockGPTError('MOCK_WEB_URL', 'Expected exactly one URL, or configure url explicitly'),
  );
  try {
    const url = new URL(selected ?? matches[0]!);
    checkUrl(url);
    return url;
  } catch (error) {
    if (error instanceof MockGPTError) throw error;
    throw new MockGPTError('MOCK_WEB_URL', 'Invalid web URL');
  }
}

/**
 * Decode page bytes using the charset declared by the header or the document itself.
 *
 * @param page Loaded page.
 * @param validateType Reject non-HTML/plain-text MIME types; skipped for error pages whose body is
 * only inspected for diagnostics.
 * @returns Decoded document text.
 * @throws MockGPTError `MOCK_WEB_TYPE` for an unsupported media type, `MOCK_WEB_ENCODING` when the
 * declared charset label is unknown to `TextDecoder`.
 */
function decode(page: LoadedPage, validateType = true): string {
  const mime = page.contentType.split(';')[0].trim().toLowerCase();
  breakWhile(
    validateType && !['text/html', 'application/xhtml+xml', 'text/plain'].includes(mime),
    () => new MockGPTError('MOCK_WEB_TYPE', 'Web source only supports HTML or plain text'),
  );
  const headerCharset = /charset\s*=\s*["']?([^;\s"']+)/i.exec(page.contentType)?.[1];
  // Only the first 4 KiB is scanned for a `<meta charset>` declaration; latin1 makes the byte
  // scan position-preserving so the declaration itself is readable regardless of the real charset.
  const prefix = new TextDecoder('latin1').decode(page.bytes.slice(0, 4096));
  const metaCharset = /<meta\b[^>]*charset\s*=\s*["']?([^\s"'/>;]+)/i.exec(prefix)?.[1];
  try {
    return new TextDecoder(headerCharset ?? metaCharset ?? 'utf-8').decode(page.bytes);
  } catch {
    throw new MockGPTError('MOCK_WEB_ENCODING', 'Unsupported page character encoding');
  }
}

// Common interstitial titles. Full-string anchors keep ordinary articles that merely mention
// verification or captchas from being misclassified.
const verificationTitles = [
  /^(?:百度)?安全验证$/u,
  /^(?:人机验证|访问验证)$/u,
  /^(?:Just a moment(?:\.{3}|…)?|Attention Required!?|Verify (?:you are|you're) human)$/i,
];

/**
 * Detect a verification/challenge page by its title.
 *
 * @param html Decoded HTML.
 * @returns The normalized title when it matches a known challenge pattern, otherwise undefined.
 */
function verification(html: string): string | undefined {
  // Search opening/closing tokens separately: an upstream page containing many
  // unclosed <title> elements must not repeatedly scan every remaining suffix.
  const opening = /<title\b/i.exec(html);
  const start = opening ? html.indexOf('>', opening.index + opening[0].length) : -1;
  const closing = /<\/title>/gi;
  closing.lastIndex = start + 1;
  const end = start < 0 ? undefined : closing.exec(html)?.index;
  const title = (end === undefined ? '' : html.slice(start + 1, end)).replace(/\s+/g, ' ').trim();
  return verificationTitles.some((pattern) => pattern.test(title)) ? chars(title, 256) : undefined;
}

/**
 * Detect a firewall/WAF block page from its visible text.
 *
 * Evidence from a refusal page, not a guess based on a vendor-specific HTTP status.
 *
 * @param html Decoded HTML of an error response.
 * @param status Upstream HTTP status; only 4xx/5xx bodies are considered.
 * @returns True when the page shows both firewall wording and a block/denial statement.
 */
function firewallRefusal(html: string, status: number): boolean {
  if (status < 400 || !html) return false;
  let text: string;
  try {
    const { document } = parseHTML(
      // Plain-text error bodies are wrapped so the extractor has a document to inspect.
      /<html(?:\s|>)/i.test(html) ? html : `<html><body>${html}</body></html>`,
    );
    // Scripts are removed first so quoted error strings cannot impersonate a real refusal page.
    document.querySelectorAll('script,style,noscript').forEach((node) => node.remove());
    text = (document.body ?? document.documentElement)?.textContent?.replace(/\s+/g, ' ') ?? '';
  } catch {
    return false;
  } // Malformed error HTML must not hide the original HTTP status.
  const evidence = [
    /防火墙|\bWAF\b|web\s+application\s+firewall/i,
    /已被.{0,16}(?:暂停|拦截|阻止)|(?:access|request|attack)\s+(?:(?:has\s+been|is)\s+)?(?:blocked|denied)/i,
  ];
  return evidence.every((pattern) => pattern.test(text));
}

// Optional vendor prefixes are accepted so `/accounts/login`, `/auth/signin` and `/login` all
// match.
const authenticationPath = /^\/(?:accounts?\/|auth\/|users?\/)?(?:login|signin|sign-in)(?:\/|$)/i;

/**
 * Detect a redirect into a login page.
 *
 * @param page Loaded page whose `url` is the final URL.
 * @param requested URL the user originally asked for.
 * @returns Origin plus path of the login page (without query, so tokens are not recorded), or
 * undefined when the final URL is not an authentication path or the user requested it explicitly.
 */
function authenticationRedirect(page: LoadedPage, requested: URL): string | undefined {
  try {
    const final = new URL(page.url);
    if (authenticationPath.test(final.pathname) && !authenticationPath.test(requested.pathname))
      return final.origin + final.pathname;
  } catch {
    /* A custom loader's optional URL metadata must not conceal its HTTP error. */
  }
  return undefined;
}

/**
 * Classify a loaded page and return its decodable body.
 *
 * Order matters: authentication redirect, then verification title, then firewall evidence, and
 * only then the generic HTTP error. Each check reports a distinct reason so diagnostics can say
 * why a page was refused instead of only which status it returned.
 *
 * @param page Loaded page.
 * @param requested URL the user originally asked for.
 * @returns Decoded document text.
 * @throws MockGPTError `MOCK_WEB_AUTH_REQUIRED`, `MOCK_WEB_CHALLENGE`, `MOCK_WEB_BLOCKED` or
 * `MOCK_WEB_HTTP` (all status 502) with bounded details, or the decoding errors from `decode`.
 */
function checkPage(page: LoadedPage, requested: URL): string {
  const status = page.status ?? 200;
  const ok = status >= 200 && status < 300;
  // A refusal's content can be inspected for evidence, never used as an article.
  let html = '';
  try {
    html = decode(page, ok);
  } catch (error) {
    if (ok) throw error;
  }
  const login = ok ? authenticationRedirect(page, requested) : undefined;
  breakWhile(
    !!login,
    () =>
      new MockGPTError('MOCK_WEB_AUTH_REQUIRED', 'Web source redirected to authentication', 502, {
        upstreamStatus: status,
        reason: 'authentication-redirect',
        // URLs and titles are bounded because they may contain user-specific query data.
        finalUrl: chars(login!, 512),
        ...(login!.length > 512 ? { urlTruncated: true } : {}),
      }),
  );
  const title = /html/i.test(page.contentType) ? verification(html) : undefined;
  breakWhile(
    !!title,
    () =>
      new MockGPTError('MOCK_WEB_CHALLENGE', 'Web source returned a verification page', 502, {
        upstreamStatus: status,
        reason: 'verification-required',
        pageTitle: title!,
      }),
  );
  breakWhile(
    /html/i.test(page.contentType) && firewallRefusal(html, status),
    () =>
      new MockGPTError('MOCK_WEB_BLOCKED', 'Web source was denied by the upstream firewall', 502, {
        upstreamStatus: status,
        reason: 'firewall-denied',
      }),
  );
  breakWhile(
    !ok,
    () =>
      new MockGPTError('MOCK_WEB_HTTP', `Web source returned HTTP ${status}`, 502, {
        upstreamStatus: status,
      }),
  );
  return html;
}

/**
 * Registry of remote text sources.
 *
 * A source is a `TextSource` function, so it can be passed directly as `source` to any text
 * generator; the generator decides how the extracted text is summarized or quoted.
 */
export const sources = {
  /**
   * Retrieve a page and return its readable text.
   *
   * @param options URL selection, transport limits, headers, fallback and optional loader.
   * @returns Async source resolving to bounded plain text of the page.
   * @throws MockGPTError `MOCK_WEB_*` codes for retrieval/classification failures.
   * @throws The abort reason when the enclosing call is cancelled; a configured fallback is never
   * used for cancellation or for a rejected destination (`MOCK_WEB_TARGET`).
   */
  web: (options: WebOptions = {}): Exclude<TextSource, string> => {
    const { url: urlChoice, load } = options;
    const timeout = integer(options.timeoutMs ?? 20_000, 'timeoutMs', 1, 120_000);
    const maxBytes = integer(options.maxBytes ?? 2_097_152, 'maxBytes', 1, 20_971_520);
    const maxChars = integer(options.maxChars ?? 30_000, 'maxChars', 1, 1_000_000);
    const headers = pageHeaders(options.headers, options.profile);
    const redirects = integer(options.maxRedirects ?? 3, 'maxRedirects', 0, 10);
    const fallback = options.fallback;
    breakWhile(
      fallback !== undefined && typeof fallback !== 'string',
      () => new MockGPTError('MOCK_CONFIG', 'Web fallback must be a string'),
    );
    return async (context) => {
      const url = urlFrom(context, urlChoice);
      // Diagnostics record truncated URLs: query strings can carry tokens or personal data.
      const requestedUrl = chars(url.href, 512);
      // The timeout is a separate signal so it can terminate only this retrieval.
      const signal = AbortSignal.any([context.signal, AbortSignal.timeout(timeout)]);
      const progress: PageProgress = { webStage: 'dns', receivedBytes: 0 };
      // Tracks which stage failed so a generic error can be attributed to fetch/decode/extract.
      let stage = 'fetch';
      try {
        const page = await abortable(
          load
            ? load(url, signal, maxBytes)
            : readPublicPage(url, signal, { maxBytes, maxRedirects: redirects, headers, progress }),
          signal,
        );
        // A custom loader owns its own transport, so no HTTP transport is reported for it.
        if (!load) context.report({ transport: 'http', ...progress });
        signal.throwIfAborted();
        breakWhile(
          !(page.bytes.length <= maxBytes),
          () => new MockGPTError('MOCK_WEB_LIMIT', 'Page exceeds byte limit'),
        );
        stage = 'decode';
        const html = checkPage(page, url);
        let title = '';
        let text = html;
        let extraction = 'plain';
        stage = 'extract';
        if (!page.contentType.trim().toLowerCase().startsWith('text/plain')) {
          // linkedom does not execute scripts or load subresources.
          const normalized = /<html(?:\s|>)/i.test(html)
            ? html
            : '<!doctype html><html><head></head><body>' + html + '</body></html>';
          const { document } = parseHTML(normalized);
          title = document.querySelector('title')?.textContent ?? '';
          // Component templates are inert HTML; their embedded CSS/text is not article content.
          // Remove them before Readability as DOM parsers differ in how template contents are exposed.
          document
            .querySelectorAll('script,style,noscript,template')
            .forEach((node) => node.remove());
          let article: ReturnType<Readability['parse']> = null;
          try {
            article = new Readability(document.cloneNode(true) as unknown as Document).parse();
          } catch {
            // A parser crash is not a page failure: the sanitized fallback below still applies.
            context.report({ readabilityFallback: true });
          }
          if (article?.textContent?.trim()) {
            title = article.title ?? title;
            text = article.textContent;
            extraction = 'readability';
          } else {
            document
              .querySelectorAll('nav,header,footer,aside,form')
              .forEach((node) => node.remove());
            const blockTags = 'p,div,section,article,li,h1,h2,h3,br';
            // Block boundaries become newlines because textContent alone concatenates them.
            document
              .querySelectorAll(blockTags)
              .forEach((node) => node.appendChild(document.createTextNode('\n')));
            text = (document.body ?? document.documentElement)?.textContent ?? '';
            extraction = 'fallback';
          }
        }
        text = text
          .replace(/[ \t]+/g, ' ')
          .replace(/\n\s*\n/g, '\n')
          .trim();
        // No text plus a script tag means the page renders client-side; tell the caller so instead
        // of reporting an empty article.
        breakWhile(
          !text.length && /<script\b/i.test(html),
          () =>
            new MockGPTError(
              'MOCK_WEB_RENDER_REQUIRED',
              'Web page requires browser execution before readable text is available',
              502,
            ),
        );
        breakWhile(
          !text.length,
          () => new MockGPTError('MOCK_WEB_EMPTY', 'Page has no readable text', 502),
        );
        const sampled = sampleText(text, maxChars);
        const finalUrl = chars(page.url, 512);
        context.report({
          requestedUrl,
          finalUrl,
          ...(requestedUrl !== url.href || finalUrl !== page.url ? { urlTruncated: true } : {}),
          title: chars(title, 256),
          extraction,
          sourceTruncated: sampled.sampled,
          sourceSampling: sampled.sampled
            ? maxChars < 6
              ? 'head'
              : 'head-middle-tail'
            : 'complete',
          analyzedChars: charLength(sampled.text),
        });
        return sampled.text;
      } catch (error) {
        // Caller cancellation always wins over a fallback or a locally classified error.
        context.signal.throwIfAborted();
        if (!load) context.report({ transport: 'http', ...progress });
        const code = (error as NodeJS.ErrnoException)?.code;
        const stageErrors: Record<string, string> = {
          fetch: 'MOCK_WEB_FETCH',
          decode: 'MOCK_WEB_DECODE',
          extract: 'MOCK_WEB_EXTRACT',
        };
        const failure = signal.aborted
          ? new MockGPTError('MOCK_WEB_TIMEOUT', 'Web page retrieval timed out', 504)
          : error instanceof MockGPTError
            ? error
            : new MockGPTError(
                stageErrors[stage],
                stage === 'fetch'
                  ? 'Unable to retrieve web page'
                  : 'Unable to process retrieved page content',
                502,
                // Only well-formed uppercase transport codes are exposed; messages stay hidden.
                typeof code === 'string' && /^[A-Z0-9_]+$/.test(code)
                  ? { transportCode: code }
                  : undefined,
              );
        context.report({
          requestedUrl,
          ...(requestedUrl !== url.href ? { urlTruncated: true } : {}),
          sourceError: failure.code,
          stage,
          ...(failure.details ?? {}),
        });
        // A rejected destination and cancellation are policy decisions, not retrieval failures that
        // a canned fallback should paper over.
        if (
          fallback !== undefined &&
          failure.code.startsWith('MOCK_WEB_') &&
          failure.code !== 'MOCK_WEB_TARGET'
        ) {
          context.report({ sourceFallback: true });
          return fallback;
        }
        throw failure;
      }
    };
  },
};
