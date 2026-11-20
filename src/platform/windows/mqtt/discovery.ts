/**
 * Home Assistant MQTT discovery for FreeKiosk on Windows.
 * Publishes discovery messages so HA auto-configures entities.
 */

export interface DiscoveryConfig {
  deviceName: string;
  manufacturer: string;
  model: string;
  firmwareVersion: string;
  serialNumber?: string;
  hostname?: string;
}

export interface DiscoveryEntity {
  component: string;
  nodeId: string;
  objectId: string;
  config: Record<string, unknown>;
}

const HA_DISCOVERY_PREFIX = 'homeassistant';

export function buildDeviceInfo(config: DiscoveryConfig): Record<string, unknown> {
  return {
    identifiers: [`freekiosk_${config.serialNumber || config.hostname || 'windows'}`],
    name: config.deviceName,
    manufacturer: config.manufacturer,
    model: config.model,
    sw_version: config.firmwareVersion,
    ...(config.serialNumber && { serial_number: config.serialNumber }),
    ...(config.hostname && { configuration_url: `http://${config.hostname}:8080` }),
  };
}

export function buildDiscoveryTopic(component: string, nodeId: string, objectId: string): string {
  return `${HA_DISCOVERY_PREFIX}/${component}/${nodeId}/${objectId}/config`;
}

export function buildSensorDiscovery(
  config: DiscoveryConfig,
  nodeId: string,
  objectId: string,
  name: string,
  unit?: string,
  deviceClass?: string,
  stateClass?: string,
  icon?: string,
): DiscoveryEntity {
  const device = buildDeviceInfo(config);
  return {
    component: 'sensor',
    nodeId,
    objectId,
    config: {
      name,
      state_topic: `freekiosk/${nodeId}/state`,
      value_template: `{{ value_json.${objectId} }}`,
      ...(unit && { unit_of_measurement: unit }),
      ...(deviceClass && { device_class: deviceClass }),
      ...(stateClass && { state_class: stateClass }),
      ...(icon && { icon }),
      device,
      unique_id: `${nodeId}_${objectId}`,
      availability_topic: `freekiosk/${nodeId}/availability`,
      payload_available: 'online',
      payload_not_available: 'offline',
    },
  };
}

export function buildBinarySensorDiscovery(
  config: DiscoveryConfig,
  nodeId: string,
  objectId: string,
  name: string,
  deviceClass?: string,
  icon?: string,
): DiscoveryEntity {
  const device = buildDeviceInfo(config);
  return {
    component: 'binary_sensor',
    nodeId,
    objectId,
    config: {
      name,
      state_topic: `freekiosk/${nodeId}/state`,
      value_template: `{{ value_json.${objectId} }}`,
      ...(deviceClass && { device_class: deviceClass }),
      ...(icon && { icon }),
      device,
      unique_id: `${nodeId}_${objectId}`,
      availability_topic: `freekiosk/${nodeId}/availability`,
      payload_available: 'online',
      payload_not_available: 'offline',
    },
  };
}

export function buildSwitchDiscovery(
  config: DiscoveryConfig,
  nodeId: string,
  objectId: string,
  name: string,
  commandTopic: string,
  stateTopic: string,
  icon?: string,
): DiscoveryEntity {
  const device = buildDeviceInfo(config);
  return {
    component: 'switch',
    nodeId,
    objectId,
    config: {
      name,
      command_topic: commandTopic,
      state_topic: stateTopic,
      value_template: `{{ value_json.${objectId} }}`,
      ...(icon && { icon }),
      device,
      unique_id: `${nodeId}_${objectId}`,
      availability_topic: `freekiosk/${nodeId}/availability`,
      payload_available: 'online',
      payload_not_available: 'offline',
    },
  };
}

export function buildNumberDiscovery(
  config: DiscoveryConfig,
  nodeId: string,
  objectId: string,
  name: string,
  commandTopic: string,
  stateTopic: string,
  min: number,
  max: number,
  step: number,
  unit?: string,
  icon?: string,
): DiscoveryEntity {
  const device = buildDeviceInfo(config);
  return {
    component: 'number',
    nodeId,
    objectId,
    config: {
      name,
      command_topic: commandTopic,
      state_topic: stateTopic,
      value_template: `{{ value_json.${objectId} }}`,
      min,
      max,
      step,
      ...(unit && { unit_of_measurement: unit }),
      ...(icon && { icon }),
      device,
      unique_id: `${nodeId}_${objectId}`,
      availability_topic: `freekiosk/${nodeId}/availability`,
      payload_available: 'online',
      payload_not_available: 'offline',
    },
  };
}

export function buildSelectDiscovery(
  config: DiscoveryConfig,
  nodeId: string,
  objectId: string,
  name: string,
  commandTopic: string,
  stateTopic: string,
  options: string[],
  icon?: string,
): DiscoveryEntity {
  const device = buildDeviceInfo(config);
  return {
    component: 'select',
    nodeId,
    objectId,
    config: {
      name,
      command_topic: commandTopic,
      state_topic: stateTopic,
      value_template: `{{ value_json.${objectId} }}`,
      options,
      ...(icon && { icon }),
      device,
      unique_id: `${nodeId}_${objectId}`,
      availability_topic: `freekiosk/${nodeId}/availability`,
      payload_available: 'online',
      payload_not_available: 'offline',
    },
  };
}

