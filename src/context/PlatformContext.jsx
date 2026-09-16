import React, { createContext, useContext, useState, useEffect } from 'react';
import { getStoredPlatformScope, setStoredPlatformScope } from '../utils/cookies';

const PlatformContext = createContext({
  platformScope: 'web', // 'app' | 'web'
  hasInitialChoice: false,
  isPlatformModalOpen: false,
  selectPlatform: () => {},
  openPlatformModal: () => {},
  closePlatformModal: () => {},
  togglePlatform: () => {},
});

export function PlatformProvider({ children }) {
  const initialSaved = getStoredPlatformScope();
  
  // Nếu đã có cookie/localStorage, dùng giá trị đó, ngược lại mặc định 'web' hoặc 'app'
  const [platformScope, setPlatformScope] = useState(initialSaved || 'web');
  const [hasInitialChoice, setHasInitialChoice] = useState(Boolean(initialSaved));
  
  // Nếu chưa từng chọn (chưa có cookie), mở dialog ngay khi mới vào
  const [isPlatformModalOpen, setIsPlatformModalOpen] = useState(!initialSaved);

  const selectPlatform = (scope, remember = true) => {
    if (scope !== 'app' && scope !== 'web') return;
    setPlatformScope(scope);
    setHasInitialChoice(true);
    setIsPlatformModalOpen(false);

    if (remember) {
      setStoredPlatformScope(scope);
    }
  };

  const openPlatformModal = () => {
    setIsPlatformModalOpen(true);
  };

  const closePlatformModal = () => {
    // Chỉ cho đóng nếu đã có lựa chọn trước đó
    if (hasInitialChoice) {
      setIsPlatformModalOpen(false);
    }
  };

  const togglePlatform = () => {
    const nextScope = platformScope === 'web' ? 'app' : 'web';
    selectPlatform(nextScope, true);
  };

  return (
    <PlatformContext.Provider
      value={{
        platformScope,
        hasInitialChoice,
        isPlatformModalOpen,
        selectPlatform,
        openPlatformModal,
        closePlatformModal,
        togglePlatform,
      }}
    >
      {children}
    </PlatformContext.Provider>
  );
}

export function usePlatform() {
  const context = useContext(PlatformContext);
  if (!context) {
    throw new Error('usePlatform must be used within a PlatformProvider');
  }
  return context;
}
