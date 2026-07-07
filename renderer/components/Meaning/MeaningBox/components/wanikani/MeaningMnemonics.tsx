import React from 'react';

type MeaningMnemonicsProps = {
  content: string;
};

/**
 * Parses WaniKani mnemonic HTML-ish markup:
 * `<radical>…</radical>` → blue bold, `<kanji>…</kanji>` → black bold.
 */
export const MeaningMnemonics = ({ content }: MeaningMnemonicsProps) => {
  const parseContent = () => {
    const regex = /<(\w+)>(.*?)<\/\1>/g;
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(content))) {
      const [fullMatch, tag, innerContent] = match;
      const { index } = match;

      parts.push(content.slice(lastIndex, index));

      if (tag === 'radical') {
        parts.push(
          <span key={index} style={{ fontWeight: 'bold', color: '#3B82F6' }}>
            {innerContent}
          </span>,
        );
      } else if (tag === 'kanji') {
        parts.push(
          <span key={index} style={{ fontWeight: 'bold', color: '#000000' }}>
            {innerContent}
          </span>,
        );
      }

      lastIndex = index + fullMatch.length;
    }

    parts.push(content.slice(lastIndex));
    return parts;
  };

  return (
    <div className="m-2 text-sm font-medium leading-relaxed text-blue-900">
      {parseContent()}
    </div>
  );
};
