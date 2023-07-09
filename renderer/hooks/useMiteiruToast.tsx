import {useState} from "react";

const useMiteiruToast = () => {
  const [toastInfo, setToastInfo] = useState({message: 'coba', update: ''});
  return {toastInfo, setToastInfo};
}

export default useMiteiruToast;