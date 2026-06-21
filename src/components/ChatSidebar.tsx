'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useChat } from '@ai-sdk/react';
import {
  DefaultChatTransport,
  getToolName,
  isTextUIPart,
  isToolUIPart,
  type DynamicToolUIPart,
  type ToolUIPart,
  type UIMessage,
} from 'ai';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useDashboard } from '@/context/DashboardContext';
import {
  LineChartWidget,
  BarChartWidget,
  PieChartWidget,
  ScatterChartWidget,
} from './Charts';
import DataTable from './DataTable';
import { QueryResult } from '@/lib/chart-types';
import { syncBrowserDatasetToServer, hasBrowserDataset } from '@/lib/client/browser-dataset-storage';
import { Send, Sparkles, Loader2, ArrowRight } from 'lucide-react';

type ChatMessagePart = UIMessage['parts'][number];

interface ToolOutput {
  error?: string;
  visualization?: QueryResult;
  [key: string]: unknown;
}

type ToolInvocationPart = ToolUIPart | DynamicToolUIPart;

const LOADING_PHRASES = [
  'Checking your command...',
  'Connecting to NASA...',
  'Communicated with aliens...',
  'Consulting the data oracle...',
  'Crunching numbers at light speed...',
  'Decrypting your question...',
  'Syncing with the mothership...',
  'Brewing insights...',
  'Scanning the dataverse...',
  'Asking the spreadsheet nicely...',
];

function pickLoadingPhrase(): string {
  return LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];
}

function useLoadingPhrase(active: boolean): string {
  const [phrase, setPhrase] = useState(pickLoadingPhrase);

  useEffect(() => {
    if (!active) return;
    setPhrase(pickLoadingPhrase());
    const id = setInterval(() => setPhrase(pickLoadingPhrase()), 2500);
    return () => clearInterval(id);
  }, [active]);

  return phrase;
}

function visualizationKey(viz: QueryResult): string {
  return JSON.stringify(viz);
}

function messageHasCompletedSqlQuery(parts: ChatMessagePart[] | undefined): boolean {
  if (!parts) return false;
  return parts.some(
    (part) =>
      isToolUIPart(part) &&
      getToolName(part) === 'runSqlQuery' &&
      part.state === 'output-available'
  );
}

function getTextContent(message: { parts?: ChatMessagePart[]; content?: string }): string {
  if (message.parts && Array.isArray(message.parts)) {
    return message.parts
      .filter(isTextUIPart)
      .map((part) => part.text || '')
      .join('');
  }
  return typeof message.content === 'string' ? message.content : '';
}

function messageHasVisibleContent(message: {
  role?: string;
  parts?: ChatMessagePart[];
  content?: string;
}): boolean {
  const content = getTextContent(message);
  const parts = message.parts ?? [];
  const hasQueryVisualization = parts.some((part) => {
    if (!isToolUIPart(part)) return false;
    if (getToolName(part) !== 'runSqlQuery') return false;
    if (part.state !== 'output-available') return false;
    const output = part.output as ToolOutput | undefined;
    return Boolean(output?.visualization && !output.error);
  });
  const showTextContent =
    content && !(message.role === 'assistant' && hasQueryVisualization);
  if (showTextContent) return true;

  const hasCompletedSqlQuery = messageHasCompletedSqlQuery(parts);
  const seenVisualizations = new Set<string>();

  for (const part of parts) {
    if (isTextUIPart(part)) continue;
    if (!isToolUIPart(part)) continue;

    const toolName = getToolName(part);

    if (
      hasCompletedSqlQuery &&
      toolName === 'runSqlQuery' &&
      (part.state === 'input-streaming' || part.state === 'input-available')
    ) {
      continue;
    }

    if (toolName === 'runSqlQuery' && part.state === 'output-available') {
      const output = part.output as ToolOutput | undefined;
      const viz = output?.visualization;
      if (viz) {
        const key = visualizationKey(viz);
        if (seenVisualizations.has(key)) continue;
        seenVisualizations.add(key);
      }
    }

    if (part.state === 'input-streaming' || part.state === 'input-available') {
      return true;
    }
    if (part.state === 'output-error') return true;
    if (part.state !== 'output-available') continue;

    const result = part.output as ToolOutput | undefined;
    if (!result) continue;
    if (result.error) return true;
    if (toolName === 'runSqlQuery' && result.visualization) return true;
  }

  return false;
}

