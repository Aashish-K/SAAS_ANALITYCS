'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { updateAiSettingsAction, clearDatasetAction } from '@/app/actions';
import { clearBrowserDataset } from '@/lib/client/browser-dataset-storage';
import {
  loadBrowserAiConfig,
  saveBrowserAiConfig,
} from '@/lib/client/browser-ai-config-storage';
import { Settings, Trash2, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';

interface SettingsFormProps {
  currentModelId: string;
  currentTemperature: number;
  hasDataset: boolean;
}

export default function SettingsForm({
  currentModelId,
  currentTemperature,
  hasDataset,
}: SettingsFormProps) {
  const router = useRouter();
  const [modelId, setModelId] = useState(currentModelId);
  const [temperature, setTemperature] = useState(currentTemperature);
  const [isPending, startTransition] = useTransition();
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isClearing, startClearTransition] = useTransition();

  useEffect(() => {
    const saved = loadBrowserAiConfig();
    if (saved) {
      setModelId(saved.modelId);
      setTemperature(saved.temperature);
    }
  }, []);

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    startTransition(async () => {
      const res = await updateAiSettingsAction(modelId, Number(temperature));
      if (res.success) {
        saveBrowserAiConfig({ modelId, temperature: Number(temperature) });
        setSuccess('AI Settings updated successfully!');
      } else {
        setError('Failed to update AI Settings.');
      }
    });
  };

  const handleClearDataset = () => {
    if (!confirm('Are you sure you want to clear the uploaded dataset? All charts will be reset.')) {
      return;
    }
    setError(null);
    setSuccess(null);

    startClearTransition(async () => {
      const res = await clearDatasetAction();
      if (res.success) {
        await clearBrowserDataset();
        setSuccess('Dataset cleared successfully!');
        router.refresh();
      } else {
        setError('Failed to clear dataset.');
      }
    });
  };

  return (
    <div className="settings-grid">
      <div className="settings-card">
        <h3 className="settings-section-title">
          <Settings style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} size={20} />
          <span>AI Model Configuration</span>
        </h3>

        <form onSubmit={handleSaveSettings}>
          <div className="form-group">
            <label className="form-label" htmlFor="modelId">NVIDIA NIM Model ID</label>
            <input
              id="modelId"
              type="text"
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="form-input"
              required
              disabled={isPending}
            />
            <p className="form-help">
              Specify a model hosted on NVIDIA NIM (e.g. <code>meta/llama-3.1-70b-instruct</code>, <code>nvidia/llama-3.1-nemotron-70b-instruct</code>)
            </p>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="temperature">
              Temperature: <span>{temperature}</span>
            </label>
            <input
              id="temperature"
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={temperature}
              onChange={(e) => setTemperature(Number(e.target.value))}
              style={{ width: '100%', accentColor: 'var(--primary)', cursor: 'pointer' }}
              disabled={isPending}
            />
            <p className="form-help">Higher values increase creativity, lower values increase deterministic grounding.</p>
          </div>

          <div style={{ marginTop: '2rem' }}>
            <button type="submit" className="btn" disabled={isPending}>
              {isPending ? <Loader2 className="spinner" size={16} /> : null}
              <span>Save AI Settings</span>
            </button>
          </div>
        </form>
      </div>

      <div className="settings-card">
        <h3 className="settings-section-title" style={{ borderColor: 'rgba(244, 63, 94, 0.2)' }}>
          <Trash2 style={{ verticalAlign: 'middle', marginRight: '0.5rem', color: 'var(--error)' }} size={20} />
          <span>Danger Zone</span>
        </h3>

        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '1.5rem' }}>
          Clearing the dataset will remove the in-memory parsed rows, schema definitions, and reset the dashboard back to its empty state.
        </p>

        <button
          onClick={handleClearDataset}
          className="btn btn-danger"
          disabled={!hasDataset || isClearing}
          style={{ width: '100%', maxWidth: '200px' }}
        >
          {isClearing ? <Loader2 className="spinner" size={16} /> : <Trash2 size={16} />}
          <span>Clear Dataset</span>
        </button>

        {success && (
          <div style={{ color: 'var(--success)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
            <CheckCircle2 size={16} />
            <span>{success}</span>
          </div>
        )}

        {error && (
          <div style={{ color: 'var(--error)', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '1.5rem' }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}
      </div>
    </div>
  );
}
