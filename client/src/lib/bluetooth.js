/**
 * Web Bluetooth connector for standard GATT health devices (Chrome, Edge,
 * Opera on desktop and Android; not Firefox or iOS Safari). Requires HTTPS or
 * localhost and a user click (browser security rule).
 *
 * Works with any wearable that exposes the Bluetooth SIG profiles, e.g. chest
 * straps and many watches in "broadcast heart rate" mode (0x180D), clinical
 * thermometers (0x1809) and blood-pressure cuffs (0x1810).
 */
import { BLE_PROFILES, parseHeartRate, parseTemperature, parseBloodPressure } from './telemetry.js';

const PARSERS = { heartRate: parseHeartRate, thermometer: parseTemperature, bloodPressure: parseBloodPressure };

export function bluetoothSupport() {
  if (typeof navigator === 'undefined' || !navigator.bluetooth) {
    return { supported: false, reason: 'This browser has no Web Bluetooth. Use Chrome or Edge on a desktop or Android device, or send data through the gateway API.' };
  }
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    return { supported: false, reason: 'Web Bluetooth needs HTTPS (or localhost).' };
  }
  return { supported: true, reason: '' };
}

/**
 * Ask the user to pick a device and stream its measurements.
 * @param {'heartRate'|'thermometer'|'bloodPressure'} profileKey
 * @param {(samples: Array<{metric, value, ts}>, device: {id, name}) => void} onSamples
 * @returns {Promise<{ device: {id, name}, disconnect: () => void }>}
 */
export async function connectBluetooth(profileKey, onSamples, onDisconnect) {
  const profile = BLE_PROFILES[profileKey];
  const parse = PARSERS[profileKey];
  const device = await navigator.bluetooth.requestDevice({ filters: [{ services: [profile.service] }] });
  const server = await device.gatt.connect();
  const service = await server.getPrimaryService(profile.service);
  const characteristic = await service.getCharacteristic(profile.characteristic);
  const info = { id: device.id, name: device.name || profile.label };
  const handler = (event) => {
    try {
      const values = parse(event.target.value);
      const ts = new Date().toISOString();
      const samples = Object.entries(values)
        .filter(([, v]) => Number.isFinite(v))
        .map(([metric, value]) => ({ metric, value, ts }));
      if (samples.length) onSamples(samples, info);
    } catch (err) {
      console.warn('Could not parse Bluetooth measurement', err);
    }
  };
  characteristic.addEventListener('characteristicvaluechanged', handler);
  device.addEventListener('gattserverdisconnected', () => onDisconnect?.(info));
  await characteristic.startNotifications();
  return {
    device: info,
    disconnect: () => {
      characteristic.removeEventListener('characteristicvaluechanged', handler);
      if (device.gatt.connected) device.gatt.disconnect();
    },
  };
}
