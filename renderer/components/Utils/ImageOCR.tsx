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
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
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
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  const handleManualProcess = useCallback(() => {
    processImage();
  }, [processImage]);

  const drawBoundingBoxes = useCallback(() => {
    const canvas = canvasRef.current;
    const image = imageRef.current;
    
    const currentBlocks = viewLevel === 'paragraph' ? paragraphs : sentences;
    
    if (!canvas || !image || !showBoundingBoxes || currentBlocks.length === 0) {
      return;
    }

    // Set canvas size to match image display size
    const rect = image.getBoundingClientRect();
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw each bounding box
    currentBlocks.forEach((block, index) => {
      const vertices = block.boundingBox.vertices;
      
      if (vertices && vertices.length >= 4) {
        const isSelected = selectedBlockIndex === index;
        
        ctx.beginPath();
        ctx.moveTo(vertices[0].x, vertices[0].y);
        
        for (let i = 1; i < vertices.length; i++) {
          ctx.lineTo(vertices[i].x, vertices[i].y);
        }
        
        ctx.closePath();
        
        // Draw semi-transparent fill (highlight selected)
        ctx.fillStyle = isSelected 
          ? `rgba(234, 179, 8, 0.3)` // yellow for selected
          : `rgba(147, 51, 234, 0.1)`; // purple with transparency
        ctx.fill();
        
        // Draw border
        ctx.strokeStyle = isSelected ? '#eab308' : '#9333ea'; // yellow if selected, purple otherwise
        ctx.lineWidth = isSelected ? 4 : 3;
        ctx.stroke();
        
        // Draw label
        ctx.fillStyle = isSelected ? '#eab308' : '#9333ea';
        ctx.font = 'bold 24px Arial';
        const label = viewLevel === 'paragraph' ? `P${index + 1}` : `S${index + 1}`;
        ctx.fillText(label, vertices[0].x + 5, vertices[0].y + 25);
      }
    });
  }, [paragraphs, sentences, viewLevel, showBoundingBoxes, selectedBlockIndex]);

  // Check if a point is inside a polygon
  const isPointInPolygon = (point: { x: number; y: number }, vertices: Array<{ x: number; y: number }>) => {
    let inside = false;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i].x, yi = vertices[i].y;
      const xj = vertices[j].x, yj = vertices[j].y;
      
      const intersect = ((yi > point.y) !== (yj > point.y))
          && (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  };

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    // Only process click if Ctrl is pressed
    if (!isCtrlPressed) return;
    
    const canvas = canvasRef.current;
    const image = imageRef.current;
    
    if (!canvas || !image) return;
    
    const currentBlocks = viewLevel === 'paragraph' ? paragraphs : sentences;
    if (currentBlocks.length === 0) return;
    
    // Get click coordinates relative to canvas
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    
    // Find which polygon was clicked
    for (let i = currentBlocks.length - 1; i >= 0; i--) {
      const block = currentBlocks[i];
      if (isPointInPolygon({ x, y }, block.boundingBox.vertices)) {
        setSelectedBlockIndex(i);
        onTextExtracted(block.text);
        console.log(`Selected ${viewLevel} ${i + 1}:`, block.text);
        drawBoundingBoxes();
        break;
      }
    }
  }, [viewLevel, paragraphs, sentences, onTextExtracted, drawBoundingBoxes, isCtrlPressed]);

  // Draw bounding boxes when image loads or paragraphs change
  React.useEffect(() => {
    if (imageRef.current && imageRef.current.complete) {
      drawBoundingBoxes();
    }
  }, [paragraphs, sentences, viewLevel, showBoundingBoxes, selectedBlockIndex, drawBoundingBoxes]);

  // Add keyboard listeners for Ctrl key
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        setIsCtrlPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setIsCtrlPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', () => setIsCtrlPressed(false));

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', () => setIsCtrlPressed(false));
    };
  }, []);

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
              💡 Click on any box to extract its text
            </div>
            <div className="relative inline-block">
              <img
                ref={imageRef}
                src={previewUrl}
                alt="OCR Preview"
                className="max-w-full max-h-[400px] mx-auto object-contain rounded"
                onLoad={drawBoundingBoxes}
              />
              <canvas
                ref={canvasRef}
                onClick={handleCanvasClick}
                className="absolute top-0 left-0 cursor-pointer"
                style={{ display: showBoundingBoxes && paragraphs.length > 0 ? 'block' : 'none' }}
              />
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

