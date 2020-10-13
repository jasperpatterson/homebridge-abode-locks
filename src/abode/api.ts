import { default as http } from "axios";
import { v4 as uuid } from "uuid";

const credentials = {
	email: "",
	password: "",
};

export const setCredentials = (email: string, password: string): void => {
	credentials.email = email;
	credentials.password = password;
};

const DEVICE_UUID = uuid();

const auth = {
	session: "",
	apiKey: "",
	oauthToken: "",
};

const clearAuth = () => {
	auth.session = "";
	auth.apiKey = "";
	auth.oauthToken = "";
};

export const getAuthCookie = (): string => {
	return `SESSION=${auth.session};uuid=${DEVICE_UUID}`;
};

export const API_BASE_URL = "https://my.goabode.com";
export const USER_AGENT = "Homebridge";
export const ORIGIN = "https://my.goabode.com/";

http.interceptors.request.use(
	(config) => {
		if (!config.url) throw new Error("Missing URL.");

		const isAuthPath = config.url.startsWith("/api/auth2/");
		config.url = API_BASE_URL + config.url;

		config.headers["User-Agent"] = USER_AGENT;
		config.headers["Cookie"] = getAuthCookie();

		if (isAuthPath) return config;

		if (!auth.session) {
			throw new Error("Missing session.");
		}
		if (!auth.apiKey) {
			throw new Error("Missing API key.");
		}
		if (!auth.oauthToken) {
			throw new Error("Missing OAuth token.");
		}

		config.headers["Authorization"] = `Bearer ${auth.oauthToken}`;
		config.headers["ABODE-API-KEY"] = auth.apiKey;
		config.headers["Cookie"] = getAuthCookie();

		return config;
	},
	(error) => {
		return Promise.reject(error);
	},
);

export const session = async (): Promise<void> => {
	try {
		const oauthToken = await getOAuthToken();
		auth.oauthToken = oauthToken;
	} catch (_error) {
		await performAuth();
	}
};

const performAuth = async (): Promise<void> => {
	try {
		if (!credentials.email || !credentials.password) {
			throw new Error("Missing credentials.");
		}

		clearAuth();

		const authResponse = await http.post("/api/auth2/login", {
			id: credentials.email,
			password: credentials.password,
			uuid: DEVICE_UUID,
		});
		if (authResponse.status !== 200) {
			throw new Error("Received non-200 response.");
		}

		const apiKey = authResponse.data["token"];
		if (!apiKey) {
			throw new Error("Response did not contain API key.");
		}

		const cookieResponse = authResponse.headers["set-cookie"];
		const cookieDict = parseCookies((cookieResponse || []).join(";"));
		const session = cookieDict["SESSION"];
		if (!session) {
			throw new Error("Response did not contain session.");
		}

		auth.session = session;
		auth.apiKey = apiKey;

		const oauthToken = await getOAuthToken();
		auth.oauthToken = oauthToken;
	} catch (error) {
		throw new Error(`Failed to performAuth: ${error.message}`);
	}
};

const getOAuthToken = async () => {
	const claimsResponse = await http.get("/api/auth2/claims");
	if (claimsResponse.status !== 200) {
		throw new Error("Received non-200 response.");
	}

	const oauthToken = claimsResponse.data["access_token"];
	if (!oauthToken) {
		throw new Error("Response did not contain OAuth token.");
	}

	return oauthToken;
};

export const enum AbodeDeviceType {
	Lock = "device_type.door_lock",
}

export interface AbodeDevice {
	readonly id: string;
	readonly type_tag: AbodeDeviceType;
	readonly name: string;
}

export const enum AbodeLockStatus {
	Unlocked = "LockOpen",
	Locked = "LockClosed",
}

export const enum AbodeLockStatusInt {
	Unlocked = 0,
	Locked = 1,
}

export interface AbodeLockFaults {
	readonly low_battery: number;
	readonly jammed: number;
}

export interface AbodeLockDevice extends AbodeDevice {
	readonly type_tag: AbodeDeviceType.Lock;
	readonly status: AbodeLockStatus;
	readonly faults: AbodeLockFaults;
}

export const getDevices = async (): Promise<AbodeDevice[]> => {
	await session();
	const response = await http.get("/api/v1/devices");
	return response.data;
};

export interface AbodeControlLockResponse {
	readonly id: string;
	readonly status: AbodeLockStatusInt;
}

export const controlLock = async (id: string, status: AbodeLockStatusInt): Promise<AbodeControlLockResponse> => {
	await session();
	const response = await http.put(`/api/v1/control/lock/${id}`, { status });
	return response.data;
};

export const isDeviceTypeLock = (device: AbodeDevice): device is AbodeLockDevice => {
	return device.type_tag === AbodeDeviceType.Lock;
};

export const enum AbodeEventType {
	DeviceUpdate = "com.goabode.device.update",
}

const parseCookies = (cookies: string | undefined): { [key: string]: string | undefined } => {
	if (!cookies) return {};

	return cookies
		.split(";")
		.map((v) => v.split("="))
		.reduce((acc: { [key: string]: string }, v) => {
			acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim());
			return acc;
		}, {});
};
