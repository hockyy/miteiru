import {useState} from "react";
import {MiteiruAPI} from "../../main/preload";
import useSWR from "swr";

export const useMiteiruApi = () => {
  const [miteiruApi, setMiteiruApi] = useState<typeof MiteiruAPI>(null);
  useSWR("miteiru", () => {
    setMiteiruApi((window as any).miteiru);
  });
  return {miteiruApi}
}