import React from 'react';

const WanikaniRadicalDisplay = ({slug, characters}) => {
  return (
      <div className="flex flex-row items-center justify-center m-1 p-0 w-12 text-center">
        {!characters && <img src={`/wanikani/radical/${slug}.png`} alt={slug}/>}
        {characters && <div className={"unselectable text-black text-6xl"}>{characters}</div>}
      </div>
  );
};

export default WanikaniRadicalDisplay;
