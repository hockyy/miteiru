import {useState} from "react";
import {Queue} from "async-await-queue";

export const useAsyncAwaitQueue = () => {
  const [queue] = useState(new Queue(1));
  return queue;
}