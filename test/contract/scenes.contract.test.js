import { SCENES, SCENE_NAMES } from "../../src/world/scenes/index.js";
import { describeEnvironmentContract } from "./environment.contract.js";

/* Every scene the gym ships is held to the same promise. A new scene joins
   this list the moment it is added to the index - nobody has to remember. */
for (const name of SCENE_NAMES) describeEnvironmentContract(name, SCENES[name]);
