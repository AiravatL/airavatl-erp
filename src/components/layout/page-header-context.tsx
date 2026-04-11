"use client";

import { createContext, useContext, useEffect, useState } from "react";

export interface PageHeaderInfo {
  title: string;
  description?: string;
}

interface PageHeaderContextValue {
  info: PageHeaderInfo | null;
  setInfo: (info: PageHeaderInfo | null) => void;
}

const PageHeaderContext = createContext<PageHeaderContextValue>({
  info: null,
  setInfo: () => {},
});

export function PageHeaderProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<PageHeaderInfo | null>(null);
  return (
    <PageHeaderContext.Provider value={{ info, setInfo }}>
      {children}
    </PageHeaderContext.Provider>
  );
}

export function usePageHeaderInfo() {
  return useContext(PageHeaderContext).info;
}

export function useRegisterPageHeader(title: string, description?: string) {
  const { setInfo } = useContext(PageHeaderContext);
  useEffect(() => {
    setInfo({ title, description });
    return () => setInfo(null);
  }, [title, description, setInfo]);
}
