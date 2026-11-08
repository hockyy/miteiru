/**
 * What the video area says when a local file doesn't play (PlaybackFailedPanel).
 *
 * Most failures are the file's. But when the player itself can't start because libmpv can't be loaded,
 * every file fails the same way, so blaming the file would send people looking in the wrong place.
 * libmpv comes with Miteiru on Windows and macOS. On Linux it is the system's (the .deb depends on it,
 * the AppImage uses the host's), so a distro without it needs it installed.
 */

export type PlaybackFailure = {
  title: string;
  detail: string;
  /** Whether "Try another file" helps: not when no file can play. */
  canTryAnother: boolean;
};

/**
 * src-tauri/src/player.rs reports "cannot load <path>: <reason>" for the last libmpv it tried, or that it
 * found none. Paths can hold spaces ("C:\Program Files\…"). The reason only ever comes from the player
 * failing to start, never from a file.
 */
const PLAYER_MISSING = /cannot load .*mpv|libmpv was not found/i;

export const describePlaybackFailure = (reason: string | undefined, platform: string | undefined): PlaybackFailure => {
  if (reason && PLAYER_MISSING.test(reason)) {
    if (platform === 'linux') {
      return {
        title: 'Miteiru needs libmpv to play videos',
        detail: 'Install it with your package manager, then open the video again: sudo apt install libmpv2 on Debian and Ubuntu 24.04 (libmpv1 on Ubuntu 22.04), sudo dnf install mpv-libs on Fedora, or sudo pacman -S mpv on Arch.',
        canTryAnother: false,
      };
    }
    return {
      title: 'Miteiru’s video player is missing',
      detail: 'Its libmpv library isn’t where Miteiru installed it. Reinstall Miteiru, then open the video again.',
      canTryAnother: false,
    };
  }
  return {
    title: 'Miteiru couldn’t play this file',
    detail: 'The file may be damaged, or in a format this computer can’t play.',
    canTryAnother: true,
  };
};
