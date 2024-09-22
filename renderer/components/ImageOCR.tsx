// components/ImageOCR.tsx
import React, {useState, useCallback} from 'react';
import {AwesomeButton} from "react-awesome-button";
import {videoConstants} from "../utils/constants";

interface ImageOCRProps {
  onTextExtracted: (text: string) => void;
  lang: string
}

interface SentenceListProps {
  sentences: string[];
  onSentenceClick: (sentence: string) => void;
}

const SentenceList: React.FC<SentenceListProps> = ({sentences, onSentenceClick}) => {
  return (
      <div className="mt-4 w-full">
        <h3 className="text-xl font-semibold mb-2">Extracted Sentences</h3>
        <ul className="list-none p-0">
          {sentences.map((sentence, index) => (
              <li
                  key={index}
                  className="cursor-pointer p-2 hover:bg-gray-100 border-b border-gray-200 text-black"
                  onClick={() => onSentenceClick(sentence)}
              >
                {sentence}
              </li>
          ))}
        </ul>
      </div>
  );
};

export const ImageOCR: React.FC<ImageOCRProps> = ({onTextExtracted, lang}) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sentences, setSentences] = useState<string[]>([]);

  const handleImageUpload = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        if (result.length > 100) {  // Basic check to ensure we have some meaningful data
          setSelectedImage(result);
        } else {
          alert('The selected file does not appear to be a valid image. Please try another file.');
        }
      };
      reader.onerror = (e) => {
        console.error('Error reading file:', e);
        alert('There was an error reading the file. Please try again.');
      };
      reader.readAsDataURL(file);
    }
  }, []);

  const performOCR = useCallback(async () => {
    if (!selectedImage) {
      alert('Please select an image first.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await window.ipc.invoke('performOCR', selectedImage, videoConstants.ocrLang[lang]);
      if (result.success) {
        // Split the text into sentences
        const extractedSentences = result.text.split('\n').filter(s => s.trim().length > 0);
        setSentences(extractedSentences);
        alert('OCR completed successfully!');
      } else {
        throw new Error(result.error);
      }
    } catch (error) {
      console.error('OCR failed:', error);
      alert(`OCR failed: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedImage, onTextExtracted, lang]);

  const handleSentenceClick = useCallback((sentence: string) => {
    onTextExtracted(sentence);
  }, [onTextExtracted]);

  return (
      <div className="flex flex-col gap-4 w-full">
        <input
            type="file"
            accept="image/*"
            onChange={handleImageUpload}
            className="p-2 border rounded"
        />
        {selectedImage && (
            <img src={selectedImage} alt="Selected" className="max-w-full h-auto"/>
        )}
        <AwesomeButton
            type="primary"
            onPress={performOCR}
            disabled={!selectedImage || isLoading}
        >
          {isLoading ? 'Processing...' : 'Perform OCR'}
        </AwesomeButton>
        <SentenceList sentences={sentences} onSentenceClick={handleSentenceClick}/>
      </div>
  );
};