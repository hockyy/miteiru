import {useState} from "react";

const mappingSpeedFunction = (val) => (val <= 0 ? 1 / (1 - val) : (val + 1));
export const Speed = ({player}) => {

  const [speed, setSpeed] = useState(0);
  return (
      <div className={"animation flex flex-row w-fit gap-4 items-center cursor-pointer px-4"}>
        {player != null &&
            <div
                className={"h-5 justify-self-end"}>{mappingSpeedFunction(speed).toPrecision(2)}×</div>}
        <div className={"flex w-20 lg:w-32 justify-center items-center"}>
          <input
              className={"slider"}
              type="range"
              aria-label="Playback speed"
              min={-1}
              max={2}
              step={0.02}
              value={speed}
              onChange={event => {
                const val = event.target.valueAsNumber;
                player.playbackRate(mappingSpeedFunction(val));
                setSpeed(val);
              }}
          />
        </div>
        <button className={"h-5 justify-self-end"} title="Reset to normal speed" onClick={() => {
          setSpeed(() => {
            player.playbackRate(1);
            return 0
          })
        }}>
          Speed
        </button>
      </div>
  )
}