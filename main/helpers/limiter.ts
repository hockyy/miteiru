/**
 * Runs at most `size` tasks at once; the others wait their turn, in the order they came. A task that
 * fails frees its place like one that succeeds.
 */
export const limiter = (size: number) => {
  let running = 0;
  const waiting: Array<() => void> = [];
  return async <T>(task: () => Promise<T> | T): Promise<T> => {
    if (running < size) running++;
    // A finishing task hands its place straight to the next one, so nobody can jump the queue.
    else await new Promise<void>((resolve) => waiting.push(resolve));
    try {
      return await task();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else running--;
    }
  };
};
