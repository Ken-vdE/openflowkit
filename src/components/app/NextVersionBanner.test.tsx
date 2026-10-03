import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '@/i18n/config';
import { ToastProvider } from '@/components/ui/ToastContext';
import { NEWER_APP_OPENED_EVENT } from '@/services/storage/indexedDbSchema';
import { buildV1Backup } from '@/services/storage/v1Backup';
import { NextVersionBanner } from './NextVersionBanner';

vi.mock('@/services/storage/v1Backup', () => ({
  buildV1Backup: vi.fn(async () => ({
    format: 'openflowkit-v1-backup',
    version: 1,
    exportedAt: '2026-10-03T12:00:00.000Z',
    documents: [{ id: 'a' }, { id: 'b' }],
  })),
  v1BackupFileName: () => 'openflowkit-backup-2026-10-03.json',
}));

function renderBanner(): void {
  render(
    <ToastProvider>
      <NextVersionBanner />
    </ToastProvider>
  );
}

describe('NextVersionBanner', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('stays dismissed across reloads', () => {
    renderBanner();
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByTestId('next-version-banner')).toBeNull();

    renderBanner();
    expect(screen.queryByTestId('next-version-banner')).toBeNull();
  });

  it('downloads every diagram as one backup file', async () => {
    const downloads: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      downloads.push(this.download);
    });
    URL.createObjectURL = vi.fn(() => 'blob:backup');
    URL.revokeObjectURL = vi.fn();
    renderBanner();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export all my diagrams' }));
    });

    expect(downloads).toEqual(['openflowkit-backup-2026-10-03.json']);
    expect(await screen.findByText('Diagrams exported: 2.')).toBeTruthy();
  });

  it('says so instead of saving an empty file', async () => {
    vi.mocked(buildV1Backup).mockResolvedValueOnce({
      format: 'openflowkit-v1-backup',
      version: 1,
      exportedAt: '2026-10-03T12:00:00.000Z',
      documents: [],
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockClear();
    renderBanner();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Export all my diagrams' }));
    });

    expect(await screen.findByText('There are no diagrams to export yet.')).toBeTruthy();
    expect(click).not.toHaveBeenCalled();
  });

  it('tells a stale tab to reload once a newer app takes the database', () => {
    localStorage.setItem('openflowkit-next-version-banner-dismissed', 'true');
    renderBanner();

    act(() => {
      window.dispatchEvent(new Event(NEWER_APP_OPENED_EVENT));
    });

    expect(screen.getByRole('alert').textContent).toContain('Reload to keep working');
    expect(screen.getByRole('button', { name: 'Reload' })).toBeTruthy();
  });
});