function ToolPartView({
  part,
  toolName,
  loadingPhrase,
}: {
  part: ToolInvocationPart;
  toolName: string;
  loadingPhrase: string;
}) {
  if (part.state === 'input-streaming' || part.state === 'input-available') {
    return (
      <div className="tool-status running">
        <Loader2 className="spinner" size={14} />
        <span>{loadingPhrase}</span>
      </div>
    );
  }

  if (part.state === 'output-error') {
    return (
      <div className="tool-status error">
        <span>Error running {toolName}: {part.errorText}</span>
      </div>
    );
  }

  if (part.state !== 'output-available') return null;

  const result = part.output as ToolOutput | undefined;
  if (!result) return null;

  if (result.error) {
    return (
      <div className="tool-status error">
        <span>Error running {toolName}: {result.error}</span>
      </div>
    );
  }

  if (toolName === 'runSqlQuery' && result.visualization) {
    return (
      <div className="inline-chart-container">
        <div className="inline-chart-header">
          <span>Query Result</span>
        </div>
        <QueryResultView result={result.visualization} />
      </div>
    );
  }

  if (toolName === 'describeDataset') {
    return null;
  }

  return null;
}

function QueryResultView({ result }: { result: QueryResult }) {
  if (result.kind === 'scalar') {
    return (
      <div className="scalar-result">
        <span className="scalar-label">{result.label}</span>
        <span className="scalar-value">{result.value}</span>
      </div>
    );
  }

  if (result.kind === 'table') {
    return (
      <DataTable
        columns={result.columns}
        rows={result.rows}
        title={result.title}
      />
    );
  }

  const chart = result.chart;
  if (chart.type === 'line') {
    return (
      <LineChartWidget
        data={chart.data}
        xAxisLabel={chart.xAxisLabel}
        yAxisLabel={chart.yAxisLabel}
        title={chart.title}
      />
    );
  }
  if (chart.type === 'bar') {
    return (
      <BarChartWidget
        data={chart.data}
        categoryLabel={chart.categoryLabel}
        valueLabel={chart.valueLabel}
        title={chart.title}
      />
    );
  }
  if (chart.type === 'pie') {
    return <PieChartWidget data={chart.data} title={chart.title} />;
  }
  return (
    <ScatterChartWidget
      data={chart.data}
      xAxisLabel={chart.xAxisLabel}
      yAxisLabel={chart.yAxisLabel}
      title={chart.title}
    />
  );
}

