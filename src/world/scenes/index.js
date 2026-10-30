/* Every scene the gym can open. Adding one is this file plus its own file,
   and nothing else anywhere. */
import classroom from "./classroom.js";
import lineTrack from "./line-track.js";
import outdoor from "./outdoor.js";

export const SCENES = { classroom, "line-track": lineTrack, outdoor };
export const SCENE_NAMES = Object.keys(SCENES);
export const DEFAULT_SCENE = "classroom";
