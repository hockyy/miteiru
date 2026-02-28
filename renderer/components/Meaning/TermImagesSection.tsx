import React, { useCallback, useEffect, useState } from 'react';
import { AwesomeButton } from 'react-awesome-button';
import { ImageDisplayPopup } from './ImageDisplayPopup';
import { videoConstants } from '../../utils/constants';
import { joinString } from '../../utils/utils';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'gif', 'webp'];

interface TermImageEntry {
  id: string;
  filename: string;
  addedAt: number;
}

interface TermImagesSectionProps {
  term: string;
  lang: string;
  romajiedData: Array<{ key: number; romajied: any[] }>;
  meaningContent: { sense?: { gloss: { text: string }[] }[]; meaning?: string[]; content?: string };
}

export const TermImagesSection: React.FC<TermImagesSectionProps> = ({
  term,
  lang,
  romajiedData,
  meaningContent,
}) => {
  const [images, setImages] = useState<TermImageEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [displayImageId, setDisplayImageId] = useState<string | null>(null);
  const [displayImageDataUrl, setDisplayImageDataUrl] = useState<string | null>(null);
  const [thumbnails, setThumbnails] = useState<Record<string, string>>({});

  const loadImages = useCallback(async () => {
    if (!term || !lang) return;
    setLoading(true);
    try {
      const entries = await window.ipc.invoke('loadTermImages', term, lang);
      setImages(entries);
    } catch (e) {
      console.error('Failed to load term images:', e);
      setImages([]);
    } finally {
      setLoading(false);
    }
  }, [term, lang]);

  useEffect(() => {
    loadImages();
  }, [loadImages]);

  // Load thumbnails for display
  useEffect(() => {
    if (images.length === 0) {
      setThumbnails({});
      return;
    }
    let cancelled = false;
    const loadThumbs = async () => {
      const next: Record<string, string> = {};
      for (const img of images) {
        if (cancelled) return;
        try {
          const dataUrl = await window.ipc.invoke('getTermImageAsDataUrl', term, lang, img.id);
          if (dataUrl) next[img.id] = dataUrl;
        } catch { /* ignore */ }
      }
      if (!cancelled) setThumbnails(next);
    };
    loadThumbs();
    return () => { cancelled = true; };
  }, [images, term, lang]);

  const handleAddImage = useCallback(async () => {
    try {
      const { filePaths, canceled } = await window.ipc.invoke('pickFile', IMAGE_EXTENSIONS);
      if (canceled || !filePaths?.length) return;
      const filePath = filePaths[0];
      const base64 = await window.ipc.invoke('fs-readFile', filePath);
      const ext = filePath.split('.').pop()?.toLowerCase() || 'png';
      const result = await window.ipc.invoke('saveTermImage', term, lang, base64, ext);
      if (result) await loadImages();
    } catch (e) {
      console.error('Failed to add image:', e);
      alert('Failed to add image. Please try again.');
    }
  }, [term, lang, loadImages]);

  const handleDelete = useCallback(async (imageId: string) => {
    if (!confirm('Remove this image?')) return;
    const ok = await window.ipc.invoke('deleteTermImage', term, lang, imageId);
    if (ok) await loadImages();
  }, [term, lang, loadImages]);

  const handleDisplay = useCallback(async (imageId: string) => {
    const dataUrl = await window.ipc.invoke('getTermImageAsDataUrl', term, lang, imageId);
    setDisplayImageDataUrl(dataUrl);
    setDisplayImageId(imageId);
  }, [term, lang]);

  const handleClosePopup = useCallback(() => {
    setDisplayImageId(null);
    setDisplayImageDataUrl(null);
  }, []);

  const getMeaningText = useCallback(() => {
    if (meaningContent?.sense?.length) {
      return joinString(meaningContent.sense[0].gloss.map((g) => g.text));
    }
    if (meaningContent?.meaning?.length) {
      return joinString(meaningContent.meaning);
    }
    return meaningContent?.content || '';
  }, [meaningContent]);

  const romajied = romajiedData?.[0]?.romajied || [];

  return (
    <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-2 border-amber-400 rounded-lg p-5 my-4">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-amber-900 font-bold text-lg flex items-center gap-2">
          🖼️ Images
          {images.length > 0 && (
            <span className="text-sm font-normal text-amber-600">({images.length})</span>
          )}
        </h3>
        <AwesomeButton type="primary" size="small" onPress={handleAddImage}>
          ➕ Add Image
        </AwesomeButton>
      </div>

      {loading ? (
        <div className="text-center py-6 text-amber-600">Loading...</div>
      ) : images.length === 0 ? (
        <div className="text-center py-6">
          <p className="text-amber-700 mb-3">No images for &quot;{term}&quot; yet</p>
          <AwesomeButton type="primary" onPress={handleAddImage}>
            Add your first image
          </AwesomeButton>
        </div>
      ) : (
        <div className="flex flex-wrap gap-4">
          {images.map((img) => (
            <div
              key={img.id}
              className="group relative rounded-lg overflow-hidden border-2 border-amber-300 bg-white shadow hover:shadow-md transition-shadow"
            >
              <div className="w-24 h-24 flex items-center justify-center bg-amber-50">
                {thumbnails[img.id] ? (
                  <img
                    src={thumbnails[img.id]}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl text-amber-300">🖼️</span>
                )}
              </div>
              <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-1">
                <AwesomeButton
                  type="primary"
                  size="small"
                  onPress={() => handleDisplay(img.id)}
                >
                  Display
                </AwesomeButton>
                <button
                  onClick={() => handleDelete(img.id)}
                  className="text-xs text-red-300 hover:text-red-100"
                >
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {displayImageId && (
        <ImageDisplayPopup
          imageDataUrl={displayImageDataUrl}
          term={term}
          romajied={romajied}
          lang={lang}
          meaningText={getMeaningText()}
          onClose={handleClosePopup}
        />
      )}
    </div>
  );
};
