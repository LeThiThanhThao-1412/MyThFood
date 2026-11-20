import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface UserLocation {
  latitude: number;
  longitude: number;
  address: string;
  source: "gps" | "manual";
}

interface LocationState {
  location: UserLocation | null;
  hasLocation: boolean;
  setLocation: (loc: UserLocation) => void;
  clearLocation: () => void;
}

export const useLocationStore = create<LocationState>()(
  persist(
    (set) => ({
      location: null,
      hasLocation: false,
      setLocation: (loc) => set({ location: loc, hasLocation: true }),
      clearLocation: () => set({ location: null, hasLocation: false }),
    }),
    { name: "mythfood-location" },
  ),
);
