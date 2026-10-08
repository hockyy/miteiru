import {useCallback, useRef} from 'react';

/**
 * Returns a function that runs async tasks one at a time, in call order: each task starts after
 * the previous one settles, whether it resolved or threw.
 */
export const useSerialRunner = () => {
  const tail = useRef<Promise<unknown>>(Promise.resolve());

  return useCallback(<T,>(task: () => Promise<T>): Promise<T> => {
    const run = tail.current.then(task, task);
    tail.current = run.catch(() => undefined);
    return run;
  }, []);
};
