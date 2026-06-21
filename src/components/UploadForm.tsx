'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { uploadCsvAction } from '@/app/actions';
import { saveBrowserDataset } from '@/lib/client/browser-dataset-storage';
import { Upload, FileSpreadsheet, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function UploadForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setError(null);
      setSuccess(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a CSV file first.');
      return;
    }

    setError(null);
    setSuccess(null);

    const formData = new FormData();
    formData.append('file', file);

    startTransition(async () => {
      const res = await uploadCsvAction(formData);
      if (res.success) {
        if (res.dataset?.sqliteBase64) {
          await saveBrowserDataset(res.dataset);
        }
        setSuccess(`Successfully uploaded ${res.rowCount} rows!`);
        setFile(null);
        router.refresh();
      } else {
        setError(res.error || 'Failed to upload CSV.');
      }
    });
  };

  return (
    <div className="upload-card">
      <form onSubmit={handleSubmit}>
        <div className="upload-icon">
          <FileSpreadsheet size={48} />
        </div>
        <h3 className="upload-title">Upload Business Data</h3>
        <p className="upload-subtitle">
          Select a CSV file. We will detect column types, generate AI-powered KPIs, and prepare visualizations.
        </p>

        <div style={{ marginBottom: '1.5rem' }}>
          <label
            className="btn btn-secondary"
            style={{ display: 'inline-flex', cursor: 'pointer', margin: '0 auto' }}
          >
            <Upload size={16} />
            <span>{file ? file.name : 'Choose CSV File'}</span>
            <input
              type="file"
              accept=".csv"
              onChange={handleFileChange}
              style={{ display: 'none' }}
              disabled={isPending}
            />
          </label>
        </div>

        {file && (
          <div style={{ marginBottom: '1.5rem' }}>
            <button type="submit" className="btn" disabled={isPending} style={{ width: '100%', maxWidth: '250px' }}>
              {isPending ? (
                <>
                  <Loader2 className="spinner" size={16} />
                  <span>Analyzing data &amp; generating KPIs...</span>
                </>
              ) : (
                <span>Upload and Process</span>
              )}
            </button>
          </div>
        )}

        {error && (
          <div
            style={{
              color: 'var(--error)',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              marginTop: '1rem',
            }}
          >
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div
            style={{
              color: 'var(--success)',
              fontSize: '0.875rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
              marginTop: '1rem',
            }}
          >
            <CheckCircle2 size={16} />
            <span>{success}</span>
          </div>
        )}
      </form>
    </div>
  );
}
