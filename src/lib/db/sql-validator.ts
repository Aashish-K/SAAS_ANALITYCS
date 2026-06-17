const BLOCKED_KEYWORDS = [
  'INSERT',
  'UPDATE',
  'DELETE',
  'DROP',
  'ALTER',
  'CREATE',
  'ATTACH',
  'DETACH',
  'TRUNCATE',
  'GRANT',
  'REVOKE',
  'PRAGMA',
  'VACUUM',
  'REINDEX',
];

const MUTATING_PATTERNS = [
  /\bREPLACE\s+INTO\b/i,
  /\bINSERT\s+OR\s+REPLACE\b/i,
];

const DEFAULT_LIMIT = 1000;

export interface ValidationResult {
  valid: boolean;
  sql: string;
  error?: string;
}

export function validateAndSanitizeSql(sql: string, maxLimit = DEFAULT_LIMIT): ValidationResult {
  const trimmed = sql.trim();
  if (!trimmed) {
    return { valid: false, sql: trimmed, error: 'SQL query is empty.' };
  }

  // Block multiple statements
  const withoutTrailingSemicolon = trimmed.replace(/;\s*$/, '');
  if (withoutTrailingSemicolon.includes(';')) {
    return { valid: false, sql: trimmed, error: 'Multiple SQL statements are not allowed.' };
  }

  const normalized = withoutTrailingSemicolon.replace(/\s+/g, ' ').trim();
  const upper = normalized.toUpperCase();

  if (!upper.startsWith('SELECT') && !upper.startsWith('WITH')) {
    return { valid: false, sql: trimmed, error: 'Only SELECT and WITH (CTE) queries are allowed.' };
  }

  for (const keyword of BLOCKED_KEYWORDS) {
    const pattern = new RegExp(`\\b${keyword}\\b`, 'i');
    if (pattern.test(normalized)) {
      return { valid: false, sql: trimmed, error: `Forbidden SQL keyword: ${keyword}` };
    }
  }

  for (const pattern of MUTATING_PATTERNS) {
    if (pattern.test(normalized)) {
      return { valid: false, sql: trimmed, error: 'Only read-only SELECT queries are allowed.' };
    }
  }

  // Enforce LIMIT if not present
  let finalSql = withoutTrailingSemicolon;
  if (!/\bLIMIT\b/i.test(finalSql)) {
    finalSql = `${finalSql} LIMIT ${maxLimit}`;
  } else {
    const limitMatch = finalSql.match(/\bLIMIT\s+(\d+)/i);
    if (limitMatch) {
      const limitVal = parseInt(limitMatch[1], 10);
      if (limitVal > maxLimit) {
        finalSql = finalSql.replace(/\bLIMIT\s+\d+/i, `LIMIT ${maxLimit}`);
      }
    }
  }

  return { valid: true, sql: finalSql };
}
