import { z } from 'zod';
import { LIMITS } from '../limits';
import { boundedText } from './fields.schema';

/**
 * A web page the plan was grounded in. Only https links are ever sent to the browser, and
 * they are shown as plain links, so a search result can never inject markup or scripts.
 */
export const webSourceSchema = z.strictObject({
  title: boundedText(LIMITS.sourceTitleMax),
  url: z.url({ protocol: /^https$/ }).max(LIMITS.sourceUrlMax).refine((value) => {
    try {
      const url = new URL(value);
      return !url.username && !url.password;
    } catch { return false; }
  }, 'Source URLs must not contain credentials.'),
  domain: z.string().min(1).max(LIMITS.sourceDomainMax)
    .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/, 'Use a valid lowercase hostname.'),
}).superRefine((source, ctx) => {
  try {
    const domain = new URL(source.url).hostname.replace(/^www\./, '');
    if (domain !== source.domain) ctx.addIssue({ code: 'custom', path: ['domain'], message: 'The source domain must match its URL.' });
  } catch { /* The URL field already reports its validation error. */ }
});
export type WebSource = z.infer<typeof webSourceSchema>;

export const MAX_SOURCES = LIMITS.maxSources;
export const sourcesSchema = z.array(webSourceSchema).max(MAX_SOURCES).superRefine((sources, ctx) => {
  const domains = new Set<string>();
  sources.forEach((source, index) => {
    if (domains.has(source.domain)) ctx.addIssue({ code: 'custom', path: [index, 'domain'], message: 'Use only one source per domain.' });
    domains.add(source.domain);
  });
});
