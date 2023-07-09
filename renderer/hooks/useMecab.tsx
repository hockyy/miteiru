import {useState, useEffect} from 'react';
import {ipcRenderer} from "electron";

const useMecab = () => {
  const [mecab, setMecab] = useState('');

  useEffect(() => {
    ipcRenderer.invoke('getMecabCommand').then(val => {
      setMecab(val);
    });
  }, []);

  return mecab;
};

export default useMecab;
