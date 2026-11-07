import {useState} from "react";
import type {ToastInfo} from "../components/VideoPlayer/Toast";

const useMiteiruToast = () => {
  const [toastInfo, setToastInfo] = useState<ToastInfo>({message: 'coba', update: ''});
  return {toastInfo, setToastInfo};
}

export default useMiteiruToast;
