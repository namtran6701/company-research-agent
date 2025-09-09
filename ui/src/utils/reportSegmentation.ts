export type ReportBlock = { id: string; text: string };

// Split markdown into blocks and assign IDs b1..bN
export function segmentReport(markdown: string): ReportBlock[] {
  if (!markdown) return [];
  const lines = markdown.split(/\r?\n/);
  const blocks: string[] = [];
  let current: string[] = [];

  const flush = () => {
    if (current.length) {
      // trim blank lines within block
      while (current.length && !current[0].trim()) current.shift();
      while (current.length && !current[current.length - 1].trim()) current.pop();
      if (current.length) blocks.push(current.join("\n"));
    }
  };

  for (const ln of lines) {
    if (!ln.trim()) {
      flush();
      current = [];
      continue;
    }
    if (ln.trim().startsWith("#") && current.length) {
      flush();
      current = [ln];
      continue;
    }
    current.push(ln);
  }
  flush();

  return blocks.map((text, i) => ({ id: `b${i + 1}`, text }));
}

