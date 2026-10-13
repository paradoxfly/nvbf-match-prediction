// Unsaved picks are kept on the device, so a refresh on a slow connection loses nothing.

import type { PickDraft } from './pick-logic';

const storageKey = (date: string) => `picks:${date}`;

function isDraft(value: unknown): value is PickDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(draft.homeSets) &&
    Number.isSafeInteger(draft.awaySets) &&
    typeof draft.at === 'number' &&
    Array.isArray(draft.winners) &&
    draft.winners.every((side) => side === 'home' || side === 'away') &&
    Array.isArray(draft.losers) &&
    draft.losers.every((points) => typeof points === 'string')
  );
}

export function loadDrafts(date: string): Record<string, PickDraft> {
  try {
    const raw = window.localStorage.getItem(storageKey(date));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const drafts: Record<string, PickDraft> = {};
    for (const [matchId, value] of Object.entries(parsed)) {
      if (isDraft(value)) drafts[matchId] = value;
    }
    return drafts;
  } catch {
    // Private mode, blocked storage or a corrupt value: start clean.
    return {};
  }
}

export function storeDrafts(date: string, drafts: Record<string, PickDraft>): void {
  try {
    if (Object.keys(drafts).length === 0) window.localStorage.removeItem(storageKey(date));
    else window.localStorage.setItem(storageKey(date), JSON.stringify(drafts));
  } catch {
    // Storage full or blocked: the drafts still live in memory until the page closes.
  }
}
