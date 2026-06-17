'use client';

import React, { useState } from 'react';

interface DataTableProps {
  columns: string[];
  rows: Record<string, unknown>[];
  title?: string;
  pageSize?: number;
}

const DISPLAY_LOCALE = 'en-US';

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? value.toLocaleString(DISPLAY_LOCALE)
      : value.toLocaleString(DISPLAY_LOCALE, { maximumFractionDigits: 2 });
  }
  if (typeof value === 'boolean') return value ? 'true' : 'false';
  const str = String(value);
  if (str.endsWith('Z') && !isNaN(Date.parse(str))) {
    return new Date(str).toLocaleString(DISPLAY_LOCALE, {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    });
  }
  return str;
}

export default function DataTable({ columns, rows, title, pageSize = 50 }: DataTableProps) {
  const [page, setPage] = useState(0);
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);

  return (
    <div className="data-table-container">
      {title && <h4 className="data-table-title">{title}</h4>}
      <div className="data-table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={col}>{col}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="data-table-empty">
                  No rows returned
                </td>
              </tr>
            ) : (
              pageRows.map((row, i) => (
                <tr key={i}>
                  {columns.map((col) => (
                    <td key={col}>{formatCell(row[col])}</td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      {rows.length > pageSize && (
        <div className="data-table-pagination">
          <button
            type="button"
            className="btn btn-sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            Previous
          </button>
          <span>
            Page {page + 1} of {totalPages} ({rows.length} rows)
          </span>
          <button
            type="button"
            className="btn btn-sm"
            disabled={page >= totalPages - 1}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
