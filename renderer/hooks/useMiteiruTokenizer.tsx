import {useCallback, useEffect, useState} from "react";
import {getTokenizer} from "kuromojin";
import {ipcRenderer} from "electron";

const useMiteiruTokenizer = () => {
  const tokenizeMiteiru = useCallback(async (sentence) => {
    return await ipcRenderer.invoke('tokenizeUsingKuromoji', sentence);
  }, [])
  return {tokenizeMiteiru};
}

export default useMiteiruTokenizer;