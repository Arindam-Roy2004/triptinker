import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent } from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CaretDown, DotsSixVertical } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import type { Day, Stop } from '@triptinker/contracts';
import { formatDuration, formatTime } from '@/lib/format';
import { PixelFill } from '@/components/ui/pixel-fill';
import { useMoreBelow } from '@/hooks/use-more-below';
import { cn } from '@/lib/utils';
import { CATEGORY_META } from '../categories';
import type { ChangeMark } from '../diff';
import { StopDetail, type StopActions } from './stop-detail';

const ease = [0.22, 1, 0.36, 1] as const;

type Props = {
  day: Day;
  days: Day[];
  destination: string;
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** On small screens a row expands in place instead of filling the side window. */
  inline: boolean;
  actionsFor: (stop: Stop, index: number) => StopActions;
  onReorder: (from: number, to: number) => void;
  /** While reviewing a proposed change: what happened to each stop, and the stops that would go. */
  marks?: Map<string, ChangeMark>;
  removed?: Stop[];
  /** No reordering or editing (a change is being made or reviewed). */
  locked?: boolean;
  /** The marks are for a change that was just applied: tint those rows briefly. */
  flash?: boolean;
};

const MARK: Record<ChangeMark | 'removed', { label: string; tone: string }> = {
  added: { label: 'New', tone: 'bg-ok-wash text-ok' },
  changed: { label: 'Edited', tone: 'bg-warn-wash text-warn' },
  moved: { label: 'Moved here', tone: 'bg-brand-wash text-brand' },
  removed: { label: 'Removed', tone: 'bg-err-wash text-err' },
};

function MarkTag({ mark }: { mark: ChangeMark | 'removed' }) {
  return <span className={cn('label ml-2 inline-block rounded-full px-1.5 py-px align-[2px] text-[10px]', MARK[mark].tone)}>{MARK[mark].label}</span>;
}

