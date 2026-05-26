import { useState, useCallback } from "react";

export function useFlash<T>(initial: T, duration = 2000): [T, (value: T) => void] {
  const [value, setValue] = useState(initial);

  const flash = useCallback(
    (val: T) => {
      setValue(val);
      setTimeout(() => setValue(initial), duration);
    },
    [initial, duration],
  );

  return [value, flash];
}
