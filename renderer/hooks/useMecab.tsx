import {useState, useEffect} from 'react';
const useMecab = (miteiruApi) => {
  const [mecab, setMecab] = useState('');

  useEffect(() => {
    miteiruApi.invoke('getMecabCommand').then(val => {
      setMecab(val);
    });
  }, []);

  return mecab;
};

export default useMecab;
