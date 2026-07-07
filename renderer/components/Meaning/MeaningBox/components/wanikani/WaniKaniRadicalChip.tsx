import React, { useEffect, useState } from 'react';
import WanikaniRadicalDisplay from '../../../WanikaniRadicalDisplay';

type WaniKaniRadicalChipProps = {
  slug: string;
};

/** Clickable WaniKani radical chip with lazy-loaded glyph + meaning. */
export const WaniKaniRadicalChip = ({ slug }: WaniKaniRadicalChipProps) => {
  const [radicalDisplay, setRadicalDisplay] = useState('');
  const [radicalName, setRadicalName] = useState('');

  useEffect(() => {
    window.ipc.invoke('getWaniRadical', slug).then((radical) => {
      setRadicalDisplay(radical.character);
      setRadicalName(radical.meaning);
    });
  }, [slug]);

  const handleClick = (event: React.MouseEvent) => {
    event.preventDefault();
    window.electronAPI.openExternal(`https://www.wanikani.com/radicals/${slug}`);
  };

  return (
    <div
      className="flex flex-col items-center justify-center p-1 pb-3 text-center radical-bubble"
      onClick={handleClick}
    >
      {radicalName}
      <WanikaniRadicalDisplay slug={slug} characters={radicalDisplay} />
    </div>
  );
};
