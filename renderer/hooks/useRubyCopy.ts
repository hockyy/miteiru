import {useState} from 'react';

const useRubyCopy = () => {
  const [rubyContent, setRubyContent] = useState('');
  return [rubyContent, setRubyContent];
};

export default useRubyCopy;