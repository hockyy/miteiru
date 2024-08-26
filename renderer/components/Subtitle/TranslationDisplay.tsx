import React from 'react';

const TranslationDisplay = ({translation}) => {
  if (!translation) return null;

  return (
      <div className="bg-white p-4 rounded-lg shadow-md w-full max-w-[40vw]">
        <h3 className="text-lg font-semibold mb-2 text-black">Translation:</h3>
        <p className="text-gray-700">{translation}</p>
      </div>
  );
};

export default TranslationDisplay;