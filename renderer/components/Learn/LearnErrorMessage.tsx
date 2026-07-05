/** Shared error banner for Learn AI panels */
import React from 'react';

interface LearnErrorMessageProps {
  message: string;
}

export const LearnErrorMessage: React.FC<LearnErrorMessageProps> = ({ message }) => (
  <div className="rounded-lg border-2 border-red-200 bg-red-50 p-4 text-sm text-red-800">
    {message}
  </div>
);
