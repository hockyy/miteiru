import {useState, useCallback, useEffect} from 'react';
import {videoConstants} from "../utils/constants";

interface SpeechOptions {
  lang?: string;
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

    // Determine the language
    let lang = options.lang || videoConstants.englishLang;
    if (videoConstants.varLang[lang as keyof typeof videoConstants.varLang]) {
      lang = videoConstants.varLang[lang as keyof typeof videoConstants.varLang][0];
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = lang;
    if (options.rate) utterance.rate = options.rate;
    if (options.pitch) utterance.pitch = options.pitch;
    if (options.volume) utterance.volume = options.volume;

    // Try to find a voice that matches the language
    const voice = voices.find(v => v.lang.startsWith(lang));
    if (voice) utterance.voice = voice;

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

  return {
    speak,
    stop,
    speaking,
    supported,
    voices
  };
};

export default useSpeech;