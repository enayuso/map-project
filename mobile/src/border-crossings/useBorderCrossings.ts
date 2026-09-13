/**
 * State for the border-crossing info cards. See
 * docs/research/12-ferry-dive-site-data-sourcing.md for the same
 * "curated, not live" pattern as ferries/dive sites — only ever 2 of
 * these (fixed, real-world locations), so they're just always-visible map
 * markers, not a toggle button/panel. Extracted out of App.tsx — see
 * src/errors/useErrorLog.ts's header comment for why. "Get directions to
 * a crossing" stays in App.tsx, not here — same reasoning as dive sites'
 * own handleDiveSiteDirections.
 */
import { useEffect, useState } from 'react';
import { fetchBorderCrossings, type BorderCrossing } from './api';

export type UseBorderCrossings = {
  crossings: BorderCrossing[];
  selected: BorderCrossing | null;
  select: (crossing: BorderCrossing | null) => void;
};

export function useBorderCrossings(): UseBorderCrossings {
  const [crossings, setCrossings] = useState<BorderCrossing[]>([]);
  const [selected, setSelected] = useState<BorderCrossing | null>(null);

  useEffect(() => {
    fetchBorderCrossings()
      .then(setCrossings)
      .catch(() => setCrossings([])); // silent — a missing info card isn't worth a user-facing error
  }, []);

  return { crossings, selected, select: setSelected };
}
