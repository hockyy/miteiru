import React from 'react';

const WanikaniRadicalDisplay = ({filename}) => {
  return (
      <div className="flex flex-row items-center justify-center m-1 p-0 w-12 text-center">
        <img style={
          {filter: "brightness(0)"}
        } src={`/wanikani/radical/${filename.replaceAll(' ', '-')}.png`} alt={filename}/>
      </div>
  );
};

export default WanikaniRadicalDisplay;
