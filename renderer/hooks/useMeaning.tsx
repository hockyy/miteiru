import {useState} from "react";

const useMeaning = () => {

  const [meaning, setMeaning] = useState('');
  return {meaning, setMeaning};
}

export default useMeaning;