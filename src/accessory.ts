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
	public batteryService: Service;

	private LockCurrentState: CharacteristicValue;
	private StatusLowBattery: CharacteristicValue;

	constructor(private readonly platform: AbodeLocksPlatform, private readonly accessory: PlatformAccessory) {
		this.accessory
			.getService(this.platform.Service.AccessoryInformation)!
			.setCharacteristic(this.platform.Characteristic.Manufacturer, "abode")
			.setCharacteristic(this.platform.Characteristic.Model, "Door Lock")
			.setCharacteristic(this.platform.Characteristic.SerialNumber, accessory.context.device.id)
			.setCharacteristic(this.platform.Characteristic.FirmwareRevision, accessory.context.device.version)
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

		this.batteryService =
			this.accessory.getService(this.platform.Service.BatteryService) ||
			this.accessory.addService(this.platform.Service.BatteryService);

		this.batteryService
			.getCharacteristic(this.platform.Characteristic.StatusLowBattery)
			.on(CharacteristicEventTypes.GET, this.getLowBatteryStatus.bind(this))
			.on(CharacteristicEventTypes.CHANGE, this.lowBatteryStatusChanged.bind(this));
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
		} catch (error) {
			this.platform.log.error("setLockState failed", error.message);
			callback(error);
		}
	}

	lockStateChanged(change: CharacteristicChange) {
		this.platform.log.debug("lockStateChanged", this.accessory.context.device.id);

		this.LockCurrentState = change.newValue;
	}

	getLowBatteryStatus(callback: CharacteristicGetCallback) {
		this.platform.log.debug("getLowBatteryStatus", this.accessory.context.device.id);

		callback(null, this.StatusLowBattery);
	}

	lowBatteryStatusChanged(change: CharacteristicChange) {
		this.platform.log.debug("lowBatteryStatusChanged", this.accessory.context.device.id);

		this.StatusLowBattery = change.newValue;
	}
}
