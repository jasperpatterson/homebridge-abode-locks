import {
	CharacteristicChange,
	CharacteristicEventTypes,
	CharacteristicGetCallback,
	CharacteristicSetCallback,
	CharacteristicValue,
	PlatformAccessory,
	Service,
} from "homebridge";

import { AbodeLocksPlatform } from "./platform";
import { controlLock } from "./abode/api";

export class AbodeLockAccessory {
	public service: Service;

	private LockCurrentState: CharacteristicValue;

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
			.getCharacteristic(this.platform.Characteristic.LockCurrentState)
			.on(CharacteristicEventTypes.GET, this.getLockState.bind(this))
			.on(CharacteristicEventTypes.CHANGE, this.lockStateChanged.bind(this));

		this.service
			.getCharacteristic(this.platform.Characteristic.LockTargetState)
			.on(CharacteristicEventTypes.GET, this.getLockState.bind(this))
			.on(CharacteristicEventTypes.SET, this.setLockState.bind(this));
	}

	getLockState(callback: CharacteristicGetCallback) {
		this.platform.log.debug("getLockState", this.accessory.context.device.id);

		callback(null, this.LockCurrentState);
	}

	async setLockState(value: CharacteristicValue, callback: CharacteristicSetCallback) {
		this.platform.log.debug("setLockState", this.accessory.context.device.id, value);

		try {
			const status = this.platform.convertLockTargetStateToAbodeLockStatusInt(value);

			await controlLock(this.accessory.context.device.id, status);

			callback();

			setTimeout(() => {
				if (status !== this.LockCurrentState) {
					this.platform.log.debug("LockCurrentState does not match, force updating");
					this.platform.updateStatus();
				}
			}, 15000);
		} catch (error) {
			this.platform.log.error("setLockState failed", error.message);
			callback(error);
		}
	}

	lockStateChanged(change: CharacteristicChange) {
		this.platform.log.debug("lockStateChanged", this.accessory.context.device.id);

		this.LockCurrentState = change.newValue;
	}
}
