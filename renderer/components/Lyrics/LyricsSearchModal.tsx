// components/LyricsSearch/LyricsSearchModal.jsx
import React, {useState, useEffect} from 'react';
import {Search, Download, Music, Folder, X, Clock, User} from 'lucide-react';
import useLRCLib from '../../hooks/useLRCLib';

const LyricsSearchModal = ({
                             isOpen,
                             onClose,
                             videoSrc,
                             metadata,
                             onLyricsDownloaded
                           }) => {
  const [selectedLyrics, setSelectedLyrics] = useState(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Use the hook inside the component
  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    isSearching,
    searchLyrics,
    getLyricsById,
    downloadLyrics,
    downloadStatus,
    openMiteiruDataDir
  } = useLRCLib(videoSrc, metadata);

  useEffect(() => {
    if (downloadStatus) {
      const timer = setTimeout(() => {
        // Clear status after 3 seconds - you might want to add a setter for this
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [downloadStatus]);

  const handleSearch = (e) => {
    e.preventDefault();
    searchLyrics();
  };

  const handleDownload = async (result) => {
    setIsDownloading(true);
    setSelectedLyrics(result);

    try {
      const fullLyrics = await getLyricsById(result.id);
      if (fullLyrics) {
        const savePath = await downloadLyrics(fullLyrics);
        if (savePath && typeof savePath === 'string' && onLyricsDownloaded) {
          // Use the savePath to load the lyrics
          onLyricsDownloaded(savePath);
          setTimeout(() => onClose(), 1500);
        }
      }
    } finally {
      setIsDownloading(false);
    }
  };

  const formatDuration = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
        <div
            className="bg-gray-900 rounded-lg shadow-xl w-full max-w-3xl max-h-[80vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-gray-700">
            <h2 className="text-xl font-semibold text-white flex items-center gap-2">
              <Music className="w-5 h-5"/>
              Search Lyrics on LRCLIB
            </h2>
            <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5"/>
            </button>
          </div>

          {/* Search Bar */}
          <form onSubmit={handleSearch} className="p-4 border-b border-gray-700">
            <div className="flex gap-2">
              <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search for song title, artist..."
                  className="flex-1 px-4 py-2 bg-gray-800 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                  type="submit"
                  disabled={isSearching}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                <Search className="w-4 h-4"/>
                {isSearching ? 'Searching...' : 'Search'}
              </button>
              <button
                  type="button"
                  onClick={openMiteiruDataDir}
                  className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 flex items-center gap-2"
                  title="Open lyrics folder"
              >
                <Folder className="w-4 h-4"/>
              </button>
            </div>
          </form>

          {/* Results */}
          <div className="flex-1 overflow-y-auto p-4">
            {downloadStatus && (
                <div
                    className="mb-4 p-3 bg-green-600 bg-opacity-20 border border-green-600 rounded-lg text-green-400">
                  {downloadStatus}
                </div>
            )}

            {searchResults.length === 0 && !isSearching && (
                <div className="text-center text-gray-400 py-8">
                  {searchQuery ? 'No results found. Try a different search query.' : 'Enter a search query to find lyrics.'}
                </div>
            )}

            <div className="space-y-2">
              {searchResults.map((result) => (
                  <div
                      key={result.id}
                      className="p-4 bg-gray-800 rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <h3 className="font-semibold text-white">{result.trackName}</h3>
                        <div className="flex items-center gap-4 mt-1 text-sm text-gray-400">
                      <span className="flex items-center gap-1">
                        <User className="w-3 h-3"/>
                        {result.artistName}
                      </span>
                          {result.albumName && (
                              <span>Album: {result.albumName}</span>
                          )}
                          {result.duration && (
                              <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3"/>
                                {formatDuration(result.duration)}
                        </span>
                          )}
                        </div>
                        <div className="mt-2 flex gap-2 text-xs">
                          {result.syncedLyrics && (
                              <span
                                  className="px-2 py-1 bg-green-600 bg-opacity-20 text-green-400 rounded">
                          Synced
                        </span>
                          )}
                          {result.plainLyrics && (
                              <span
                                  className="px-2 py-1 bg-blue-600 bg-opacity-20 text-blue-400 rounded">
                          Plain
                        </span>
                          )}
                        </div>
                      </div>
                      <button
                          onClick={() => handleDownload(result)}
                          disabled={!result.syncedLyrics || isDownloading}
                          className="ml-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm"
                      >
                        <Download className="w-4 h-4"/>
                        {isDownloading && selectedLyrics?.id === result.id ? 'Downloading...' : 'Download'}
                      </button>
                    </div>
                  </div>
              ))}
            </div>
          </div>
        </div>
      </div>
  );
};

export default LyricsSearchModal;