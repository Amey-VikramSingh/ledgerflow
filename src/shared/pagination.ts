/**
 * Cursor pagination over (created_at, id). Cursor pagination is stable under
 * concurrent inserts and O(1) at any depth, unlike OFFSET which scans and
 * skips/duplicates rows when new ones arrive.
 */
export interface Cursor {
  ts: string;
  id: string;
}

export function encodeCursor(row: { created_at: string | Date; id: string }): string {
  const ts = row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at;
  return Buffer.from(JSON.stringify({ ts, id: row.id })).toString('base64url');
}

export function decodeCursor(cursor: string): Cursor | undefined {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (typeof parsed.ts === 'string' && typeof parsed.id === 'string') return parsed;
  } catch {
    /* invalid cursor → treat as no cursor */
  }
  return undefined;
}

/**
 * Given `limit + 1` fetched rows, split into the page and the next cursor.
 */
export function paginate<T extends { created_at: string | Date; id: string }>(
  rows: T[],
  limit: number,
): { data: T[]; next_cursor: string | null } {
  if (rows.length > limit) {
    const page = rows.slice(0, limit);
    return { data: page, next_cursor: encodeCursor(page[page.length - 1]!) };
  }
  return { data: rows, next_cursor: null };
}
