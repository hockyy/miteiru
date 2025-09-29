import { useCallback, useState } from 'react';

interface MediaToolsCheckResult {
  ok: number;
  message: string;
  cached: boolean;
  details?: {
    ffmpeg: boolean;
    ffprobe: boolean;
    ytdlp: boolean;
  };
}

const initialToolsCheck: MediaToolsCheckResult = { 
  ok: 0, 
  message: '🐸 ゲロゲロ', 
  cached: false 
};

const checkingToolsMessage: MediaToolsCheckResult = {
  ok: 2,
  message: "checking...",
  cached: false
};

export const useToolsCheck = () => {
  const [toolsCheck, setToolsCheck] = useState<MediaToolsCheckResult>(initialToolsCheck);
  const [isChecking, setIsChecking] = useState(false);

  const checkMediaTools = useCallback(async (forceRefresh = false) => {
    // Prevent multiple concurrent checks
    if (isChecking) {
      console.log('[Media Tools Check] Check already in progress, ignoring request');
      return;
    }

    setIsChecking(true);
    setToolsCheck(checkingToolsMessage);
    
    try {
      const res = await window.ipc.invoke('checkMediaTools', forceRefresh);
      
      if (res && typeof res === 'object') {
        setToolsCheck(res);
      } else {
        throw new Error('Invalid response from backend');
      }
    } catch (error) {
      console.error('[Media Tools Check] Error occurred:', error);
      setToolsCheck({
        ok: 0,
        message: `Error checking media tools: ${error.message}`,
        cached: false
      });
    } finally {
      setIsChecking(false);
    }
  }, []); // Remove isChecking from dependencies to prevent infinite loops

  // Backward compatibility - alias for old FFmpeg check
  const checkFFmpegTools = checkMediaTools;

  return {
    toolsCheck,
    isChecking,
    checkMediaTools,
    // Backward compatibility exports
    ffmpegCheck: toolsCheck,
    checkFFmpegTools
  };
};
