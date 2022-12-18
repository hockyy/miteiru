import React from 'react';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';

export const MiteiruPlayer = ({videoSrc}) => {
  return (<video width="320" height="240" controls>
    <source src={videoSrc.src}
            type={videoSrc.type}/>
    {/*<source src="movie.ogg" type="video/ogg"/>*/}
    Your browser does not support the video tag.
  </video>)
}

export default MiteiruPlayer;