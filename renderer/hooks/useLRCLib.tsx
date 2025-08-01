// hooks/useLRCLib.js
import {useCallback, useEffect, useState} from 'react';
import {extractVideoId, isYoutube} from '../utils/utils';

const LRCLIB_API_BASE = 'https://lrclib.net/api';

const useLRCLib = (videoSrc, metadata) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');

  // Extract title from video metadata or filename
  const getDefaultQuery = useCallback(() => {
    if (metadata?.title) {
      return metadata.title;
    }
    if (videoSrc?.path) {
      const filename = videoSrc.path.split('/').pop().split('\\').pop();
      // Remove file extension and common video quality indicators
      return filename
      .replace(/\.(mp4|mkv|avi|webm|mov)$/i, '')
      .replace(/(1080p|720p|480p|HD|FHD|4K)/gi, '')
      .replace(/[._-]/g, ' ')
      .trim();
    }
    return '';
  }, [videoSrc, metadata]);

  // Initialize search query when video changes
  useEffect(() => {
    setSearchQuery(getDefaultQuery());
  }, [getDefaultQuery]);

  // Search for lyrics
  const searchLyrics = useCallback(async (query = searchQuery) => {
    if (!query.trim()) return;

    setIsSearching(true);
    setSearchResults([]);

    try {
      const response = await fetch(`${LRCLIB_API_BASE}/search?q=${encodeURIComponent(query)}`);
      if (response.ok) {
        const data = await response.json();
        setSearchResults(data);
      } else {
        console.error('Search failed:', response.status);
        setSearchResults([]);
      }
    } catch (error) {
      console.error('Error searching lyrics:', error);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [searchQuery]);

  // Get lyrics by ID
  const getLyricsById = useCallback(async (id) => {
    try {
      const response = await fetch(`${LRCLIB_API_BASE}/get/${id}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error('Error fetching lyrics:', error);
    }
    return null;
  }, []);

  // Download and save lyrics
  const downloadLyrics = useCallback(async (lyricsData) => {
    if (!lyricsData || !lyricsData.syncedLyrics) {
      setDownloadStatus('No synced lyrics available');
      return false;
    }

    try {
      let savePath;
      let filename;

      if (isYoutube(videoSrc.path)) {
        // For YouTube videos, save in user data directory
        const videoId = extractVideoId(videoSrc.path);
        filename = `${videoId}.lrc`;
        const userDataPath = await window.electronAPI.getUserDataPath();
        savePath = await window.electronAPI.joinPath(userDataPath, 'lyrics', filename);

        // Ensure lyrics directory exists
        await window.electronAPI.ensureDir(await window.electronAPI.joinPath(userDataPath, 'lyrics'));
      } else {
        // For local videos, save in the same directory
        const videoPath = videoSrc.path;
        const dir = await window.electronAPI.getDirname(videoPath);
        const basename = await window.electronAPI.getBasename(videoPath);
        const nameWithoutExt = basename.replace(/\.[^/.]+$/, '');
        filename = `${nameWithoutExt}.lrc`;
        savePath = await window.electronAPI.joinPath(dir, filename);
      }

      // Save the lyrics file
      await window.electronAPI.writeFile(savePath, lyricsData.syncedLyrics);

      setDownloadStatus(`Lyrics saved as ${filename}`);

      // Return the path for loading
      return savePath;
    } catch (error) {
      console.error('Error saving lyrics:', error);
      setDownloadStatus('Failed to save lyrics');
      return false;
    }
  }, [videoSrc]);

  // Open Miteiru data directory
  const openMiteiruDataDir = useCallback(async () => {
    try {
      const userDataPath = await window.electronAPI.getUserDataPath();
      const lyricsPath = await window.electronAPI.joinPath(userDataPath, 'lyrics');
      await window.electronAPI.ensureDir(lyricsPath);
      await window.electronAPI.openPath(lyricsPath);
    } catch (error) {
      console.error('Error opening data directory:', error);
    }
  }, []);

  return {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    searchLyrics,
    getLyricsById,
    downloadLyrics,
    downloadStatus,
    openMiteiruDataDir
  };
};

export default useLRCLib;