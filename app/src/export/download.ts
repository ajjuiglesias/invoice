/** Hand a generated file to the browser as a download. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Fetch the company template that ships with the app. */
export async function loadTemplate(): Promise<ArrayBuffer> {
  const response = await fetch(new URL('template.xlsx', document.baseURI).toString(), {
    cache: 'no-cache',
  });
  if (!response.ok) {
    throw new Error(
      `Could not load the company template (HTTP ${response.status}). Reload the page and try again.`,
    );
  }
  return response.arrayBuffer();
}
