import {
	CharacteristicEventTypes,
	CharacteristicSetCallback,
	CharacteristicValue,
	PlatformAccessory,
	Service,
} from "homebridge";

import { AbodeLocksPlatform } from "./platform";
import { controlLock } from "./abode/api";

export class AbodeLockAccessory {
	public service: Service;

	constructor(private readonly platform: AbodeLocksPlatform, private readonly accessory: PlatformAccessory) {
		this.accessory
			.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, "abode")
			.setCharacteristic(this.platform.Characteristic.Model, "Door Lock")
			.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id)
			.setCharacteristic(this.platform.Characteristic.AppMatchingIdentifier, "com.abode.abode");

		this.service =
			this.accessory.getService(this.platform.Service.LockMechanism) ||
			this.accessory.addService(this.platform.Service.LockMechanism);

		this.service.setCharacteristic(this.platform.Characteristic.Name, accessory.context.device.name);

		this.service
			.getCharacteristic(this.platform.Characteristic.LockTargetState)
			.on(CharacteristicEventTypes.SET, this.setLockState.bind(this));
	}

	async setLockState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
		this.platform.log.debug("setLockState", this.accessory.context.device.id, value);

		try {
			const status = this.platform.convertLockTargetStateToAbodeLockStatusInt(value);
			await controlLock(this.accessory.context.device.id, status);
			callback();
		} catch (error) {
			this.platform.log.error("setLockState failed", error.message);
			callback(error);
		}
	}
}
