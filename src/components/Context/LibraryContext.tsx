import React, { createContext, useContext, useMemo } from 'react';
import {
  useLibrary,
  UseLibraryReturnType,
} from '@screens/library/hooks/useLibrary';
import { useLibrarySettings } from '@hooks/persisted';
import { LibrarySettings } from '@hooks/persisted/useSettings';
import { useSearch } from '@hooks';

// type Library = Category & { novels: LibraryNovelInfo[] };

type LibraryContextType = UseLibraryReturnType & {
  settings: LibrarySettings;
  searchText: string;
  setSearchText: (text: string) => void;
};

const defaultValue = {} as LibraryContextType;
const LibraryContext = createContext<LibraryContextType>(defaultValue);

export function LibraryContextProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const { searchText, setSearchText } = useSearch();
  const useLibraryParams = useLibrary(searchText);
  const settings = useLibrarySettings();

  const contextValue = useMemo(
    () => ({
      ...useLibraryParams,
      settings,
      searchText,
      setSearchText,
    }),
    [useLibraryParams, settings, searchText, setSearchText],
  );

  return (
    <LibraryContext.Provider value={contextValue}>
      {children}
    </LibraryContext.Provider>
  );
}

export const useLibraryContext = (): LibraryContextType => {
  return useContext(LibraryContext);
};
