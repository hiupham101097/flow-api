import { create } from 'zustand';

/**
 * Global Telemetry Store using Zustand
 * Centralizes UI filters, selected entities, and live polling states
 * Eliminates excessive prop drilling and prevents re-rendering unmounted tabs.
 */
export const useTelemetryStore = create((set) => ({
  // Filter States
  selectedFilter: 'all',
  range: '24h',
  platformScope: 'all',
  deviceFilter: 'all',
  userFilter: 'all',
  searchTerm: '',
  livePolling: true,
  refreshRate: 10000,

  // Selected detail modal states
  selectedLog: null,
  selectedCrash: null,
  selectedEvent: null,
  telegramModalOpen: false,

  // Timeline navigation state
  timelineUser: '',
  timelineDevice: '',
  timelineApp: '',

  // Filter setters
  setSelectedFilter: (val) => set({ selectedFilter: val }),
  setRange: (val) => set({ range: val }),
  setPlatformScope: (val) => set({ platformScope: val }),
  setDeviceFilter: (val) => set({ deviceFilter: val }),
  setUserFilter: (val) => set({ userFilter: val }),
  setSearchTerm: (val) => set({ searchTerm: val }),
  setLivePolling: (val) => set((state) => ({ livePolling: typeof val === 'function' ? val(state.livePolling) : val })),
  setRefreshRate: (val) => set({ refreshRate: val }),

  // Modal setters
  setSelectedLog: (val) => set({ selectedLog: val }),
  setSelectedCrash: (val) => set({ selectedCrash: val }),
  setSelectedEvent: (val) => set({ selectedEvent: val }),
  setTelegramModalOpen: (val) => set({ telegramModalOpen: val }),

  // Timeline setter
  setTimelineFilter: ({ user = '', device = '', app = '' }) =>
    set({ timelineUser: user, timelineDevice: device, timelineApp: app }),

  // Reset filters
  resetFilters: () =>
    set({
      selectedFilter: 'all',
      range: '24h',
      platformScope: 'all',
      deviceFilter: 'all',
      userFilter: 'all',
      searchTerm: '',
    }),
}));
