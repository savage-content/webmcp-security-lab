'use client';

import { Copy, Download, FileJson, Info } from 'lucide-react';
import { useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  copyJsonArtifact,
  requestJsonDownload,
  type JsonArtifact,
} from '@/lib/lab/artifacts';

export function ArtifactExportDialog({
  artifact,
  onClose,
}: {
  artifact?: JsonArtifact;
  onClose: () => void;
}) {
  const [status, setStatus] = useState('');

  function closeDialog() {
    setStatus('');
    onClose();
  }

  function handleDownload() {
    if (!artifact) return;

    try {
      requestJsonDownload(artifact);
      setStatus(
        `Download requested for ${artifact.filename}. If no file appeared, use Copy JSON.`,
      );
    } catch {
      setStatus(
        'The browser blocked the download. Use Copy JSON or select the JSON below.',
      );
    }
  }

  async function handleCopy() {
    if (!artifact) return;
    const result = await copyJsonArtifact(artifact);
    setStatus(
      result === 'copied'
        ? `Copied ${artifact.filename} to the clipboard.`
        : 'Clipboard access was blocked. Select the JSON below and copy it manually.',
    );
  }

  return (
    <Dialog
      open={Boolean(artifact)}
      onOpenChange={(open) => !open && closeDialog()}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <div className="flex size-9 items-center justify-center rounded-md bg-muted text-foreground">
            <FileJson className="size-4" aria-hidden="true" />
          </div>
          <DialogTitle>Export JSON artifact</DialogTitle>
          <DialogDescription>
            Download the file or copy the exact JSON. The preview remains
            available if an embedded browser suppresses downloads.
          </DialogDescription>
        </DialogHeader>

        {artifact ? (
          <>
            <p className="truncate font-mono text-[10px] text-muted-foreground">
              {artifact.filename}
            </p>
            <textarea
              aria-label="JSON artifact content"
              className="h-64 w-full resize-y rounded-md border border-border bg-foreground p-3 font-mono text-[10px] leading-5 text-background outline-none focus-visible:ring-2 focus-visible:ring-ring"
              readOnly
              spellCheck={false}
              value={artifact.text}
            />
            {status ? (
              <output
                aria-live="polite"
                className="flex items-start gap-2 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs leading-5 text-muted-foreground"
              >
                <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                {status}
              </output>
            ) : null}
          </>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={closeDialog}>
            Close
          </Button>
          <Button variant="outline" onClick={() => void handleCopy()}>
            <Copy data-icon="inline-start" />
            Copy JSON
          </Button>
          <Button onClick={handleDownload}>
            <Download data-icon="inline-start" />
            Download JSON
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
