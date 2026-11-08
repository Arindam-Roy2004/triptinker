import { Bed, Camera, ForkKnife, MapPin, Mountains, ShoppingBag, Ticket, Train, Wine, type Icon } from '@phosphor-icons/react';
import type { Category } from '@shared/schema';

/** Category colours are muted and work on both themes; they only ever tint small icons. */
export const CATEGORY_META: Record<Category, { label: string; icon: Icon; color: string }> = {
  sight: { label: 'Sight', icon: Camera, color: '#6b6560' },
  food: { label: 'Food', icon: ForkKnife, color: '#c4623f' },
  activity: { label: 'Activity', icon: Ticket, color: '#a8742a' },
  nature: { label: 'Outdoors', icon: Mountains, color: '#3f8a52' },
  shopping: { label: 'Shopping', icon: ShoppingBag, color: '#9a5a85' },
  nightlife: { label: 'Evening', icon: Wine, color: '#5a5ab0' },
  transit: { label: 'Transit', icon: Train, color: '#3f7f9a' },
  stay: { label: 'Stay', icon: Bed, color: '#8a7a64' },
  other: { label: 'Other', icon: MapPin, color: '#8f8a84' },
};