export function buildButtonDiscovery(
  config: DiscoveryConfig,
  nodeId: string,
  objectId: string,
  name: string,
  commandTopic: string,
  icon?: string,
): DiscoveryEntity {
  const device = buildDeviceInfo(config);
  return {
    component: 'button',
    nodeId,
    objectId,
    config: {
      name,
      command_topic: commandTopic,
      payload_press: 'PRESS',
      ...(icon && { icon }),
      device,
      unique_id: `${nodeId}_${objectId}`,
      availability_topic: `freekiosk/${nodeId}/availability`,
      payload_available: 'online',
      payload_not_available: 'offline',
    },
  };
}

export function buildTextDiscovery(
  config: DiscoveryConfig,
  nodeId: string,
  objectId: string,
  name: string,
  commandTopic: string,
  stateTopic: string,
  icon?: string,
): DiscoveryEntity {
  const device = buildDeviceInfo(config);
  return {
    component: 'text',
    nodeId,
    objectId,
    config: {
      name,
      command_topic: commandTopic,
      state_topic: stateTopic,
      value_template: `{{ value_json.${objectId} }}`,
      ...(icon && { icon }),
      device,
      unique_id: `${nodeId}_${objectId}`,
      availability_topic: `freekiosk/${nodeId}/availability`,
      payload_available: 'online',
      payload_not_available: 'offline',
    },
  };
}

// Generate all discovery entities for FreeKiosk
export function generateDiscoveryEntities(config: DiscoveryConfig): DiscoveryEntity[] {
  const nodeId = 'freekiosk';
  const entities: DiscoveryEntity[] = [];

  // Sensors
  entities.push(buildSensorDiscovery(config, nodeId, 'battery_level', 'Battery Level', '%', 'battery', 'measurement', 'mdi:battery'));
  entities.push(buildSensorDiscovery(config, nodeId, 'brightness', 'Brightness', '%', 'brightness', 'measurement', 'mdi:brightness-6'));
  entities.push(buildSensorDiscovery(config, nodeId, 'volume', 'Volume', '%', 'volume', 'measurement', 'mdi:volume-high'));
  entities.push(buildSensorDiscovery(config, nodeId, 'uptime', 'Uptime', 's', 'duration', 'measurement', 'mdi:clock-outline'));
  entities.push(buildSensorDiscovery(config, nodeId, 'free_storage', 'Free Storage', 'GB', 'data_size', 'measurement', 'mdi:harddisk'));
  entities.push(buildSensorDiscovery(config, nodeId, 'total_storage', 'Total Storage', 'GB', 'data_size', 'measurement', 'mdi:harddisk'));
  entities.push(buildSensorDiscovery(config, nodeId, 'free_memory', 'Free Memory', 'MB', 'data_size', 'measurement', 'mdi:memory'));
  entities.push(buildSensorDiscovery(config, nodeId, 'wifi_ssid', 'WiFi SSID', undefined, undefined, undefined, 'mdi:wifi'));
  entities.push(buildSensorDiscovery(config, nodeId, 'wifi_signal', 'WiFi Signal', 'dBm', 'signal_strength', 'measurement', 'mdi:wifi-strength-3'));

  // Binary sensors
  entities.push(buildBinarySensorDiscovery(config, nodeId, 'screen_on', 'Screen On', 'running', 'mdi:monitor'));
  entities.push(buildBinarySensorDiscovery(config, nodeId, 'charging', 'Charging', 'battery_charging', 'mdi:power-plug'));
  entities.push(buildBinarySensorDiscovery(config, nodeId, 'kiosk_enabled', 'Kiosk Mode', 'lock', 'mdi:lock'));
  entities.push(buildBinarySensorDiscovery(config, nodeId, 'wifi_connected', 'WiFi Connected', 'connectivity', 'mdi:wifi'));

  // Switches
  entities.push(buildSwitchDiscovery(config, nodeId, 'screen_on', 'Screen On/Off', 'freekiosk/command/screen', 'freekiosk/state', 'mdi:monitor'));
  entities.push(buildSwitchDiscovery(config, nodeId, 'kiosk_enabled', 'Kiosk Mode', 'freekiosk/command/kiosk', 'freekiosk/state', 'mdi:lock'));

  // Numbers
  entities.push(buildNumberDiscovery(config, nodeId, 'brightness', 'Brightness', 'freekiosk/command/brightness', 'freekiosk/state', 0, 100, 1, '%', 'mdi:brightness-6'));
  entities.push(buildNumberDiscovery(config, nodeId, 'volume', 'Volume', 'freekiosk/command/volume', 'freekiosk/state', 0, 100, 1, '%', 'mdi:volume-high'));

  // Buttons
  entities.push(buildButtonDiscovery(config, nodeId, 'reload', 'Reload Page', 'freekiosk/command/reload', 'mdi:refresh'));
  entities.push(buildButtonDiscovery(config, nodeId, 'screenshot', 'Screenshot', 'freekiosk/command/screenshot', 'mdi:camera'));
  entities.push(buildButtonDiscovery(config, nodeId, 'restart', 'Restart App', 'freekiosk/command/restart', 'mdi:restart'));

  return entities;
}

// Build state payload
export function buildStatePayload(state: Record<string, unknown>): string {
  return JSON.stringify(state);
}

// Build availability payload
export function buildAvailabilityPayload(available: boolean): string {
  return available ? 'online' : 'offline';
}
