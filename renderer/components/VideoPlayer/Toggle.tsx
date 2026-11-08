import React, {useCallback} from "react";

export default function Toggle({onChange, isChecked, label, disabled = false}: {
  onChange: (checked: boolean) => void;
  isChecked: boolean;
  // Accessible name of the switch when no visible label wraps it.
  label?: string;
  // Dimmed and not clickable.
  disabled?: boolean;
}) {

  const handleChange = useCallback((e) => {
    const isChecked = e.target.checked;
    onChange(isChecked);
  }, [onChange]);

  return (
      <div
          className="relative flex flex-col items-center justify-center overflow-hidden">
        <div className="flex">
          <label className={`inline-flex relative items-center ${disabled ? "cursor-not-allowed opacity-40" : "cursor-pointer"}`}>
            <input
                type="checkbox"
                role="switch"
                aria-label={label}
                aria-disabled={disabled || undefined}
                disabled={disabled}
                className="sr-only peer"
                checked={isChecked}
                onChange={handleChange}
            />
            <div
                className="w-11 h-6 bg-gray-500 rounded-full peer peer-focus-visible:ring-2 peer-focus-visible:ring-blue-400 peer-focus-visible:ring-offset-1 peer-focus-visible:ring-offset-slate-900 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-green-600"
            ></div>
          </label>
        </div>
      </div>
  );
}
