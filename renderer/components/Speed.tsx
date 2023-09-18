import {useState} from "react";

export const Speed = ({player}) => {

  const [speed, setSpeed] = useState(1);

  return (
      <div className={"animation flex flex-row w-fit gap-4 items-center cursor-pointer px-4"}>


        <div className={"flex w-20 justify-center items-center"}>
          <input
              className={"slider"}
              type="range"
              min={0.5}
              max={3}
              step={0.02}
              value={speed}
              onChange={event => {
                setSpeed(event.target.valueAsNumber)
                player.playbackRate(event.target.valueAsNumber)
              }}
          />
        </div>
        <div className={"h-5 justify-self-end"} onClick={() => {
          setSpeed(() => {
            player.playbackRate(1);
            return 1
          })
        }}>
          Speed
        </div>
      </div>
  )
}