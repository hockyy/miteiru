// Imported first in pages/_app.tsx: window.ipc must exist before any page effect calls it.
// A no-op during static export / SSR, and under Electron (its preload already defined window.ipc).
import {installTauriBridge} from './tauriBridge';

if (typeof window !== 'undefined') {
  installTauriBridge();
}
