import React from 'react';
import { hydrateDatasetFromStorage, getAiConfig } from '@/lib/data-store';
import SettingsForm from '@/components/SettingsForm';
import { runWithSession } from '@/lib/session';
import { Database, FileText } from 'lucide-react';

export const dynamic = 'force-dynamic';

export default async function SettingsPage() {
  return runWithSession(async () => {
    const dataset = await hydrateDatasetFromStorage();
    const aiConfig = getAiConfig();

    return (
      <main className="content-area" style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div className="page-title-section">
          <h1 className="page-title">Application Settings</h1>
          <p className="page-subtitle">Inspect the parsed schema metadata and customize the AI assistant configuration</p>
        </div>

        <div className="settings-card" style={{ marginBottom: '2rem' }}>
          <h3 className="settings-section-title">
            <Database style={{ verticalAlign: 'middle', marginRight: '0.5rem' }} size={20} />
            <span>Active Dataset Information</span>
          </h3>

          {dataset ? (
            <div>
              <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
                <div>
                  <span className="form-label">Total Rows</span>
                  <span style={{ fontSize: '1.25rem', fontWeight: 700 }}>{dataset.schema.rowCount} rows</span>
                </div>
                <div>
                  <span className="form-label">Uploaded At</span>
                  <span style={{ fontSize: '1rem', fontWeight: 600 }}>
                    {new Date(dataset.schema.uploadedAt).toLocaleString()}
                  </span>
                </div>
              </div>

              <span className="form-label">Detected Column Schemas</span>
              <table className="schema-table">
                <thead>
                  <tr>
                    <th>Column Name</th>
                    <th>Inferred Data Type</th>
                    <th>Type Status</th>
                  </tr>
                </thead>
                <tbody>
                  {dataset.schema.columns.map((col) => (
                    <tr key={col.name}>
                      <td style={{ fontWeight: 600 }}>{col.name}</td>
                      <td>
                        <code
                          style={{
                            background: 'rgba(255,255,255,0.05)',
                            padding: '0.2rem 0.4rem',
                            borderRadius: '4px',
                          }}
                        >
                          {col.type}
                        </code>
                      </td>
                      <td>
                        <span
                          className={`badge ${
                            col.type === 'number' || col.type === 'date' ? 'badge-success' : 'badge-info'
                          }`}
                        >
                          {col.type === 'number' ? 'Metric' : col.type === 'date' ? 'Temporal' : 'Categorical'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
              <FileText size={32} style={{ marginBottom: '0.5rem', opacity: 0.5 }} />
              <p>No CSV file uploaded yet. Upload a dataset in the Dashboard to see its schema details.</p>
            </div>
          )}
        </div>

        <SettingsForm
          currentModelId={aiConfig.modelId}
          currentTemperature={aiConfig.temperature}
          hasDataset={!!dataset}
        />
      </main>
    );
  });
}
