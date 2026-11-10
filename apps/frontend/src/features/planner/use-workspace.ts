import { useEffect, useRef, useState } from 'react';
import { z } from 'zod';
import { GenerateItineraryDto, type GenerateItineraryInput } from '@triptinker/contracts';
import { STORAGE_KEYS } from '@/lib/keys';
import { readStored, writeStored } from '@/lib/storage';
import { tripSchema, useTripStore } from './trip-store';

const WORKSPACE_KEY = STORAGE_KEYS.workspace;
// The draft may be half-written, so it is not held to the request's minimum length.
const workspaceSchema = z.object({ trip: tripSchema.nullable(), form: GenerateItineraryDto.schema.extend({ brief: z.string().max(2000) }) });
export const EMPTY_FORM: GenerateItineraryInput = { brief: '', days: null, pace: 'balanced' };

function restoreWorkspace() {
  const saved = readStored(WORKSPACE_KEY, workspaceSchema);
  return { trip: saved?.trip ?? null, form: saved ? { ...EMPTY_FORM, ...saved.form } : EMPTY_FORM };
}

/** Restores and persists the editable trip and its draft request. */
export function useWorkspace() {
  const [initial] = useState(restoreWorkspace);
  const [form, setForm] = useState<GenerateItineraryInput>(initial.form);
  const store = useTripStore(initial.trip);
  const { trip } = store;

  // Autosave the workspace so a reload picks up exactly where the traveller left off.
  // Writes are debounced, and flushed when the page is hidden so a quick reload never loses an edit.
  const latest = useRef({ trip, form });
  useEffect(() => {
    latest.current = { trip, form };
    const timer = setTimeout(() => writeStored(WORKSPACE_KEY, latest.current), 300);
    return () => clearTimeout(timer);
  }, [trip, form]);
  useEffect(() => {
    const flush = () => writeStored(WORKSPACE_KEY, latest.current);
    const onVisibility = () => document.visibilityState === 'hidden' && flush();
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { form, setForm, store };
}
