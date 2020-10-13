import { API } from "homebridge";
import { AbodeLocksPlatform } from "./platform";
import { PLATFORM_NAME } from "./constants";

export = (api: API) => {
	api.registerPlatform(PLATFORM_NAME, AbodeLocksPlatform);
};
