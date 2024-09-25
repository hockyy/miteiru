import {useCallback, useEffect, useState} from 'react';

interface SpeechOptions {
  lang?: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
}

const useSpeech = () => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [speaking, setSpeaking] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      setSupported(true);

      const updateVoices = () => {
        setVoices(window.speechSynthesis.getVoices());
      };

      updateVoices();
      window.speechSynthesis.onvoiceschanged = updateVoices;

      return () => {
        window.speechSynthesis.onvoiceschanged = null;
      };
    }
  }, []);

  const speak = useCallback((text: string, options: SpeechOptions = {}) => {
    if (!supported) {
      console.error('Speech synthesis is not supported.');
      return;
    }

    // Stop any ongoing speech
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);

    // Set language if provided
    if (options.lang) {
      utterance.lang = options.lang;
    }

    // Set voice if provided
    if (options.voice) {
      const selectedVoice = voices.find(v => v.name === options.voice);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      } else {
        console.warn(`Voice "${options.voice}" not found. Using default voice.`);
      }
    }

    if (options.rate) utterance.rate = options.rate;
    if (options.pitch) utterance.pitch = options.pitch;
    if (options.volume) utterance.volume = options.volume;

    utterance.onstart = () => setSpeaking(true);
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = (event) => {
      console.error('Speech synthesis error:', event);
      setSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  }, [supported, voices]);
  const stop = useCallback(() => {
    if (supported) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
    }
  }, [supported]);


  const printVoices = useCallback(() => {
    console.log("Available voices:");
    voices.forEach((voice, index) => {
      console.log(`${index + 1}. Name: ${voice.name}, Lang: ${voice.lang}`);
    });
  }, [voices]);

  return {
    speak,
    stop,
    speaking,
    supported,
    voices,
    printVoices
  };
};

export default useSpeech;