/** A day's stops as a list: select (or expand) a row, drag the handle to reorder. */
export function StopList({ day, days, destination, selectedId, onSelect, inline, actionsFor, onReorder, marks, removed = [], locked, flash }: Props) {
  const [listRef, moreBelow] = useMoreBelow<HTMLOListElement>();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const title = (id: unknown) => day.stops.find((s) => s.id === id)?.title ?? 'stop';
  const position = (id: unknown) => day.stops.findIndex((s) => s.id === id) + 1;
  const announcements: Announcements = {
    onDragStart: ({ active }) => `Picked up ${title(active.id)}. Arrow keys move it, space drops it, escape cancels.`,
    onDragOver: ({ active, over }) => (over ? `${title(active.id)} is at position ${position(over.id)} of ${day.stops.length}.` : undefined),
    onDragEnd: ({ active, over }) => (over ? `${title(active.id)} dropped at position ${position(over.id)}.` : `${title(active.id)} dropped.`),
    onDragCancel: ({ active }) => `Moving ${title(active.id)} cancelled.`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const from = day.stops.findIndex((s) => s.id === active.id);
    const to = day.stops.findIndex((s) => s.id === over.id);
    if (from !== -1 && to !== -1) onReorder(from, to);
  };

  if (!day.stops.length && !removed.length) {
    return (
      <div className="bg-surface px-6 py-12 text-center">
        <p className="text-[17px] font-medium">A free day</p>
        <p className="mt-1 text-[15px] text-muted">Every stop was removed. Undo, move one here, or ask for ideas below.</p>
      </div>
    );
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd} modifiers={[restrictToVerticalAxis, restrictToParentElement]} accessibility={{ announcements }}>
      <SortableContext items={day.stops.map((s) => s.id)} strategy={verticalListSortingStrategy}>
        <ol
          ref={listRef}
          aria-label={`Stops for ${day.title}`}
          data-more={moreBelow || undefined}
          className="flex flex-col bg-surface lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:[scrollbar-width:thin] lg:data-more:[mask-image:linear-gradient(to_bottom,black_calc(100%-40px),transparent)]"
        >
          {day.stops.map((stop, index) => (
            <Row
              key={stop.id}
              stop={stop}
              index={index}
              selected={stop.id === selectedId}
              onSelect={() => onSelect(stop.id)}
              inline={inline}
              mark={marks?.get(stop.id)}
              flash={flash}
              locked={locked}
              detail={<StopDetail compact readOnly={locked} stop={stop} index={index} count={day.stops.length} dayId={day.id} days={days} destination={destination} {...actionsFor(stop, index)} />}
            />
          ))}
          {removed.length > 0 && (
            // Removed stops collapse into one row, so reviewing a change never makes the day longer by more than a line.
            <li className="relative flex shrink-0 flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line py-3 pr-6 pl-6 last:border-b-0">
              <span className={cn('label rounded-full px-1.5 py-px text-[10px]', MARK.removed.tone)}>{removed.length} removed</span>
              {removed.map((stop, i) => (
                <span key={stop.id} className="text-[13px] text-subtle">
                  <span className="line-through">{stop.title}</span>
                  {i < removed.length - 1 && ','}
                </span>
              ))}
            </li>
          )}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function Row({
  stop,
  index,
  selected,
  onSelect,
  inline,
  detail,
  mark,
  locked,
  flash,
}: {
  stop: Stop;
  index: number;
  selected: boolean;
  onSelect: () => void;
  inline: boolean;
  detail: React.ReactNode;
  mark?: ChangeMark;
  locked?: boolean;
  flash?: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id, disabled: locked });
  const meta = CATEGORY_META[stop.category];
  const Icon = meta.icon;
  const duration = formatDuration(stop.durationMinutes);
  const expanded = inline && selected;

  return (
    <li
      ref={setNodeRef}
      // Entrance uses a CSS animation with fill-mode "backwards" so it never fights dnd-kit's inline transform.
      style={{ transform: CSS.Translate.toString(transform), transition, animationDelay: `${Math.min(index, 8) * 35}ms` }}
      // The focus ring is drawn on the whole row, not just the button inside it.
      className={cn(
        'group relative flex shrink-0 animate-rise flex-col overflow-hidden border-b border-line last:border-b-0',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:-outline-offset-2 has-[:focus-visible]:outline-brand/60',
        isDragging ? 'z-10 bg-surface shadow-[var(--shadow-float)]' : !selected && 'hover:bg-sunken/60',
      )}
    >
      {/* Its own layer: the row already runs an entrance animation, and two animations on one element override each other. */}
      {flash && mark && <span aria-hidden className="pointer-events-none absolute inset-0 animate-flash" />}
      <div className="relative flex items-stretch">
        {selected && !isDragging && <PixelFill />}
        <button
          type="button"
          onClick={onSelect}
          aria-expanded={inline ? expanded : undefined}
          aria-current={!inline && selected ? 'true' : undefined}
          className="relative grid min-w-0 flex-1 grid-cols-[4.5rem_minmax(0,1fr)_auto] items-start gap-x-2.5 py-3.5 pr-6 pl-6 text-left sm:pr-2 focus-visible:outline-none"
        >
          {/* The time column also carries how long the stop takes, so the meta line stays short. */}
          <span className="flex flex-col gap-1 pt-0.5">
            <span className="label tabular text-[12px] whitespace-nowrap text-muted">{formatTime(stop.time) ?? 'Any'}</span>
            {duration && <span className="tabular text-[12px] leading-4 whitespace-nowrap text-subtle">{duration}</span>}
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] leading-[21px] font-medium text-pretty text-ink">
              {stop.title}
              {mark && <MarkTag mark={mark} />}
            </span>
            <span className="mt-1 flex min-w-0 items-center gap-x-1.5 text-[13px] whitespace-nowrap text-muted">
              <Icon className="size-3.5" style={{ color: meta.color }} aria-hidden />
              {meta.label}
              {stop.area && (
                <>
                  <span aria-hidden className="text-subtle">·</span>
                  <span className="min-w-0 truncate text-subtle">{stop.area}</span>
                </>
              )}
            </span>
          </span>
          {inline && <CaretDown size={14} className={cn('mt-1 text-subtle transition-transform', expanded && 'rotate-180')} />}
        </button>
        {!locked && (
          <button
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${stop.title}`}
            aria-roledescription="sortable stop"
            className="mr-2 hidden w-8 touch-none place-items-center self-center rounded-lg py-2 text-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100 sm:grid"
          >
            <DotsSixVertical size={16} />
          </button>
        )}
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease }} className="overflow-hidden">
            <div className="relative pr-6 pb-4 pl-6 sm:pl-[6.625rem]">{detail}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
