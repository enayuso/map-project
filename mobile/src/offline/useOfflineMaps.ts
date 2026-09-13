/**
 * State + handlers for the offline-maps utility panel. See api.ts's own
 * header comment for why this is a thin download-management UI over
 * MapLibre Native's own built-in offline pack system, not custom online/
 * offline-switching logic. Extracted out of App.tsx — see
 * src/errors/useErrorLog.ts's header comment for why these utility-panel
 * features are being pulled into their own hooks.
 */
import { useEffect, useState, type RefObject } from 'react';
import type { MapRef, OfflinePackStatus } from '@maplibre/maplibre-react-native';
import { deleteOfflinePack, downloadArea, listOfflinePacks, type PackMetadata } from './api';
import type { PackListItem } from './OfflineMapsPanel';
import { logError } from '../errors/logger';

export type UseOfflineMaps = {
  visible: boolean;
  toggle: () => void;
  close: () => void;
  label: string;
  setLabel: (label: string) => void;
  downloading: boolean;
  downloadStatus: OfflinePackStatus | null;
  downloadError: string | null;
  packs: PackListItem[];
  downloadCurrentArea: () => Promise<void>;
  deletePack: (id: string) => Promise<void>;
};

export function useOfflineMaps(
  mapRef: RefObject<MapRef | null>,
  closeUtilityPanels: () => void,
  showSatellite: boolean,
  minZoom: number,
  initialZoom: number,
): UseOfflineMaps {
  const [visible, setVisible] = useState(false);
  const [label, setLabel] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<OfflinePackStatus | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);
  const [packs, setPacks] = useState<PackListItem[]>([]);

  const refreshPacks = async () => {
    const rawPacks = await listOfflinePacks();
    const items = await Promise.all(
      rawPacks.map(async p => {
        const status = await p.status();
        return {
          id: p.id,
          metadata: p.metadata as PackMetadata,
          sizeBytes: status.completedResourceSize,
        };
      }),
    );
    setPacks(items);
  };

  useEffect(() => {
    if (visible) refreshPacks();
    // refreshPacks is recreated every render (a plain function, not
    // memoized) — deliberately only depending on `visible` here, same as
    // this effect did before extraction, so it refreshes when the panel
    // opens, not on every render.
  }, [visible]);

  const toggle = () => {
    if (visible) {
      setVisible(false);
    } else {
      closeUtilityPanels();
      setVisible(true);
    }
  };

  const downloadCurrentArea = async () => {
    const bounds = await mapRef.current?.getBounds();
    if (!bounds) {
      setDownloadError('Could not read the current map view — try again.');
      return;
    }
    const zoom = (await mapRef.current?.getZoom()) ?? initialZoom;
    // A little wider than the exact current zoom, so a modest zoom-out
    // still has something to show offline, not just the one exact level.
    const packMinZoom = Math.max(minZoom, Math.floor(zoom) - 2);

    setDownloading(true);
    setDownloadError(null);
    setDownloadStatus(null);
    try {
      await downloadArea(
        bounds,
        packMinZoom,
        showSatellite ? 'hybrid' : 'basic',
        label.trim(),
        status => {
          setDownloadStatus(status);
          if (status.state === 'complete') {
            setDownloading(false);
            setLabel('');
            refreshPacks();
          }
        },
        message => {
          setDownloadError(message);
          setDownloading(false);
        },
      );
    } catch (e) {
      logError('offline:download', e);
      setDownloadError(e instanceof Error ? e.message : 'Could not start download.');
      setDownloading(false);
    }
  };

  const deletePack = async (id: string) => {
    await deleteOfflinePack(id);
    refreshPacks();
  };

  return {
    visible,
    toggle,
    close: () => setVisible(false),
    label,
    setLabel,
    downloading,
    downloadStatus,
    downloadError,
    packs,
    downloadCurrentArea,
    deletePack,
  };
}
