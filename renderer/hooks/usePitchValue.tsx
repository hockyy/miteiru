import {useState} from "react";

const usePitchValue = () => {
  const [pitchValue, setPitchValue] = useState(1);
  return {pitchValue, setPitchValue};
}

export default usePitchValue;