// hooks/useLRCLib.js
import {useCallback, useEffect, useRef, useState} from 'react';
import {isYoutube} from '../utils/utils';
import {getYoutubeVideoId} from '../utils/mediaUtils';
import {lyricsSearchQuery, youtubeLyricsFileName} from '../utils/lyricsUtils';

const LRCLIB_API_BASE = 'https://lrclib.net/api';

const useLRCLib = (videoSrc, isOpen = false) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [isResolvingQuery, setIsResolvingQuery] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState('');
  const userEditedQueryRef = useRef(false);
  const titleCacheRef = useRef(new Map());

  const applyDefaultQuery = useCallback((youtubeTitle = null) => {
    if (userEditedQueryRef.current) {
      return;
    }
    setSearchQuery(lyricsSearchQuery({
      videoPath: videoSrc?.path,
      youtubeTitle
    }));
  }, [videoSrc?.path]);

  useEffect(() => {
    userEditedQueryRef.current = false;
    setHasSearched(false);
    setSearchResults([]);
    applyDefaultQuery();
  }, [applyDefaultQuery]);

  useEffect(() => {
    if (!isOpen || !videoSrc?.path || !isYoutube(videoSrc.path)) {
      setIsResolvingQuery(false);
      return;
    }

    const videoId = getYoutubeVideoId(videoSrc.path);
    if (!videoId) {
      return;
    }

    const cachedTitle = titleCacheRef.current.get(videoId);
    if (cachedTitle) {
      applyDefaultQuery(cachedTitle);
      return;
    }

    let cancelled = false;
    setIsResolvingQuery(true);
    window.electronAPI.getYoutubeVideoTitle(videoId)
      .then((title) => {
        if (cancelled || !title) {
          return;
        }
        titleCacheRef.current.set(videoId, title);
        applyDefaultQuery(title);
      })
      .catch((error) => {
        console.error('Error fetching YouTube title for lyrics search:', error);
      })
      .finally(() => {
        if (!cancelled) {
          setIsResolvingQuery(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, videoSrc?.path, applyDefaultQuery]);

  const updateSearchQuery = useCallback((value) => {
    userEditedQueryRef.current = true;
    setSearchQuery(value);
  }, []);

  // Search for lyrics
  const searchLyrics = useCallback(async (query = searchQuery) => {
    if (!query.trim()) return;

    setIsSearching(true);
    setSearchResults([]);
    setHasSearched(true);

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
        const videoId = getYoutubeVideoId(videoSrc.path);
        if (!videoId) {
          setDownloadStatus('Could not determine YouTube video ID');
          return false;
        }
        filename = youtubeLyricsFileName(videoId);
        const userDataPath = await window.electronAPI.getUserDataPath();
        savePath = await window.electronAPI.joinPath(userDataPath, 'lyrics', filename);

        await window.electronAPI.ensureDir(await window.electronAPI.joinPath(userDataPath, 'lyrics'));
      } else {
        const videoPath = videoSrc.path;
        const dir = await window.electronAPI.getDirname(videoPath);
        const basename = await window.electronAPI.getBasename(videoPath);
        const nameWithoutExt = basename.replace(/\.[^/.]+$/, '');
        filename = `${nameWithoutExt}.lrc`;
        savePath = await window.electronAPI.joinPath(dir, filename);
      }

      await window.electronAPI.writeFile(savePath, lyricsData.syncedLyrics);

      setDownloadStatus(`Lyrics saved as ${filename}`);

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
    setSearchQuery: updateSearchQuery,
    searchResults,
    isSearching,
    isResolvingQuery,
    hasSearched,
    searchLyrics,
    getLyricsById,
    downloadLyrics,
    downloadStatus,
    openMiteiruDataDir
  };
};

export default useLRCLib;
