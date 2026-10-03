import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/components/ui/ToastContext';
import { NEWER_APP_OPENED_EVENT } from '@/services/storage/indexedDbSchema';
import { readLocalStorageString, writeLocalStorageString } from '@/services/storage/uiLocalStorage';
import { buildV1Backup, v1BackupFileName } from '@/services/storage/v1Backup';

// Above the editor's bottom toolbar.
const BANNER_CLASS =
  'fixed bottom-24 left-1/2 z-[60] flex w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 items-center gap-3 rounded-xl border border-[var(--color-brand-border)] bg-[var(--brand-surface)] px-4 py-2.5 text-[13px] text-[var(--brand-text)] shadow-lg';

export const NEXT_VERSION_BANNER_DISMISSED_KEY = 'openflowkit-next-version-banner-dismissed';

function downloadJson(text: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.download = fileName;
  link.href = url;
  link.click();
  URL.revokeObjectURL(url);
}

export function useExportAllDiagrams(): () => Promise<void> {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const running = useRef(false);

  return useCallback(async () => {
    if (running.current) return;
    running.current = true;
    addToast(t('backup.exportAllProcessing', 'Exporting all diagrams…'), 'info');
    try {
      const backup = await buildV1Backup();
      if (backup.documents.length === 0) {
        addToast(t('backup.exportAllEmpty', 'There are no diagrams to export yet.'), 'info');
        return;
      }
      downloadJson(JSON.stringify(backup), v1BackupFileName());
      addToast(
        t('backup.exportAllDone', 'Diagrams exported: {{count}}.', {
          count: backup.documents.length,
        }),
        'success'
      );
    } catch {
      addToast(t('backup.exportAllFailed', 'Could not export your diagrams.'), 'error');
    } finally {
      running.current = false;
    }
  }, [addToast, t]);
}

export function NextVersionBanner(): React.ReactElement | null {
  const { t } = useTranslation();
  const exportAll = useExportAllDiagrams();
  const [dismissed, setDismissed] = useState(
    () => readLocalStorageString(NEXT_VERSION_BANNER_DISMISSED_KEY) === 'true'
  );
  const [superseded, setSuperseded] = useState(false);

  useEffect(() => {
    const onNewerApp = (): void => setSuperseded(true);
    window.addEventListener(NEWER_APP_OPENED_EVENT, onNewerApp);
    return () => window.removeEventListener(NEWER_APP_OPENED_EVENT, onNewerApp);
  }, []);

  if (superseded) {
    return (
      <div role="alert" data-testid="newer-app-banner" className={BANNER_CLASS}>
        <span className="flex-1">
          {t(
            'backup.superseded',
            'OpenFlowKit was updated in another tab. Reload to keep working — changes made here will not carry over.'
          )}
        </span>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="shrink-0 font-medium text-[var(--brand-primary)] hover:underline focus:outline-none focus-visible:underline"
        >
          {t('backup.reload', 'Reload')}
        </button>
      </div>
    );
  }

  if (dismissed) {
    return null;
  }

  function dismiss(): void {
    writeLocalStorageString(NEXT_VERSION_BANNER_DISMISSED_KEY, 'true');
    setDismissed(true);
  }

  return (
    <div
      role="status"
      data-testid="next-version-banner"
      className={BANNER_CLASS}
    >
      <span className="flex-1">
        {t(
          'backup.nextVersionBanner',
          'A new OpenFlowKit is coming. Your diagrams move over automatically.'
        )}
      </span>
      <button
        type="button"
        onClick={() => void exportAll()}
        className="flex shrink-0 items-center gap-1.5 font-medium text-[var(--brand-primary)] hover:underline focus:outline-none focus-visible:underline"
      >
        <Download className="h-3.5 w-3.5" />
        {t('backup.exportAll', 'Export all my diagrams')}
      </button>
      <button
        type="button"
        onClick={dismiss}
        aria-label={t('common.close', 'Close')}
        className="shrink-0 rounded-md p-1 text-[var(--brand-secondary)] hover:text-[var(--brand-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
