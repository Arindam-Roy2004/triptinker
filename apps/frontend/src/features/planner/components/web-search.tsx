import { ArrowUpRight, CaretDown, GlobeSimple, MagnifyingGlass, Sparkle } from '@phosphor-icons/react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { useId, useState } from 'react';
import type { WebSource } from '@triptinker/contracts';
import { Shimmer } from '@/components/ai/shimmer';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';

const ease = [0.22, 1, 0.36, 1] as const;

function SiteMark({ domain, className }: { domain: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  return (
    <span className={cn('relative grid size-6 shrink-0 place-items-center rounded-full border border-line bg-surface shadow-[0_0_0_2px_var(--surface)]', className)}>
      {(!loaded || failed) && <GlobeSimple size={14} className="text-muted" aria-hidden />}
      {!failed && (
        <img
          src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=32`}
          width={14}
          height={14}
          alt=""
          loading="lazy"
          referrerPolicy="no-referrer"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className={cn('absolute size-3.5 object-contain', !loaded && 'opacity-0')}
        />
      )}
    </span>
  );
}

const SITE_NAMES: Record<string, string> = {
  'en.wikipedia.org': 'Wikipedia', 'wikivoyage.org': 'Wikivoyage', 'en.wikivoyage.org': 'Wikivoyage',
  'lonelyplanet.com': 'Lonely Planet', 'tripadvisor.com': 'Tripadvisor', 'cntraveler.com': 'Condé Nast',
  'roughguides.com': 'Rough Guides', 'afar.com': 'AFAR', 'timeout.com': 'Time Out',
};

/** Named source chips keep the research readable without opening another panel. */
function SourceChips({ sources }: { sources: WebSource[] }) {
  const [expanded, setExpanded] = useState(false);
  const id = useId();
  const reduce = useReducedMotion();
  const visible = expanded ? sources : sources.slice(0, 4);
  return (
    <div id={id} role="group" aria-label="Source websites" className="flex flex-wrap items-center gap-1.5">
      {visible.map((source, i) => (
        <Tooltip key={source.url}>
          <TooltipTrigger asChild>
            <motion.a href={source.url} target="_blank" rel="noopener noreferrer" aria-label={`${source.title} — ${source.domain}`}
              initial={reduce ? false : { opacity: 0, y: 3 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, delay: Math.min(i, 4) * 0.035 }}
              className="inline-flex min-h-7 max-w-full items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1 text-[11px] leading-4 text-muted shadow-[0_1px_1px_rgb(0_0_0/0.025)] transition-colors hover:border-line-strong hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-brand">
              <SiteMark domain={source.domain} className="size-4 rounded-[3px] border-0 shadow-none" />
              <span className="max-w-40 truncate">{SITE_NAMES[source.domain.replace(/^www\./, '')] ?? source.domain.replace(/^www\./, '')}</span>
            </motion.a>
          </TooltipTrigger>
          <TooltipContent side="top" sideOffset={6} className="max-w-64 bg-ink text-surface">
            <span className="block font-medium">{source.title}</span>
            <span className="mt-0.5 block text-[11px] opacity-70">{source.domain}</span>
          </TooltipContent>
        </Tooltip>
      ))}
      {sources.length > 4 && <button type="button" aria-expanded={expanded} aria-controls={id} onClick={() => setExpanded(!expanded)} className="min-h-7 rounded-md border border-line px-2 py-1 text-[11px] leading-4 text-subtle transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-brand">{expanded ? 'Show less' : `+${sources.length - 4} more`}</button>}
    </div>
  );
}

/** Compact source marks, each a real link; the disclosure opens the full titles and domains. */
export function SourceStack({ sources, label = 'Sources' }: { sources: WebSource[]; label?: string }) {
  const [open, setOpen] = useState(false);
  if (!sources.length) return null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <div className="inline-flex min-w-0 flex-wrap items-center gap-x-2 gap-y-2">
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`View ${sources.length} sources`}
            className="rounded-sm text-[12px] leading-6 text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brand"
          >
            {label}
          </button>
        </PopoverTrigger>
        <div className="isolate flex -space-x-1.5 py-0.5" role="group" aria-label="Source websites">
          {sources.slice(0, 6).map((source) => (
            <Tooltip key={source.url}>
              <TooltipTrigger asChild>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${source.title} — ${source.domain}`}
                  className="relative rounded-full transition-transform duration-200 hover:z-10 hover:-translate-y-1 focus-visible:z-10 focus-visible:-translate-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand motion-reduce:transform-none"
                >
                  <SiteMark domain={source.domain} />
                </a>
              </TooltipTrigger>
              <TooltipContent side="top" sideOffset={8} className="max-w-64 bg-ink text-surface">
                <span className="block font-medium">{source.title}</span>
                <span className="mt-0.5 block text-[11px] opacity-70">{source.domain}</span>
              </TooltipContent>
            </Tooltip>
          ))}
        </div>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={open ? 'Hide source details' : 'Show source details'}
            className="grid size-6 shrink-0 place-items-center rounded-md text-subtle transition-colors hover:bg-sunken hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          >
            {sources.length > 6 ? <span className="tabular text-[11px]">+{sources.length - 6}</span> : <CaretDown size={12} className={cn('transition-transform motion-reduce:transition-none', open && 'rotate-180')} />}
          </button>
        </PopoverTrigger>
      </div>
      <PopoverContent align="start" sideOffset={10} className="w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-line bg-surface p-1.5 text-ink">
        <p className="px-2.5 pt-2 pb-2.5 text-[12px] font-medium text-muted">{sources.length} sources for this trip</p>
        <ul className="flex max-h-72 flex-col overflow-y-auto overscroll-contain">
          {sources.map((source) => (
            <li key={source.url}>
              <a href={source.url} target="_blank" rel="noopener noreferrer" className="group flex items-start gap-3 rounded-lg px-2.5 py-2.5 transition-colors hover:bg-sunken focus-visible:bg-sunken focus-visible:outline-2 focus-visible:outline-brand">
                <SiteMark domain={source.domain} className="mt-0.5 shadow-none" />
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-[13px] leading-5 font-medium">{source.title}</span>
                  <span className="mt-0.5 block truncate text-[11px] text-subtle">{source.domain}</span>
                </span>
                <ArrowUpRight size={13} className="mt-1 shrink-0 text-subtle transition-colors group-hover:text-brand" aria-hidden />
              </a>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Search rows reveal only when their corresponding server events arrive. */
export function WebSearch({ query, sources, searching, elapsed }: { query: string | null; sources: WebSource[] | null; searching: boolean; elapsed: number }) {
  const reduce = useReducedMotion();
  const id = useId();
  const found = sources ?? [];
  const reveal = {
    initial: reduce ? false as const : { height: 0, opacity: 0, filter: 'blur(3px)' },
    animate: { height: 'auto', opacity: 1, filter: 'blur(0px)' },
    exit: reduce ? undefined : { height: 0, opacity: 0 },
    transition: { duration: 0.3, ease },
  };

  return (
    <div aria-labelledby={id} className="min-w-0 text-[13px] leading-5">
      <div className="flex items-start gap-2.5 py-1">
        <MagnifyingGlass size={16} className="mt-0.5 shrink-0 text-muted" aria-hidden />
        <p id={id} className="font-medium text-muted">{searching ? 'Searching the web' : 'Searched the web'}</p>
      </div>
      <div className="ml-2">
        <div className="relative py-1 pr-0 pl-5">
          <span aria-hidden className="absolute -top-2.5 -left-px h-6 w-3 rounded-bl-lg border-b border-l border-line" />
          <div className="flex min-w-0 items-start gap-2">
            <GlobeSimple size={14} className="mt-1 shrink-0 text-subtle" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="text-[12px] text-muted">{searching ? 'Looking for travel guides' : 'Looked up travel guides'}</p>
              {query && <p title={query} className="mt-0.5 line-clamp-2 font-mono text-[11px] leading-[18px] break-words text-subtle">{query}</p>}
            </div>
            {sources !== null && <span className="tabular mt-0.5 shrink-0 text-[11px] text-subtle">{found.length} {found.length === 1 ? 'result' : 'results'}</span>}
          </div>
          <AnimatePresence initial={false}>
            {!!found.length && (
              <motion.div key="sources" {...reveal} className="overflow-hidden">
                <div className="relative ml-1.5 pt-1 pb-0.5 pl-4">
                  <span aria-hidden className="absolute top-0 left-0 h-5 w-2.5 rounded-bl-lg border-b border-l border-line" />
                  <SourceChips sources={found} />
                </div>
              </motion.div>
            )}
            {sources !== null && !found.length && (
              <motion.p key="empty" {...reveal} className="overflow-hidden pt-1 pl-[22px] text-[12px] text-subtle">No sources available. Continuing with your brief.</motion.p>
            )}
          </AnimatePresence>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {searching && (
          <motion.div key="working" {...reveal} className="overflow-hidden" role="status">
            <div className="flex items-center gap-2.5 pt-3 pb-1 text-subtle">
              <motion.span animate={reduce ? undefined : { opacity: [0.4, 1, 0.4], scale: [0.85, 1, 0.85] }} transition={{ duration: 1.6, repeat: Infinity }} className="relative grid size-4 shrink-0 place-items-center" aria-hidden>
                <Sparkle size={14} weight="fill" />
                <Sparkle size={6} weight="fill" className="absolute -top-0.5 -right-0.5" />
              </motion.span>
              <Shimmer as="span" className="text-[12px] font-medium" duration={1.8}>Searching</Shimmer>
              <span className="tabular font-mono text-[10px]">{Math.max(0, elapsed / 1000).toFixed(1)}s</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
