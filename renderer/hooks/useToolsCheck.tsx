import { useCallback, useState } from 'react';

interface ToolStatus {
  available: boolean;
  path: string | null;
  isInternal: boolean;
  config: {
    name: string;
    check_command: string;
    download_link: string;
    executable_name: string;
  };
}

interface MediaToolsCheckResult {
  ok: number;
  message: string;
  cached: boolean;
  details?: { [toolName: string]: ToolStatus };
  missingTools?: string[];
  availableTools?: string[];
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
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

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

  // Download a missing tool
  const downloadTool = useCallback(async (toolName: string) => {
    if (isDownloading) {
      console.log(`[useToolsCheck] Download already in progress for ${isDownloading}`);
      return { success: false, error: 'Another download is in progress' };
    }

    setIsDownloading(toolName);
    
    try {
      console.log(`[useToolsCheck] Starting download for ${toolName}`);
      const result = await window.ipc.invoke('downloadTool', toolName);
      
      if (result.success) {
        // Refresh tools check after successful download
        await checkMediaTools(true);
      }
      
      return result;
    } catch (error) {
      console.error(`[useToolsCheck] Download error for ${toolName}:`, error);
      return { success: false, error: error.message };
    } finally {
      setIsDownloading(null);
    }
  }, [isDownloading, checkMediaTools]);

  // Get tools configuration
  const getToolsConfig = useCallback(async () => {
    try {
      return await window.ipc.invoke('getToolsConfig');
    } catch (error) {
      console.error('[useToolsCheck] Error getting tools config:', error);
      return { tools: [], toolsPath: '' };
    }
  }, []);

  // Backward compatibility - alias for old FFmpeg check
  const checkFFmpegTools = checkMediaTools;

  return {
    toolsCheck,
    isChecking,
    isDownloading,
    checkMediaTools,
    downloadTool,
    getToolsConfig,
    // Backward compatibility exports
    ffmpegCheck: toolsCheck,
    checkFFmpegTools
  };
};
