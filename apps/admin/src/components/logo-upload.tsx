'use client';

import { checkUpload, UploadError, uploadMedia } from '@predict/api-client';
import type { MediaKind } from '@predict/contracts';
import { Button } from '@predict/ui/button';
import { ProgressBar } from '@predict/ui/progress';
import { ImageUp, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { TeamLogo } from '@/components/team-logo';
import { apiClient } from '@/lib/api';
import { errorMessage } from '@/lib/errors';

export interface UploadedLogo {
  mediaId: string;
  url: string | null;
}

/**
 * Picks an image, uploads it straight to storage with progress, and hands back the media id.
 * `value` is the new upload the form will save; `currentUrl` is the logo already on the record.
 */
export function LogoUpload({
  kind,
  name,
  currentUrl,
  value,
  onChange,
  onRemove,
  removed = false,
  disabled = false,
  onBusyChange,
}: {
  kind: MediaKind;
  /** Used for the initials placeholder. */
  name: string;
  currentUrl?: string | null;
  value: UploadedLogo | null;
  onChange: (logo: UploadedLogo | null) => void;
  /** Offer "Remove" for a saved logo. */
  onRemove?: () => void;
  removed?: boolean;
  disabled?: boolean;
  onBusyChange?: (busy: boolean) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shownUrl = value?.url ?? (removed ? null : (currentUrl ?? null));
  const uploading = progress !== null;

  async function upload(file: File) {
    setError(null);
    const problem = checkUpload(kind, file);
    if (problem) {
      setError(problem);
      return;
    }
    setProgress(0);
    onBusyChange?.(true);
    try {
      const media = await uploadMedia(apiClient, kind, file, { onProgress: setProgress });
      onChange({ mediaId: media.id, url: media.url });
    } catch (caught) {
      setError(caught instanceof UploadError ? caught.message : errorMessage(caught));
    } finally {
      setProgress(null);
      onBusyChange?.(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-4">
        <TeamLogo name={name || '?'} logoUrl={shownUrl} size="lg" />
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={disabled || uploading}
            onClick={() => inputRef.current?.click()}
          >
            <ImageUp aria-hidden />
            {uploading ? 'Uploading…' : shownUrl ? 'Replace logo' : 'Upload logo'}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) void upload(file);
            }}
          />
          {value ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={uploading}
              onClick={() => onChange(null)}
            >
              Undo
            </Button>
          ) : shownUrl && onRemove ? (
            <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onRemove}>
              <Trash2 aria-hidden />
              Remove
            </Button>
          ) : null}
        </div>
      </div>
      {uploading ? <ProgressBar value={(progress ?? 0) * 100} label="Uploading logo" /> : null}
      <p className="text-xs text-muted-foreground">
        PNG, JPG or WebP, up to 5 MB. Square images look best.
      </p>
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
