'use client';

import React, { createContext, useContext, useState } from 'react';
import { ChartData } from '@/lib/chart-types';

interface DashboardContextType {
  drillDownCharts: ChartData[];
  addDrillDownChart: (chart: ChartData) => void;
  clearDrillDownCharts: () => void;
  setDrillDownCharts: (charts: ChartData[]) => void;
}

const DashboardContext = createContext<DashboardContextType | undefined>(undefined);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const [drillDownCharts, setDrillDownChartsState] = useState<ChartData[]>([]);

  const addDrillDownChart = (chart: ChartData) => {
    setDrillDownChartsState(prev => {
      // Avoid adding duplicate charts if they have the exact same title/data
      const exists = prev.some(c => c.title === chart.title);
      if (exists) return prev;
      return [...prev, chart];
    });
  };

  const clearDrillDownCharts = () => {
    setDrillDownChartsState([]);
  };

  const setDrillDownCharts = (charts: ChartData[]) => {
    setDrillDownChartsState(charts);
  };

  return (
    <DashboardContext.Provider
      value={{ drillDownCharts, addDrillDownChart, clearDrillDownCharts, setDrillDownCharts }}
    >
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const context = useContext(DashboardContext);
  if (!context) {
    throw new Error('useDashboard must be used within a DashboardProvider');
  }
  return context;
}
