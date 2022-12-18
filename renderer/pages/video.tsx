import React from "react";

function Video() {
  return (
      <React.Fragment>
        <div>
          <video width="320" height="240" controls>
            <source src="movie.mp4" type="video/mp4"/>
            <source src="movie.ogg" type="video/ogg"/>
            Your browser does not support the video tag.
          </video>
        </div>

      </React.Fragment>
  );
}

export default Video