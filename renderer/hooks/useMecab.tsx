import {useState, useEffect} from 'react';
const useMecab = (miteiruApi) => {
  const [mecab, setMecab] = useState('');

  useEffect(() => {
    if(!miteiruApi) return;
    miteiruApi.invoke('getMecabCommand').then(val => {
      setMecab(val);
    });
  }, [miteiruApi]);

  return mecab;
};

export default useMecab;
