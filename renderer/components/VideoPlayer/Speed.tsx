import {useState} from "react";
import {rangeFillStyle} from "../../utils/utils";

const mappingSpeedFunction = (val) => (val <= 0 ? 1 / (1 - val) : (val + 1));
export const Speed = ({player}) => {

  const [speed, setSpeed] = useState(0);
  const resetSpeed = () => {
    player.playbackRate(1);
    setSpeed(0);
  };
  return (
      <div className={"animation flex flex-row w-fit gap-2 lg:gap-4 items-center cursor-pointer px-2 lg:px-4"}>
        {player != null &&
            <button className={"h-5 leading-5 justify-self-end whitespace-nowrap tabular-nums"} title="Reset to normal speed"
                    onClick={resetSpeed}>{mappingSpeedFunction(speed).toPrecision(2)}×</button>}
        <div className={"flex w-20 lg:w-32 justify-center items-center"}>
          <input
              className={"slider"}
              type="range"
              aria-label="Playback speed"
              min={-1}
              max={2}
              step={0.02}
              value={speed}
              style={rangeFillStyle(speed, -1, 2)}
              onChange={event => {
                const val = event.target.valueAsNumber;
                player.playbackRate(mappingSpeedFunction(val));
                setSpeed(val);
              }}
          />
        </div>
        {/* A label, and the same reset as the rate, where there is room for it. */}
        <button className={"h-5 leading-5 justify-self-end hidden lg:block"} title="Reset to normal speed" onClick={resetSpeed}>
          Speed
        </button>
      </div>
  )
}