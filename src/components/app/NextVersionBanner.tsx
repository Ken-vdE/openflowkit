import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Download, RefreshCw, Sparkles, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/ToastContext';
import { useFlowStore } from '@/store';
import { NEWER_APP_OPENED_EVENT } from '@/services/storage/indexedDbSchema';
import { readLocalStorageString, writeLocalStorageString } from '@/services/storage/uiLocalStorage';
import { buildV1Backup, v1BackupFileName } from '@/services/storage/v1Backup';

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

interface NoticeCardProps {
  testId: string;
  role: 'status' | 'alert';
  icon: React.ReactNode;
  title: string;
  body: string;
  children: React.ReactNode;
  onClose?: () => void;
  closeLabel?: string;
}

// Centred just above the editor's toolbar: the zoom controls sit bottom-left and the
// properties panel opens on the right.
function NoticeCard({
  testId,
  role,
  icon,
  title,
  body,
  children,
  onClose,
  closeLabel,
}: NoticeCardProps): React.ReactElement {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-24 z-[60] flex justify-center px-4">
      <div
        role={role}
        data-testid={testId}
        className="pointer-events-auto w-full max-w-[400px] rounded-2xl border border-[var(--color-brand-border)] bg-[var(--brand-surface)] p-4 text-[var(--brand-text)] shadow-[0_12px_40px_rgba(0,0,0,0.12)] animate-in fade-in slide-in-from-bottom-2 duration-300"
      >
        <div className="flex gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--brand-primary)]/10 text-[var(--brand-primary)]">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold leading-5 tracking-tight">{title}</p>
            <p className="mt-1 text-[12.5px] leading-[18px] text-[var(--brand-secondary)]">
              {body}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">{children}</div>
          </div>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel}
              className="-mr-1 -mt-1 h-7 w-7 shrink-0 rounded-lg text-[var(--brand-secondary)] transition-colors hover:bg-[var(--brand-background)] hover:text-[var(--brand-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]"
            >
              <X className="mx-auto h-4 w-4" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function NextVersionBanner(): React.ReactElement | null {
  const { t } = useTranslation();
  const exportAll = useExportAllDiagrams();
  const [dismissed, setDismissed] = useState(
    () => readLocalStorageString(NEXT_VERSION_BANNER_DISMISSED_KEY) === 'true'
  );
  const [superseded, setSuperseded] = useState(false);
  // Nothing to move over → nothing to say; keeps the empty Home's create buttons clear.
  const hasDiagrams = useFlowStore((state) => state.documents.length > 0);

  useEffect(() => {
    const onNewerApp = (): void => setSuperseded(true);
    window.addEventListener(NEWER_APP_OPENED_EVENT, onNewerApp);
    return () => window.removeEventListener(NEWER_APP_OPENED_EVENT, onNewerApp);
  }, []);

  if (superseded) {
    return (
      <NoticeCard
        testId="newer-app-banner"
        role="alert"
        icon={<RefreshCw className="h-[18px] w-[18px]" />}
        title={t('backup.supersededTitle', 'OpenFlowKit has been updated')}
        body={t(
          'backup.supersededBody',
          'This tab is out of date. Reload to keep working — changes made here won’t carry over.'
        )}
      >
        <Button size="sm" onClick={() => window.location.reload()}>
          {t('backup.reload', 'Reload')}
        </Button>
      </NoticeCard>
    );
  }

  if (dismissed || !hasDiagrams) {
    return null;
  }

  function dismiss(): void {
    writeLocalStorageString(NEXT_VERSION_BANNER_DISMISSED_KEY, 'true');
    setDismissed(true);
  }

  return (
    <NoticeCard
      testId="next-version-banner"
      role="status"
      icon={<Sparkles className="h-[18px] w-[18px]" />}
      title={t('backup.nextVersionTitle', 'A new OpenFlowKit is on the way')}
      body={t(
        'backup.nextVersionBody',
        'Your diagrams will move over automatically — nothing to do. Want a copy anyway?'
      )}
      onClose={dismiss}
      closeLabel={t('common.close', 'Close')}
    >
      <Button size="sm" variant="secondary" onClick={() => void exportAll()}>
        <Download className="h-3.5 w-3.5" />
        {t('backup.downloadBackup', 'Download a backup')}
      </Button>
      <Button size="sm" variant="ghost" onClick={dismiss}>
        {t('backup.gotIt', 'Got it')}
      </Button>
    </NoticeCard>
  );
}
