/** 754000 -> "12:34" */
export function clock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

/** Whole minutes, e.g. 754000 -> "12'" */
export function mins(ms: number): string {
  return `${Math.floor(ms / 60000)}'`;
}

export function today(): string {
  const d = new Date();
  const pad = (n: number) => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function prettyDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

export function download(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
