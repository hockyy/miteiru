import {ipcRenderer} from "electron";
import React, {useCallback, useState} from "react";
import {useDropzone} from "react-dropzone";
import VideoJS from "../components/VideoJS";

function Video() {
  const [videoSrc, setVideoSrc] = useState({src: ''})
  const playerRef = React.useRef(null);

  const videoJsOptions = {
    autoplay: true,
    controls: true,
    responsive: true,
    fluid: true,
    sources: [videoSrc]
  };
  const handlePlayerReady = (player) => {
    playerRef.current = player;

    // You can handle player events here, for example:
    player.on('waiting', () => {
      console.log('waiting')
    });

    player.on('dispose', () => {
      console.log('dispose')
    });
  };
  const onDrop = useCallback(acceptedFiles => {
    // const draggedVideo = {...acceptedFiles[0], src: `file:/${acceptedFiles[0].path}`}
    const draggedVideo = {
      type: acceptedFiles[0].type,
      src: `miteiru:///Users/hocky/Movies/Jackbox.mp4`
    }
    console.log(draggedVideo)
    ipcRenderer.send('load-video', draggedVideo)
    setVideoSrc(draggedVideo)
  }, [])
  const {getRootProps, getInputProps, isDragActive} = useDropzone({onDrop})

  return (
      <React.Fragment>
        <div>
          <video width="320" height="240" controls>
            <source src="miteiru:///Users/hocky/Movies/Jackbox.mp4"
                    type="video/mp4"/>
            {/*<source src="movie.ogg" type="video/ogg"/>*/}
            Your browser does not support the video tag.
          </video>
          {/*<VideoJS options={videoJsOptions} onReady={handlePlayerReady}/>*/}
          <div {...getRootProps()}>
            <input {...getInputProps()} />
            {
              isDragActive ?
                  <p>Drop the files here ...</p> :
                  <p>Drag 'n' drop some files here, or click to select files</p>
            }
          </div>
        </div>

      </React.Fragment>
  );
}

export default Video