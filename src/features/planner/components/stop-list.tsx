import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type Announcements, type DragEndEvent } from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CaretDown, DotsSixVertical } from '@phosphor-icons/react';
import { AnimatePresence, motion } from 'motion/react';
import type { Day, Stop } from '@shared/schema';
import { formatDuration } from '@/lib/format';
import { PixelFill } from '@/components/ui/pixel-fill';
import { cn } from '@/lib/utils';
import { CATEGORY_META } from '../categories';
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
};

/** A day's stops as a list: select (or expand) a row, drag the handle to reorder. */
export function StopList({ day, days, destination, selectedId, onSelect, inline, actionsFor, onReorder }: Props) {
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

  if (!day.stops.length) {
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
        <ol aria-label={`Stops for ${day.title}`} className="bg-surface">
          {day.stops.map((stop, index) => (
            <Row
              key={stop.id}
              stop={stop}
              index={index}
              selected={stop.id === selectedId}
              onSelect={() => onSelect(stop.id)}
              inline={inline}
              detail={
                <StopDetail compact stop={stop} index={index} count={day.stops.length} dayId={day.id} days={days} destination={destination} {...actionsFor(stop, index)} />
              }
            />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function Row({ stop, index, selected, onSelect, inline, detail }: { stop: Stop; index: number; selected: boolean; onSelect: () => void; inline: boolean; detail: React.ReactNode }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: stop.id });
  const meta = CATEGORY_META[stop.category];
  const Icon = meta.icon;
  const duration = formatDuration(stop.durationMinutes);
  const expanded = inline && selected;

  return (
    <li
      ref={setNodeRef}
      // Entrance uses a CSS animation with fill-mode "backwards" so it never fights dnd-kit's inline transform.
      style={{ transform: CSS.Translate.toString(transform), transition, animationDelay: `${Math.min(index, 8) * 35}ms` }}
      className={cn('group relative animate-rise overflow-hidden border-b border-line last:border-b-0', isDragging ? 'z-10 bg-surface shadow-[var(--shadow-float)]' : !selected && 'hover:bg-sunken/60')}
    >
      {selected && !isDragging && <PixelFill />}
      <div className="relative flex items-stretch">
        <button
          type="button"
          onClick={onSelect}
          aria-expanded={inline ? expanded : undefined}
          aria-current={!inline && selected ? 'true' : undefined}
          className="grid min-w-0 flex-1 grid-cols-[3.25rem_minmax(0,1fr)_auto] items-start gap-x-3 py-4 pl-6 text-left outline-offset-[-2px]"
        >
          <span className="label tabular pt-0.5 text-[12px] text-muted">{stop.time ?? '—'}</span>
          <span className="min-w-0">
            <span className="block text-[15px] leading-[21px] font-medium text-pretty text-ink">{stop.title}</span>
            <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[13px] text-muted">
              <Icon className="size-3.5" style={{ color: meta.color }} aria-hidden />
              {meta.label}
              {stop.area && <span className="text-subtle">· {stop.area}</span>}
              {duration && <span className="tabular text-subtle">· {duration}</span>}
            </span>
          </span>
          {inline && <CaretDown size={14} className={cn('mt-1 text-subtle transition-transform', expanded && 'rotate-180')} />}
        </button>
        <button
          ref={setActivatorNodeRef}
          {...attributes}
          {...listeners}
          aria-label={`Reorder ${stop.title}`}
          aria-roledescription="sortable stop"
          className="mr-2 hidden w-8 touch-none place-items-center self-center rounded-lg py-2 text-subtle opacity-0 transition-opacity group-hover:opacity-100 hover:bg-sunken hover:text-ink focus-visible:opacity-100 sm:grid"
        >
          <DotsSixVertical size={16} weight="bold" />
        </button>
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.25, ease }} className="overflow-hidden">
            <div className="relative pr-4 pb-5 pl-6 sm:pl-[5.5rem]">{detail}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </li>
  );
}
