// Imported first in pages/_app.tsx: window.backend must exist before any page effect calls it.
// A no-op during static export / SSR and outside the Tauri app.
import {installTauriBridge} from './tauriBridge';

if (typeof window !== 'undefined') {
  installTauriBridge();
}
