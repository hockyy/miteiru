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
  message: '🐸 Checking optional tools...', 
  cached: false 
};

const checkingToolsMessage: MediaToolsCheckResult = {
  ok: 2,
  message: "checking optional tools...",
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
        message: `Error checking optional tools: ${error.message}`,
        cached: false
      });
    } finally {
      setIsChecking(false);
    }
  }, []); // Remove isChecking from dependencies to prevent infinite loops

  // Get tools configuration
  const getToolsConfig = useCallback(async () => {
    try {
      return await window.ipc.invoke('getToolsConfig');
    } catch (error) {
      console.error('[useToolsCheck] Error getting tools config:', error);
      return { tools: [], toolsPath: '' };
    }
  }, []);

  // Open download link for a missing tool
  const downloadTool = useCallback(async (toolName: string) => {
    if (isDownloading) {
      console.log(`[useToolsCheck] Link opening already in progress for ${isDownloading}`);
      return { success: false, error: 'Another link is being opened' };
    }

    setIsDownloading(toolName);
    
    try {
      console.log(`[useToolsCheck] Getting download link for ${toolName}`);
      const config = await getToolsConfig();
      const tool = config.tools.find(t => t.name === toolName);
      
      if (!tool) {
        return { success: false, error: `Tool configuration not found for ${toolName}` };
      }
      
      console.log(`[useToolsCheck] Opening download link for ${toolName}: ${tool.download_link}`);
      await window.ipc.invoke('open-external', tool.download_link);
      
      return { success: true, message: `Download link opened for ${toolName}` };
    } catch (error) {
      console.error(`[useToolsCheck] Error opening link for ${toolName}:`, error);
      return { success: false, error: error.message };
    } finally {
      setIsDownloading(null);
    }
  }, [isDownloading, getToolsConfig]);

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
