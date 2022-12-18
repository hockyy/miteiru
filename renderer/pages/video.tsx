import {ipcRenderer} from "electron";
import React, {useCallback, useState} from "react";
import {useDropzone} from "react-dropzone";
import VideoJS from "../components/VideoJS";
import MiteiruPlayer from "../components/MiteiruPlayer";
import VideoReact from "../components/VideoReact";
import ReactPlayer from "react-player";


function Video() {
  const [videoSrc, setVideoSrc] = useState({src: '', type: ''})
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
      type: 'video/webm',
      src: `miteiru://${acceptedFiles[0].path}`
    }
    setVideoSrc(draggedVideo)
  }, [])
  const {getRootProps, getInputProps, isDragActive} = useDropzone({onDrop})

  return (
      <React.Fragment>
        <div>
          {/*<MiteiruPlayer videoSrc={videoSrc}/>*/}
          {/*<ReactPlayer url={videoSrc.src}/>*/}
          {/*<VideoReact videoSrc={videoSrc.src}/>*/}
          <VideoJS options={videoJsOptions} onReady={handlePlayerReady}/>
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