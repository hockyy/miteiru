/** Reusable clipboard button. Used in Learn translation rows and MeaningBox. */
import React, {useCallback, useState} from 'react';
import {FaCheck, FaCopy} from 'react-icons/fa';

interface CopyButtonProps {
  text: string;
  label?: string;
  /** Tailwind classes for border/text/hover — defaults to purple (Learn panel) */
  className?: string;
}

const defaultClassName =
  'border-purple-300 bg-white text-purple-800 hover:bg-purple-100';

export const CopyButton: React.FC<CopyButtonProps> = ({
  text,
  label = 'Copy',
  className = defaultClassName,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    if (!text.trim()) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  }, [text]);

  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!text.trim()}
      title={label}
      className={`inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded border px-2.5 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${className}`}
    >
      {copied ? <FaCheck className="h-3 w-3 shrink-0" /> : <FaCopy className="h-3 w-3 shrink-0" />}
      <span>{copied ? 'Copied' : label}</span>
    </button>
  );
};
