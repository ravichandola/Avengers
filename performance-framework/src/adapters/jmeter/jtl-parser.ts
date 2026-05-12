export interface JtlSample {
  timeStamp: number;
  elapsedMs: number;
  label: string;
  responseCode: string;
  success: boolean;
  threadName: string;
}

/** Default CSV JTL (JMeter 5+) */
export function parseJtlCsv(contents: string): JtlSample[] {
  const lines = contents.trim().split(/\r?\n/).filter(Boolean);
  if (lines.length === 0) return [];
  const header = lines[0].split(',').map((h) => h.trim());
  const idx = (name: string) => header.indexOf(name);

  const tsI = idx('timeStamp');
  const elI = idx('elapsed');
  const lbI = idx('label');
  const rcI = idx('responseCode');
  const scI = idx('success');
  const tnI = idx('threadName');

  const out: JtlSample[] = [];
  for (let r = 1; r < lines.length; r += 1) {
    const cols = parseCsvLine(lines[r]);
    const success = String(cols[scI] ?? '').toLowerCase() === 'true';
    out.push({
      timeStamp: Number(cols[tsI] ?? 0),
      elapsedMs: Number(cols[elI] ?? 0),
      label: String(cols[lbI] ?? ''),
      responseCode: String(cols[rcI] ?? ''),
      success,
      threadName: String(cols[tnI] ?? ''),
    });
  }
  return out;
}

/** Minimal CSV line parser supporting quoted fields */
function parseCsvLine(line: string): string[] {
  const res: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i += 1) {
    const c = line[i];
    if (c === '"') {
      inQ = !inQ;
    } else if (c === ',' && !inQ) {
      res.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  res.push(cur);
  return res;
}
