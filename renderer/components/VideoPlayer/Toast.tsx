import {useEffect, useState} from "react";

export const TOAST_TIMEOUT = 3000

const toastHidden = ["", "hidden"]
export const Toast = ({info}) => {
  const [lastToast, setLastToast] = useState(info)
  useEffect(() => {
    if (info.message !== '') {
      setTimeout(() => {
        (function () {
          setLastToast(info)
        })();
      }, TOAST_TIMEOUT)
    }
    return;
  }, [info])
  return <div
      className={"animation z-[18] right-3 top-3 fixed bg-gray-800 p-3 rounded-lg unselectable " + toastHidden[+(lastToast === info)]}>
    {info.message}
  </div>
}

export default Toast;