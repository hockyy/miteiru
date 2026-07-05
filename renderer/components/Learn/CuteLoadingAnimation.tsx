/** Shared loading spinner for translation + analysis. Used by AITranslationResults, AIAnalysisDisplay */
import React from 'react';

interface CuteLoadingAnimationProps {
  message?: string;
  subMessage?: string;
}

export const CuteLoadingAnimation: React.FC<CuteLoadingAnimationProps> = ({
  message = 'Working on it...',
  subMessage,
}) => (
  <div className="cute-loader flex flex-col items-center justify-center py-8 px-4">
    <style dangerouslySetInnerHTML={{__html: `
      @keyframes cute-loader-bounce {
        0%, 100% { transform: translateY(0) rotate(-2deg); }
        50% { transform: translateY(-10px) rotate(2deg); }
      }
      @keyframes cute-loader-sparkle {
        0%, 100% { opacity: 0.3; transform: scale(0.8) rotate(0deg); }
        50% { opacity: 1; transform: scale(1.1) rotate(18deg); }
      }
      @keyframes cute-loader-sparkle-delay {
        0%, 100% { opacity: 0.2; transform: scale(0.7) rotate(0deg); }
        50% { opacity: 0.95; transform: scale(1) rotate(-14deg); }
      }
      @keyframes cute-loader-dot {
        0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
        40% { transform: translateY(-8px); opacity: 1; }
      }
      @keyframes cute-loader-shimmer {
        0% { background-position: 200% center; }
        100% { background-position: -200% center; }
      }
      @keyframes cute-loader-float {
        0%, 100% { transform: translateY(0); }
        50% { transform: translateY(-4px); }
      }
      .cute-loader-face {
        animation: cute-loader-bounce 1.6s ease-in-out infinite;
      }
      .cute-loader-sparkle-a {
        animation: cute-loader-sparkle 1.4s ease-in-out infinite;
      }
      .cute-loader-sparkle-b {
        animation: cute-loader-sparkle-delay 1.4s ease-in-out infinite 0.35s;
      }
      .cute-loader-dot:nth-child(1) { animation: cute-loader-dot 1.1s ease-in-out infinite; }
      .cute-loader-dot:nth-child(2) { animation: cute-loader-dot 1.1s ease-in-out infinite 0.15s; }
      .cute-loader-dot:nth-child(3) { animation: cute-loader-dot 1.1s ease-in-out infinite 0.3s; }
      .cute-loader-text {
        background: linear-gradient(90deg, #7c3aed 0%, #ec4899 35%, #7c3aed 70%, #ec4899 100%);
        background-size: 200% auto;
        -webkit-background-clip: text;
        background-clip: text;
        color: transparent;
        animation: cute-loader-shimmer 2.4s linear infinite;
      }
      .cute-loader-book {
        animation: cute-loader-float 2s ease-in-out infinite;
      }
    `}} />

    <div className="relative mb-4">
      <span
        className="cute-loader-sparkle-a absolute -left-6 -top-2 text-lg select-none"
        aria-hidden
      >
        ✨
      </span>
      <span
        className="cute-loader-sparkle-b absolute -right-5 top-0 text-sm select-none"
        aria-hidden
      >
        💫
      </span>

      <div className="cute-loader-face flex items-center justify-center w-20 h-20 rounded-full bg-gradient-to-br from-purple-200 via-pink-100 to-purple-300 border-2 border-purple-300 shadow-md">
        <span className="cute-loader-book text-3xl select-none" aria-hidden>
          📖
        </span>
      </div>
    </div>

    <div className="flex items-center gap-1.5 mb-3" aria-hidden>
      <span className="cute-loader-dot w-2.5 h-2.5 rounded-full bg-purple-400" />
      <span className="cute-loader-dot w-2.5 h-2.5 rounded-full bg-pink-400" />
      <span className="cute-loader-dot w-2.5 h-2.5 rounded-full bg-violet-400" />
    </div>

    <p className="cute-loader-text text-sm font-semibold text-center">{message}</p>
    {subMessage && (
      <p className="text-xs text-purple-600/80 mt-1 text-center">{subMessage}</p>
    )}
  </div>
);