export default function ChatSidebar() {
  const { addDrillDownChart } = useDashboard();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const processedToolCallsRef = useRef<Set<string>>(new Set());

  const [input, setInput] = useState('');
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
  });

  const isLoading = status === 'submitted' || status === 'streaming';
  const lastMessage = messages[messages.length - 1];
  const awaitingAssistantContent =
    isLoading &&
    (!lastMessage ||
      lastMessage.role === 'user' ||
      (lastMessage.role === 'assistant' && !messageHasVisibleContent(lastMessage)));
  const loadingPhrase = useLoadingPhrase(awaitingAssistantContent);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    if (hasBrowserDataset()) {
      await syncBrowserDatasetToServer();
    }

    sendMessage({ text: input });
    setInput('');
  };

  const handleSuggestionClick = (suggestion: string) => {
    setInput(suggestion);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (!lastMessage || lastMessage.role !== 'assistant' || !lastMessage.parts) return;

    for (const part of lastMessage.parts) {
      if (!isToolUIPart(part)) continue;
      if (getToolName(part) !== 'runSqlQuery') continue;
      if (part.state !== 'output-available') continue;
      if (processedToolCallsRef.current.has(part.toolCallId)) continue;

      processedToolCallsRef.current.add(part.toolCallId);
      const output = part.output as ToolOutput | undefined;
      const viz = output?.visualization;
      if (viz && viz.kind === 'chart') {
        addDrillDownChart(viz.chart);
      }
    }
  }, [messages, addDrillDownChart]);

  const suggestions = [
    'What columns are in this dataset?',
    'What is the average revenue by region?',
    'Show me the top 10 rows',
  ];

  return (
    <div className="chat-sidebar">
      <div className="chat-header">
        <div className="chat-header-title">
          <Sparkles className="icon-sparkles" />
          <span>AI Analytics Assistant</span>
        </div>
        <p className="chat-header-subtitle">Ask analytical questions about your CSV data</p>
      </div>

      <div className="chat-messages-container">
        {messages.length === 0 ? (
          <div className="chat-empty-state">
            <div className="sparkle-pulse">
              <Sparkles size={32} />
            </div>
            <h4>Ask your dataset anything</h4>
            <p>The AI writes SQL queries against your data and renders charts or tables automatically.</p>

            <div className="suggestions-list">
              {suggestions.map((s, i) => (
                <button
                  key={i}
                  className="suggestion-chip"
                  onClick={() => handleSuggestionClick(s)}
                >
                  <span>{s}</span>
                  <ArrowRight size={14} />
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="chat-messages-list">
            {messages.map((message, messageIndex) => {
              const content = getTextContent(message);
              const parts = message.parts ?? [];
              const hasQueryVisualization = parts.some((part) => {
                if (!isToolUIPart(part)) return false;
                if (getToolName(part) !== 'runSqlQuery') return false;
                if (part.state !== 'output-available') return false;
                const output = part.output as ToolOutput | undefined;
                return Boolean(output?.visualization && !output.error);
              });
              const showTextContent = content && !(message.role === 'assistant' && hasQueryVisualization);
              const seenVisualizations = new Set<string>();
              const hasCompletedSqlQuery = messageHasCompletedSqlQuery(parts);
              const isLastMessage = messageIndex === messages.length - 1;
              const showInlineLoading =
                isLastMessage &&
                isLoading &&
                message.role === 'assistant' &&
                !messageHasVisibleContent(message);

              return (
                <div key={message.id} className={`chat-message-bubble ${message.role}`}>
                  <div className="message-sender">
                    {message.role === 'user' ? 'You' : 'Assistant'}
                  </div>
                  <div className="message-body">
                    {showTextContent && (
                      <div className="markdown-content">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {content}
                        </ReactMarkdown>
                      </div>
                    )}

                    {parts.length > 0 && (
                      <div className="tool-invocations-list">
                        {parts.map((part, index) => {
                          if (isTextUIPart(part)) return null;
                          if (!isToolUIPart(part)) return null;

                          const toolName = getToolName(part);

                          if (
                            hasCompletedSqlQuery &&
                            toolName === 'runSqlQuery' &&
                            (part.state === 'input-streaming' || part.state === 'input-available')
                          ) {
                            return null;
                          }

                          if (
                            toolName === 'runSqlQuery' &&
                            part.state === 'output-available'
                          ) {
                            const output = part.output as ToolOutput | undefined;
                            const viz = output?.visualization;
                            if (viz) {
                              const key = visualizationKey(viz);
                              if (seenVisualizations.has(key)) return null;
                              seenVisualizations.add(key);
                            }
                          }

                          return (
                            <ToolPartView
                              key={part.toolCallId || `${toolName}-${index}`}
                              part={part}
                              toolName={toolName}
                              loadingPhrase={loadingPhrase}
                            />
                          );
                        })}
                      </div>
                    )}

                    {showInlineLoading && (
                      <div className="flex items-center gap-2 py-2 text-slate-400">
                        <Loader2 className="spinner" size={16} />
                        <span>{loadingPhrase}</span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {awaitingAssistantContent && lastMessage?.role === 'user' && (
              <div className="chat-message-bubble assistant">
                <div className="message-sender">Assistant</div>
                <div className="message-body flex items-center gap-2 py-2 text-slate-400">
                  <Loader2 className="spinner" size={16} />
                  <span>{loadingPhrase}</span>
                </div>
              </div>
            )}
            {error && (
              <div className="chat-error-banner">
                <p><strong>Error:</strong> {error.message || 'Failed to send message.'}</p>
                <p className="text-xs mt-1">Please ensure your NVIDIA API Key is configured in settings or your .env file.</p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="chat-input-form">
        <div className="chat-input-wrapper">
          <input
            type="text"
            value={input}
            onChange={handleInputChange}
            placeholder="Ask a question about your data..."
            className="chat-input-field"
            disabled={isLoading}
          />
          <button
            type="submit"
            className="chat-send-btn"
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? <Loader2 className="spinner" size={18} /> : <Send size={18} />}
          </button>
        </div>
      </form>
    </div>
  );
}
