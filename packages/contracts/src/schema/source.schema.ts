import { z } from 'zod';

/**
 * A web page the plan was grounded in. Only https links are ever sent to the browser, and
 * they are shown as plain links, so a search result can never inject markup or scripts.
 */
export const webSourceSchema = z.object({
  title: z.string().min(1).max(200),
  url: z.url({ protocol: /^https$/ }).max(2000),
  domain: z.string().min(1).max(253),
});
export type WebSource = z.infer<typeof webSourceSchema>;

export const MAX_SOURCES = 6;
