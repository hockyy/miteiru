import {useState, useEffect} from 'react';
import {useMiteiruApi} from "./useMiteiruApi";
const useMecab = () => {
  const [mecab, setMecab] = useState('');
  const {miteiruApi} = useMiteiruApi();

  useEffect(() => {
    miteiruApi.invoke('getMecabCommand').then(val => {
      setMecab(val);
    });
  }, []);

  return mecab;
};

export default useMecab;
