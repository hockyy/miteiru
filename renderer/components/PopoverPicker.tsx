import React, {useCallback, useRef, useState} from "react";
import {HexAlphaColorPicker} from "react-colorful";
import {useClickOutside} from "../Hooks";


export const PopoverPicker = ({color, onChange}) => {
  const popover = useRef();
  const [isOpen, toggle] = useState(false);

  const close = useCallback(() => toggle(false), []);
  useClickOutside(popover, close);

  return (
      <div className="flex picker h-10 w-10 items-center">
        <div
            className="swatch"
            style={{backgroundColor: color}}
            onClick={() => toggle(true)}
        />

        {isOpen && (
            <div className="popover" ref={popover}>
              <HexAlphaColorPicker color={color} onChange={onChange}/>
            </div>
        )}
      </div>
  );
};
