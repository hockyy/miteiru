import {useState} from "react";

export default function Toggle({onChange, defaultCheck}) {
  const [enabled, setEnabled] = useState(defaultCheck);

  return (
      <div
          className="relative flex flex-col items-center justify-center overflow-hidden">
        <div className="flex">
          <label className="inline-flex relative items-center cursor-pointer">
            <input
                type="checkbox"
                className="sr-only peer"
                checked={enabled}
                readOnly
            />
            <div
                onClick={() => {
                  setEnabled(old => {
                    onChange(!old);
                    return !old;
                  });
                }}
                className="w-11 h-6 bg-gray-500 rounded-full peer peer-focus:ring-green-300  peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"
            ></div>
          </label>
        </div>
      </div>
  );
}