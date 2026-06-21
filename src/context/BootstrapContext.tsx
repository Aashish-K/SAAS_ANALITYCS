'use client';

import React, { createContext, useContext, useState } from 'react';

interface BootstrapContextType {
  isRestoringDataset: boolean;
  setIsRestoringDataset: (value: boolean) => void;
}

const BootstrapContext = createContext<BootstrapContextType | undefined>(undefined);

export function BootstrapProvider({ children }: { children: React.ReactNode }) {
  const [isRestoringDataset, setIsRestoringDataset] = useState(false);

  return (
    <BootstrapContext.Provider value={{ isRestoringDataset, setIsRestoringDataset }}>
      {children}
    </BootstrapContext.Provider>
  );
}

export function useBootstrap() {
  const context = useContext(BootstrapContext);
  if (!context) {
    throw new Error('useBootstrap must be used within a BootstrapProvider');
  }
  return context;
}
