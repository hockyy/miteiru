import * as promises from './fsImpl';

export {promises};
export {constants, createReadStream, createWriteStream, Stats, Dirent} from './fsImpl';

export default {
  promises,
  constants: promises.constants,
  createReadStream: promises.createReadStream,
  createWriteStream: promises.createWriteStream
};
