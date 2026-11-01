/* The one room the gym has. Adding another is this file plus its own
   file, and nothing else anywhere. */
import classroom from "./classroom.js";

export const SCENES = { classroom };
export const SCENE_NAMES = Object.keys(SCENES);
export const DEFAULT_SCENE = "classroom";
