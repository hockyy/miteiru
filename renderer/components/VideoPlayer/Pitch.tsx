import {useState} from "react";

export const Pitch = ({setPitchValue}) => {
  const [pitch, setPitch] = useState(0);

  return (
      <div className={"animation flex flex-row w-fit gap-4 items-center cursor-pointer px-4"}>
        <div className={"h-5 justify-self-end"}>
          {pitch > 0 ? `+${pitch}` : pitch}
        </div>
        <div className={"flex w-32 justify-center items-center"}>
          <input
              className={"slider"}
              type="range"
              min={-5}
              max={5}
              step={1}
              value={pitch}
              onChange={event => {
                const val = event.target.valueAsNumber;
                setPitchValue(val);
                setPitch(val);
              }}
          />
        </div>
        <div className={"h-5 justify-self-end"} onClick={() => {
          setPitch(() => {
            setPitchValue(0);
            return 0;
          });
        }}>
          Pitch
        </div>
      </div>
  );
};
