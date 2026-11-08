/**
 * YouTube's embedded player handles its own streaming and seeking through Video.js.
 * Caption discovery runs separately in the background; native playback is used for local files.
 */
export {VideoJS as YouTubeVideo, VideoJS as default} from './VideoJS';
