import React, { useCallback, useState, useRef } from 'react';
import { AwesomeButton } from 'react-awesome-button';
import { useStoreData } from '../../hooks/useStoreData';

interface ImageOCRProps {
  onTextExtracted: (text: string) => void;
  targetLanguage?: string;
}

interface BoundingPoly {
  vertices: Array<{ x: number; y: number }>;
}

interface TextBlock {
  boundingBox: BoundingPoly;
  text: string;
}

type ViewLevel = 'paragraph' | 'sentence';

export const ImageOCR: React.FC<ImageOCRProps> = ({ onTextExtracted, targetLanguage = 'ja' }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrResult, setOcrResult] = useState<string>('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [paragraphs, setParagraphs] = useState<TextBlock[]>([]);
  const [sentences, setSentences] = useState<TextBlock[]>([]);
  const [viewLevel, setViewLevel] = useState<ViewLevel>('paragraph');
  const [showBoundingBoxes, setShowBoundingBoxes] = useState(true);
  const [selectedBlockIndex, setSelectedBlockIndex] = useState<number | null>(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 });
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [originalDimensions, setOriginalDimensions] = useState({ width: 0, height: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const [googleApiKey] = useStoreData('google.vision.apiKey', '');

  // Debug: Log when API key changes
  React.useEffect(() => {
    console.log('Google Vision API Key updated:', googleApiKey ? `${googleApiKey.substring(0, 10)}...` : 'NOT SET');
  }, [googleApiKey]);

  const handleImageSelect = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Create preview
    const reader = new FileReader();
    reader.onload = (e) => {
      setPreviewUrl(e.target?.result as string);
    };
    reader.readAsDataURL(file);
    console.log('File selected:', file.name);
    setSelectedFile(file);
    setOcrResult(''); // Clear previous result
  }, []);

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(file => file.type.startsWith('image/'));
    
    if (imageFile) {
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setPreviewUrl(e.target?.result as string);
      };
      reader.readAsDataURL(imageFile);
      console.log('File dropped:', imageFile.name);
      setSelectedFile(imageFile);
      setOcrResult(''); // Clear previous result
    }
  }, []);

  const processImage = useCallback(async (file?: File | Blob) => {
    const fileToProcess = file || selectedFile;
    
    if (!fileToProcess) {
      alert('Please select or drag an image first');
      return;
    }

    console.log('Processing image with API key:', googleApiKey ? `${googleApiKey.substring(0, 10)}...` : 'NOT SET');
    if (!googleApiKey) {
      alert('Please set your Google Cloud Vision API key in settings');
      return;
    }

    setIsProcessing(true);
    setOcrResult('Processing image...');

    try {
      // Convert image to base64
      const base64Image = await fileToBase64(fileToProcess);
      
      // Call Google Cloud Vision API
      const response = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${googleApiKey}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            requests: [
              {
                image: {
                  content: base64Image,
                },
                features: [
                  {
                    type: 'TEXT_DETECTION',
                    maxResults: 1,
                  },
                ],
                imageContext: {
                  languageHints: [targetLanguage],
                },
              },
            ],
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (data.responses?.[0]?.error) {
        throw new Error(data.responses[0].error.message);
      }

      const detectedText = data.responses?.[0]?.textAnnotations?.[0]?.description || '';
      
      if (!detectedText) {
        setOcrResult('No text detected in image');
        setParagraphs([]);
        return;
      }

      // Extract paragraph-level and sentence-level bounding boxes
      const extractedParagraphs: TextBlock[] = [];
      const extractedSentences: TextBlock[] = [];
      const pages = data.responses?.[0]?.fullTextAnnotation?.pages || [];
      
      pages.forEach(page => {
        page.blocks?.forEach(block => {
          block.paragraphs?.forEach(paragraph => {
            if (paragraph.boundingBox) {
              // Extract paragraph text from words
              let paragraphText = '';
              paragraph.words?.forEach(word => {
                word.symbols?.forEach(symbol => {
                  paragraphText += symbol.text || '';
                });
                paragraphText += ' '; // Add space between words
              });
              
              extractedParagraphs.push({
                boundingBox: paragraph.boundingBox,
                text: paragraphText.trim()
              });

              // Extract sentence-level (treating each word as a potential sentence boundary)
              // For better sentence detection, we'll group words until we find punctuation
              let currentSentence = '';
              let sentenceWords: any[] = [];
              
              paragraph.words?.forEach((word, wordIndex) => {
                let wordText = '';
                word.symbols?.forEach(symbol => {
                  wordText += symbol.text || '';
                });
                
                sentenceWords.push(word);
                currentSentence += wordText + ' ';
                
                // Check if this word ends with sentence-ending punctuation
                const endsWithPunctuation = /[.!?。！？]$/.test(wordText);
                const isLastWord = wordIndex === (paragraph.words?.length || 0) - 1;
                
                if (endsWithPunctuation || isLastWord) {
                  // Calculate bounding box for this sentence from its words
                  if (sentenceWords.length > 0) {
                    const sentenceBoundingBox = calculateBoundingBox(sentenceWords);
                    if (sentenceBoundingBox) {
                      extractedSentences.push({
                        boundingBox: sentenceBoundingBox,
                        text: currentSentence.trim()
                      });
                    }
                  }
                  currentSentence = '';
                  sentenceWords = [];
                }
              });
            }
          });
        });
      });

      console.log('Extracted paragraphs:', extractedParagraphs.length);
      console.log('Extracted sentences:', extractedSentences.length);
      setParagraphs(extractedParagraphs);
      setSentences(extractedSentences);
      setOcrResult(detectedText);
      onTextExtracted(detectedText);

    } catch (error) {
      console.error('OCR failed:', error);
      setOcrResult(`OCR failed: ${error.message}`);
      alert(`OCR failed: ${error.message}\n\nMake sure your Google Cloud Vision API key is valid.`);
    } finally {
      setIsProcessing(false);
    }
  }, [googleApiKey, targetLanguage, onTextExtracted, selectedFile]);

  const calculateBoundingBox = (words: any[]): BoundingPoly | null => {
    if (!words || words.length === 0) return null;
    
    const allVertices: Array<{ x: number; y: number }> = [];
    
    words.forEach(word => {
      if (word.boundingBox?.vertices) {
        allVertices.push(...word.boundingBox.vertices);
      }
    });
    
    if (allVertices.length === 0) return null;
    
    // Calculate min/max to create a bounding rectangle
    const minX = Math.min(...allVertices.map(v => v.x));
    const maxX = Math.max(...allVertices.map(v => v.x));
    const minY = Math.min(...allVertices.map(v => v.y));
    const maxY = Math.max(...allVertices.map(v => v.y));
    
    return {
      vertices: [
        { x: minX, y: minY },
        { x: maxX, y: minY },
        { x: maxX, y: maxY },
        { x: minX, y: maxY }
      ]
    };
  };

  const fileToBase64 = (file: File | Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64 = (reader.result as string).split(',')[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleClear = useCallback(() => {
    setPreviewUrl(null);
    setOcrResult('');
    setSelectedFile(null);
    setParagraphs([]);
    setSentences([]);
    setSelectedBlockIndex(null);
    setImageDimensions({ width: 0, height: 0 });
    setOriginalDimensions({ width: 0, height: 0 });
    setImagePosition({ x: 0, y: 0 });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleManualProcess = useCallback(() => {
    processImage();
  }, [processImage]);

  const handleBlockClick = useCallback((index: number, text: string) => {
    setSelectedBlockIndex(index);
    onTextExtracted(text);
    console.log(`Selected ${viewLevel} ${index + 1}:`, text);
  }, [viewLevel, onTextExtracted]);

  const handleImageLoad = useCallback(() => {
    if (imageRef.current) {
      const naturalWidth = imageRef.current.naturalWidth;
      const naturalHeight = imageRef.current.naturalHeight;
      
      // Calculate initial display size (max 400px height while maintaining aspect ratio)
      const maxHeight = 400;
      const aspectRatio = naturalWidth / naturalHeight;
      
      let initialHeight = Math.min(naturalHeight, maxHeight);
      let initialWidth = initialHeight * aspectRatio;
      
      setOriginalDimensions({ width: initialWidth, height: initialHeight });
      setImageDimensions({ width: initialWidth, height: initialHeight });
      setImagePosition({ x: 0, y: 0 });
    }
  }, []);

  const getImageScale = useCallback(() => {
    if (originalDimensions.width === 0) return 1;
    return imageDimensions.width / originalDimensions.width;
  }, [imageDimensions, originalDimensions]);

  const handleImageMouseDown = useCallback((e: React.MouseEvent) => {
    // Only start dragging if clicking on the image itself, not on bounding boxes
    if (e.target === imageRef.current) {
      setIsDraggingImage(true);
      setDragStart({
        x: e.clientX - imagePosition.x,
        y: e.clientY - imagePosition.y
      });
    }
  }, [imagePosition]);

  const handleImageMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDraggingImage) {
      setImagePosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y
      });
    }
  }, [isDraggingImage, dragStart]);

  const handleImageMouseUp = useCallback(() => {
    setIsDraggingImage(false);
  }, []);

  const handleZoomIn = useCallback(() => {
    setImageDimensions(prev => {
      const newWidth = Math.min(prev.width * 1.25, originalDimensions.width * 4);
      const aspectRatio = originalDimensions.width / originalDimensions.height;
      return {
        width: newWidth,
        height: newWidth / aspectRatio
      };
    });
  }, [originalDimensions]);

  const handleZoomOut = useCallback(() => {
    setImageDimensions(prev => {
      const newWidth = Math.max(prev.width * 0.8, originalDimensions.width * 0.5);
      const aspectRatio = originalDimensions.width / originalDimensions.height;
      return {
        width: newWidth,
        height: newWidth / aspectRatio
      };
    });
  }, [originalDimensions]);

  const handleResetTransform = useCallback(() => {
    setImageDimensions(originalDimensions);
    setImagePosition({ x: 0, y: 0 });
  }, [originalDimensions]);

  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setImageDimensions(prev => {
      const newWidth = Math.max(
        originalDimensions.width * 0.5,
        Math.min(prev.width * delta, originalDimensions.width * 4)
      );
      const aspectRatio = originalDimensions.width / originalDimensions.height;
      return {
        width: newWidth,
        height: newWidth / aspectRatio
      };
    });
  }, [originalDimensions]);

  // Use native event listener to ensure preventDefault works
  React.useEffect(() => {
    const container = imageContainerRef.current;
    if (!container) return;

    const wheelHandler = (e: WheelEvent) => {
      handleWheel(e);
    };

    container.addEventListener('wheel', wheelHandler, { passive: false });
    return () => {
      container.removeEventListener('wheel', wheelHandler);
    };
  }, [handleWheel]);

  return (
    <div className="w-full max-w-4xl bg-gradient-to-r from-purple-50 to-pink-50 border-2 border-purple-400 rounded-lg p-6 shadow-md">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-purple-900 font-bold text-xl">📷 Image OCR (Google Vision)</h3>
        {previewUrl && (
          <button
            onClick={handleClear}
            className="text-purple-600 hover:text-purple-800 font-bold"
          >
            ✕ Clear
          </button>
        )}
      </div>

      <div className="space-y-4">
        {/* Drag and Drop Zone */}
        <div
          ref={dropRef}
          onDragOver={handleDrag}
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-4 border-dashed rounded-lg p-8 text-center transition-colors ${
            isDragging 
              ? 'border-purple-600 bg-purple-100' 
              : 'border-purple-300 bg-white'
          }`}
        >
          <div className="text-purple-700 text-lg mb-2">
            🖼️ Drag & Drop Image Here
          </div>
          <div className="text-purple-500 text-sm mb-4">
            or
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleImageSelect}
            className="hidden"
          />
          <AwesomeButton
            type="primary"
            onPress={handleButtonClick}
            disabled={isProcessing}
          >
            📁 Browse Files
          </AwesomeButton>
        </div>

        {/* Action Buttons */}
        {previewUrl && (
          <div className="flex gap-3 justify-center items-center flex-wrap">
            <AwesomeButton
              type="secondary"
              onPress={handleManualProcess}
              disabled={isProcessing || !selectedFile}
            >
              🔍 Process Image
            </AwesomeButton>
            
            {/* Zoom Controls */}
            <div className="flex gap-2 items-center bg-white px-3 py-2 rounded-lg border-2 border-purple-300">
              <button
                onClick={handleZoomOut}
                className="px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
                title="Zoom Out"
              >
                🔍−
              </button>
              <span className="text-purple-700 font-semibold min-w-[60px] text-center">
                {Math.round(getImageScale() * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="px-3 py-1 bg-purple-500 text-white rounded hover:bg-purple-600 transition-colors"
                title="Zoom In"
              >
                🔍+
              </button>
              <button
                onClick={handleResetTransform}
                className="px-3 py-1 bg-purple-300 text-purple-900 rounded hover:bg-purple-400 transition-colors ml-2"
                title="Reset View"
              >
                ⟲
              </button>
            </div>

            {paragraphs.length > 0 && (
              <>
                <button
                  onClick={() => setShowBoundingBoxes(!showBoundingBoxes)}
                  className="px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                >
                  {showBoundingBoxes ? '👁️ Hide Boxes' : '👁️ Show Boxes'}
                </button>
                <div className="flex gap-2 items-center">
                  <span className="text-purple-700 font-semibold">Level:</span>
                  <button
                    onClick={() => {
                      setViewLevel('paragraph');
                      setSelectedBlockIndex(null);
                    }}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      viewLevel === 'paragraph'
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-200 text-purple-700 hover:bg-purple-300'
                    }`}
                  >
                    📄 Paragraph
                  </button>
                  <button
                    onClick={() => {
                      setViewLevel('sentence');
                      setSelectedBlockIndex(null);
                    }}
                    className={`px-4 py-2 rounded-lg transition-colors ${
                      viewLevel === 'sentence'
                        ? 'bg-purple-600 text-white'
                        : 'bg-purple-200 text-purple-700 hover:bg-purple-300'
                    }`}
                  >
                    📝 Sentence
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {/* Preview */}
        {previewUrl && (
          <div className="bg-white p-4 rounded-lg border-2 border-purple-300">
            <div className="text-purple-900 font-semibold mb-2">
              Preview:
              {paragraphs.length > 0 && (
                <span className="ml-2 text-sm text-purple-600">
                  ({paragraphs.length} paragraph{paragraphs.length !== 1 ? 's' : ''}, {sentences.length} sentence{sentences.length !== 1 ? 's' : ''})
                </span>
              )}
            </div>
            <div className="text-sm text-purple-600 mb-2">
              💡 Click on any box to extract its text • Drag to pan • Scroll to zoom
            </div>
            <div 
              ref={imageContainerRef}
              className="relative overflow-hidden border border-purple-200 rounded"
              style={{ maxHeight: '600px', cursor: isDraggingImage ? 'grabbing' : 'grab' }}
              onMouseDown={handleImageMouseDown}
              onMouseMove={handleImageMouseMove}
              onMouseUp={handleImageMouseUp}
              onMouseLeave={handleImageMouseUp}
            >
              <div 
                className="relative inline-block"
                style={{
                  position: 'relative',
                  left: `${imagePosition.x}px`,
                  top: `${imagePosition.y}px`,
                }}
              >
                <img
                  ref={imageRef}
                  src={previewUrl}
                  alt="OCR Preview"
                  onLoad={handleImageLoad}
                  className="rounded select-none"
                  draggable={false}
                  style={{
                    width: imageDimensions.width > 0 ? `${imageDimensions.width}px` : 'auto',
                    height: imageDimensions.height > 0 ? `${imageDimensions.height}px` : 'auto',
                    maxHeight: imageDimensions.height === 0 ? '400px' : 'none',
                  }}
                />
                {/* Simple Box Overlays */}
                {showBoundingBoxes && paragraphs.length > 0 && imageRef.current && imageDimensions.width > 0 && (
                  <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
                    {(viewLevel === 'paragraph' ? paragraphs : sentences).map((block, index) => {
                      const image = imageRef.current;
                      if (!image) return null;
                      
                      // Calculate scale based on current displayed size vs natural size
                      const scaleX = imageDimensions.width / image.naturalWidth;
                      const scaleY = imageDimensions.height / image.naturalHeight;
                      
                      const vertices = block.boundingBox.vertices;
                      const minX = Math.min(...vertices.map(v => v.x)) * scaleX;
                      const minY = Math.min(...vertices.map(v => v.y)) * scaleY;
                      const maxX = Math.max(...vertices.map(v => v.x)) * scaleX;
                      const maxY = Math.max(...vertices.map(v => v.y)) * scaleY;
                      
                      const isSelected = selectedBlockIndex === index;
                      
                      return (
                        <div
                          key={index}
                          onClick={() => handleBlockClick(index, block.text)}
                          className={`absolute border-2 transition-all cursor-pointer pointer-events-auto ${
                            isSelected 
                              ? 'bg-yellow-400/30 border-yellow-500 border-4' 
                              : 'bg-purple-400/10 border-purple-500 hover:bg-purple-400/20 hover:border-purple-600'
                          }`}
                          style={{
                            left: `${minX}px`,
                            top: `${minY}px`,
                            width: `${maxX - minX}px`,
                            height: `${maxY - minY}px`,
                          }}
                          title={`Click to extract ${viewLevel} #${index + 1}`}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Selected Block */}
        {selectedBlockIndex !== null && (viewLevel === 'paragraph' ? paragraphs : sentences)[selectedBlockIndex] && (
          <div className="bg-yellow-50 p-4 rounded-lg border-2 border-yellow-400">
            <div className="text-yellow-900 font-semibold mb-2">
              ⭐ Selected {viewLevel === 'paragraph' ? 'Paragraph' : 'Sentence'} #{selectedBlockIndex + 1}:
            </div>
            <div className="text-black whitespace-pre-wrap leading-relaxed">
              {(viewLevel === 'paragraph' ? paragraphs : sentences)[selectedBlockIndex].text}
            </div>
          </div>
        )}

        {/* OCR Result */}
        {ocrResult && (
          <div className="bg-white p-4 rounded-lg border-2 border-purple-300">
            <div className="text-purple-900 font-semibold mb-2">Full Extracted Text:</div>
            <div className="text-black whitespace-pre-wrap leading-relaxed">
              {ocrResult}
            </div>
          </div>
        )}

        {/* API Key Notice */}
        {!googleApiKey && (
          <div className="bg-yellow-50 border-2 border-yellow-400 rounded-lg p-4">
            <div className="font-semibold text-yellow-900 mb-2">⚠️ API Key Required</div>
            <div className="text-yellow-800 text-sm">
              <p className="mb-2">You need a Google Cloud Vision API key to use this feature.</p>
              <ol className="list-decimal ml-5 space-y-1">
                <li>Go to <a href="https://console.cloud.google.com" className="text-blue-600 underline" target="_blank" rel="noopener noreferrer">Google Cloud Console</a></li>
                <li>Enable "Cloud Vision API"</li>
                <li>Create an API key</li>
                <li>Add it in Settings (Ctrl+X)</li>
              </ol>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

