import {
	API,
	Characteristic,
	CharacteristicValue,
	DynamicPlatformPlugin,
	Logger,
	PlatformAccessory,
	PlatformConfig,
	Service,
} from "homebridge";
import { AbodeEvents, DEVICE_UPDATED, SOCKET_CONNECTED, SOCKET_DISCONNECTED } from "./abode/events";
import {
	AbodeLockDevice,
	AbodeLockStatus,
	AbodeLockStatusInt,
	abodeInit,
	getDevices,
	isDeviceTypeLock,
} from "./abode/api";
import { PLATFORM_NAME, PLUGIN_NAME } from "./constants";

import { AbodeLockAccessory } from "./accessory";

interface Config extends PlatformConfig {
	readonly email?: string;
	readonly password?: string;
}

export class AbodeLocksPlatform implements DynamicPlatformPlugin {
	public readonly Service: typeof Service = this.api.hap.Service;
	public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

	public readonly accessories: PlatformAccessory[] = [];

	private socketConnected = false;

	constructor(public readonly log: Logger, public readonly config: Config, public readonly api: API) {
		this.log.debug("Finished initializing platform:", this.config.name);

		this.api.on("didFinishLaunching", async () => {
			log.debug("Executed didFinishLaunching callback");

			if (!config.email || !config.password) {
				this.log.debug("Missing email or password.");
				return;
			}

			await abodeInit({
				email: config.email,
				password: config.password,
				logger: log,
				homebridgeVersion: api.serverVersion,
			});

			await this.discoverDevices();
			await this.updateStatus();

			AbodeEvents.on(SOCKET_CONNECTED, () => {
				this.socketConnected = true;
				log.debug("Socket connected");
			});
			AbodeEvents.on(SOCKET_DISCONNECTED, () => {
				this.socketConnected = false;
				log.debug("Socket disconnected");
				setTimeout(() => {
					if (!this.socketConnected) {
						this.setStatusUnknown();
					}
				}, 30000);
			});
			AbodeEvents.on(DEVICE_UPDATED, this.handleDeviceUpdated.bind(this));
		});
	}

	configureAccessory(accessory: PlatformAccessory) {
		this.log.info("Loading accessory from cache:", accessory.displayName);

		this.accessories.push(accessory);
	}

	async discoverDevices() {
		try {
			const devices = await getDevices();

			for (const device of devices) {
				if (!isDeviceTypeLock(device)) continue;

				const uuid = this.api.hap.uuid.generate(device.id);

				const existingAccessory = this.accessories.find((accessory) => accessory.UUID === uuid);

				if (existingAccessory) {
					if (device) {
						this.log.info("Restoring existing accessory from cache:", existingAccessory.displayName);

						existingAccessory.context.device = {
							id: device.id,
							name: device.name,
							version: device.version,
						};
						new AbodeLockAccessory(this, existingAccessory);

						this.api.updatePlatformAccessories([existingAccessory]);
					} else if (!device) {
						this.api.unregisterPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [existingAccessory]);
						this.log.info("Removing existing accessory from cache:", existingAccessory.displayName);
					}
				} else {
					this.log.info("Adding new accessory:", device.name);

					const accessory = new this.api.platformAccessory(device.name, uuid);
					accessory.context.device = {
						id: device.id,
						name: device.name,
						version: device.version,
					};

					new AbodeLockAccessory(this, accessory);

					this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
				}
			}
		} catch (error) {
			this.log.error("Failed to discoverDevices", error.message);
		}
	}

	async updateStatus() {
		try {
			const devices = await getDevices();

			for (const accessory of this.accessories) {
				const id = accessory.context.device.id;
				const device = devices.find((d) => d.id === id);
				if (!device) {
					this.log.warn("updateStatus did not find device", id);
					continue;
				}

				if (!isDeviceTypeLock(device)) {
					this.log.warn("updateStatus did not find device with lock type", id);
					continue;
				}

				const service = accessory.getService(this.Service.LockMechanism);
				if (!service) {
					this.log.warn("updateStatus did not find lock service for device", id);
					continue;
				}

				const currentState = this.convertAbodeLockStatusToLockCurrentState(device);

				service.getCharacteristic(this.Characteristic.LockCurrentState).updateValue(currentState);

				const batteryService = accessory.getService(this.Service.BatteryService);
				if (!batteryService) {
					this.log.warn("updateStatus did not find battery service for device", id);
					continue;
				}

				const batteryStatus = this.convertAbodeBatteryIntToStatusLowBattery(device.faults.low_battery);

				service.getCharacteristic(this.Characteristic.StatusLowBattery).updateValue(batteryStatus);
			}
		} catch (error) {
			this.log.error("Failed to updateStatus", error.message);
			this.setStatusUnknown();
		}
	}

	setStatusUnknown() {
		try {
			for (const accessory of this.accessories) {
				const service = accessory.getService(this.Service.LockMechanism);
				if (!service) {
					this.log.warn("updateStatus did not find lock service for device", accessory.context.device.id);
					continue;
				}

				service
					.getCharacteristic(this.Characteristic.LockCurrentState)
					.updateValue(this.Characteristic.LockCurrentState.UNKNOWN);
			}
		} catch (error) {
			this.log.error("Failed to handleUnresponsive", error.message);
		}
	}

	handleDeviceUpdated(deviceId: string) {
		this.log.debug("handleDeviceUpdated", deviceId);

		const device = this.accessories.find((a) => a.context.device.id === deviceId);
		if (device) {
			this.updateStatus();
		}
	}

	convertAbodeLockStatusToLockCurrentState(device: AbodeLockDevice): CharacteristicValue {
		if (device.faults.jammed === 1) {
			return this.Characteristic.LockCurrentState.JAMMED;
		}

		switch (device.status) {
			case AbodeLockStatus.Unlocked:
				return this.Characteristic.LockCurrentState.UNSECURED;
			case AbodeLockStatus.Locked:
				return this.Characteristic.LockCurrentState.SECURED;
			default:
				return this.Characteristic.LockCurrentState.UNKNOWN;
		}
	}

	convertLockTargetStateToAbodeLockStatusInt(value: CharacteristicValue): AbodeLockStatusInt {
		switch (value) {
			case this.Characteristic.LockTargetState.UNSECURED:
				return AbodeLockStatusInt.Unlocked;
			case this.Characteristic.LockTargetState.SECURED:
				return AbodeLockStatusInt.Locked;
			default:
				throw new Error(`Unexpected LockTargetState: ${value}`);
		}
	}

	convertAbodeBatteryIntToStatusLowBattery(status: number): CharacteristicValue {
		switch (status) {
			case 1:
				return this.Characteristic.StatusLowBattery.BATTERY_LEVEL_LOW;
			default:
				return this.Characteristic.StatusLowBattery.BATTERY_LEVEL_NORMAL;
		}
	}
}
