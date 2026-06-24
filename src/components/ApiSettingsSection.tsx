/**
 * ApiSettingsSection.tsx
 * Settings section for REST API / Home Assistant integration
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Clipboard,
  ActivityIndicator,
  Platform,
} from 'react-native';
import SettingsSection from './settings/SettingsSection';
import SettingsSwitch from './settings/SettingsSwitch';
import SettingsInput from './settings/SettingsInput';
import Icon from './Icon';
import { StorageService } from '../utils/storage';
import { httpServer } from '../utils/HttpServerModule';
import { screenCapture } from '../utils/ScreenCaptureModule';
import { mdmAgent } from '../utils/MdmAgentModule';

interface ApiSettingsSectionProps {
  onSettingsChanged?: () => void;
}

export const ApiSettingsSection: React.FC<ApiSettingsSectionProps> = ({
  onSettingsChanged,
}) => {
  const [apiEnabled, setApiEnabled] = useState(false);
  const [apiPort, setApiPort] = useState('8080');
  const [apiKey, setApiKey] = useState('');
  const [allowControl, setAllowControl] = useState(true);
  const [remoteScreenshot, setRemoteScreenshot] = useState(false);
  const [remoteScreenshotActive, setRemoteScreenshotActive] = useState(false);
  const [serverRunning, setServerRunning] = useState(false);
  const [localIp, setLocalIp] = useState('0.0.0.0');
  const [isLoading, setIsLoading] = useState(false);

  // MDM outbound agent
  const [mdmEnabled, setMdmEnabled] = useState(false);
  const [mdmWsUrl, setMdmWsUrl] = useState('');
  const [mdmEnrollToken, setMdmEnrollToken] = useState('');
  const [mdmConnected, setMdmConnected] = useState(false);
  const [mdmDeviceId, setMdmDeviceId] = useState(0);
  const [mdmEnrolled, setMdmEnrolled] = useState(false);
  const [mdmLoading, setMdmLoading] = useState(false);

  // Load settings on mount
  useEffect(() => {
    loadSettings();
  }, []);

  // Check server status periodically
  useEffect(() => {
    const checkStatus = async () => {
      const running = await httpServer.isRunning();
      setServerRunning(running);
      if (running) {
        const info = await httpServer.getServerInfo();
        setLocalIp(info.ip);
      }
      const captureActive = await screenCapture.isActive();
      setRemoteScreenshotActive(captureActive);

      if (Platform.OS === 'android') {
        const info = await mdmAgent.getAgentInfo();
        setMdmEnabled(info.enabled);
        setMdmWsUrl(info.wsUrl || '');
        setMdmConnected(info.connected);
        setMdmDeviceId(info.deviceId);
        setMdmEnrolled(info.enrolled);
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadSettings = async () => {
    const [enabled, port, key, control, remoteShot] = await Promise.all([
      StorageService.getRestApiEnabled(),
      StorageService.getRestApiPort(),
      StorageService.getRestApiKey(),
      StorageService.getRestApiAllowControl(),
      StorageService.getRestApiRemoteScreenshot(),
    ]);

    setApiEnabled(enabled);
    setApiPort(port.toString());
    setApiKey(key);
    setAllowControl(control);
    setRemoteScreenshot(remoteShot);
    const active = await screenCapture.isActive();
    setRemoteScreenshotActive(active);
    if (remoteShot && !active) {
      // Preference saved but MediaProjection was stopped (e.g. by kiosk mode) — user must re-enable.
      await StorageService.saveRestApiRemoteScreenshot(false);
      setRemoteScreenshot(false);
    }

    // Always sync server state with stored settings.
    // If the server is already running (started by KioskScreen) but with a stale config
    // (e.g. a previously-set API key that was later cleared), restart it so that the
    // running server always reflects what is shown in the settings UI.
    const isRunning = await httpServer.isRunning();
    if (enabled) {
      if (isRunning) {
        // Stop the potentially-stale instance, then start fresh with current settings.
        try { await httpServer.stopServer(); } catch (_) { /* ignore */ }
      }
      startServer(port, key, control);
    } else if (isRunning) {
      // API was disabled while server was left running – stop it.
      await stopServer();
    }
  };

  const startServer = async (port: number, key: string, control: boolean) => {
    setIsLoading(true);
    try {
      const result = await httpServer.startServer(port, key || null, control);
      setServerRunning(true);
      setLocalIp(result.ip);
    } catch (error: any) {
      console.error('Failed to start server:', error);
      Alert.alert('Error', `Failed to start API server: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const stopServer = async () => {
    setIsLoading(true);
    try {
      await httpServer.stopServer();
      setServerRunning(false);
    } catch (error: any) {
      console.error('Failed to stop server:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleApiEnabledChange = async (enabled: boolean) => {
    setApiEnabled(enabled);
    await StorageService.saveRestApiEnabled(enabled);

    if (enabled) {
      const port = parseInt(apiPort, 10) || 8080;
      await startServer(port, apiKey, allowControl);
    } else {
      await stopServer();
    }

    onSettingsChanged?.();
  };

  const handlePortChange = async (value: string) => {
    setApiPort(value);
    const port = parseInt(value, 10);
    if (!isNaN(port) && port >= 1024 && port <= 65535) {
      await StorageService.saveRestApiPort(port);
      
      // Restart server if it is actually running (avoid stale React state)
      const isCurrentlyRunning = await httpServer.isRunning();
      if (isCurrentlyRunning) {
        await stopServer();
        await startServer(port, apiKey, allowControl);
      }
      
      onSettingsChanged?.();
    }
  };

  const handleApiKeyChange = async (value: string) => {
    setApiKey(value);
    await StorageService.saveRestApiKey(value);
    
    // Restart server if it is actually running (avoid stale React state)
    const isCurrentlyRunning = await httpServer.isRunning();
    if (isCurrentlyRunning) {
      const port = parseInt(apiPort, 10) || 8080;
      await stopServer();
      await startServer(port, value, allowControl);
    }
    
    onSettingsChanged?.();
  };

  const handleAllowControlChange = async (value: boolean) => {
    setAllowControl(value);
    await StorageService.saveRestApiAllowControl(value);
    
    // Restart server if it is actually running (avoid stale React state)
    const isCurrentlyRunning = await httpServer.isRunning();
    if (isCurrentlyRunning) {
      const port = parseInt(apiPort, 10) || 8080;
      await stopServer();
      await startServer(port, apiKey, value);
    }
    
    onSettingsChanged?.();
  };

  const handleRemoteScreenshotChange = async (value: boolean) => {
    if (value) {
      try {
        await screenCapture.requestPermission();
        setRemoteScreenshot(true);
        setRemoteScreenshotActive(true);
        await StorageService.saveRestApiRemoteScreenshot(true);
        Alert.alert(
          'Remote Screenshot Enabled',
          'Full-screen capture is active for /api/screenshot.\n\n' +
            '• Keep the screen-recording notification visible\n' +
            '• Enable this before or after kiosk mode — if Live View shows only the dashboard, toggle off and on again\n' +
            '• External apps in Multi-App mode are included when capture is active'
        );
      } catch (error: any) {
        setRemoteScreenshot(false);
        setRemoteScreenshotActive(false);
        await StorageService.saveRestApiRemoteScreenshot(false);
        Alert.alert(
          'Permission Required',
          error?.message || 'Screen capture permission was denied. Full-screen screenshots require this one-time consent.'
        );
      }
    } else {
      try {
        await screenCapture.stop();
      } catch (_) {
        // ignore
      }
      setRemoteScreenshot(false);
      setRemoteScreenshotActive(false);
      await StorageService.saveRestApiRemoteScreenshot(false);
    }

    onSettingsChanged?.();
  };

  const generateApiKey = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let key = '';
    for (let i = 0; i < 32; i++) {
      key += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    handleApiKeyChange(key);
  };

  const copyToClipboard = (text: string, label: string) => {
    Clipboard.setString(text);
    Alert.alert('Copied', `${label} copied to clipboard`);
  };

  const getApiUrl = () => {
    const port = parseInt(apiPort, 10) || 8080;
    return `http://${localIp}:${port}`;
  };

  const handleMdmEnabledChange = async (enabled: boolean) => {
    if (Platform.OS !== 'android') return;

    setMdmLoading(true);
    try {
      if (enabled) {
        if (!mdmWsUrl.trim()) {
          Alert.alert('MDM URL required', 'Enter the MDM WebSocket URL (wss://your-mdm/api/agent/ws).');
          await refreshMdmAgentInfo();
          return;
        }

        const info = await mdmAgent.getAgentInfo();
        const enrollmentToken = mdmEnrollToken.trim();
        if (!info.enrolled && !enrollmentToken) {
          Alert.alert(
            'Enrollment token required',
            'Enter an enrollment token (e.g. debug) before connecting. Use Re-enroll if you need to enroll again.'
          );
          await refreshMdmAgentInfo();
          return;
        }

        await mdmAgent.configure(mdmWsUrl.trim(), enrollmentToken || null);
        await mdmAgent.startAgent();
      } else {
        await mdmAgent.stopAgent();
      }
      await refreshMdmAgentInfo();
      onSettingsChanged?.();
    } catch (error: any) {
      Alert.alert('MDM Agent', error?.message || 'Failed to update MDM agent');
      await refreshMdmAgentInfo();
    } finally {
      setMdmLoading(false);
    }
  };

  const handleMdmWsUrlChange = async (value: string) => {
    setMdmWsUrl(value);
    if (Platform.OS !== 'android') return;
    try {
      await mdmAgent.configure(value.trim(), mdmEnrollToken.trim() || null);
    } catch (_) {
      // ignore while typing
    }
  };

  const handleMdmEnrollTokenChange = async (value: string) => {
    setMdmEnrollToken(value);
    if (Platform.OS !== 'android') return;
    try {
      await mdmAgent.configure(mdmWsUrl.trim(), value.trim() || null);
      if (mdmEnabled && value.trim()) {
        await mdmAgent.stopAgent();
        await mdmAgent.startAgent();
        await refreshMdmAgentInfo();
      }
    } catch (_) {
      // ignore while typing
    }
  };

  const refreshMdmAgentInfo = async () => {
    const info = await mdmAgent.getAgentInfo();
    setMdmEnabled(info.enabled);
    setMdmConnected(info.connected);
    setMdmDeviceId(info.deviceId);
    setMdmEnrolled(info.enrolled);
  };

  const handleReEnroll = () => {
    Alert.alert(
      'Re-enroll MDM agent',
      'Clears saved device credentials on this tablet. Enter a new enrollment token, then turn Connect to MDM back on.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Re-enroll',
          style: 'destructive',
          onPress: async () => {
            setMdmLoading(true);
            try {
              await mdmAgent.clearEnrollment();
              setMdmEnrollToken('');
              setMdmEnabled(false);
              setMdmConnected(false);
              setMdmDeviceId(0);
              setMdmEnrolled(false);
              await refreshMdmAgentInfo();
              onSettingsChanged?.();
              Alert.alert(
                'Credentials cleared',
                'Enter your enrollment token (debug), then turn Connect to MDM on.'
              );
            } catch (error: any) {
              Alert.alert('MDM Agent', error?.message || 'Failed to clear enrollment');
            } finally {
              setMdmLoading(false);
            }
          },
        },
      ]
    );
  };

  const mdmStatusColor = mdmConnected ? '#4CAF50' : mdmEnabled ? '#FF9800' : '#9E9E9E';
  const hasEnrollmentInput = Boolean(mdmEnrollToken.trim());

  return (
    <>
    <SettingsSection
      title="REST API"
      icon="api"
    >
      <SettingsSwitch
        label="Enable REST API"
        value={apiEnabled}
        onValueChange={handleApiEnabledChange}
        icon="server-network"
      />

      {apiEnabled && (
        <>
          {/* Server Status */}
          <View style={styles.statusContainer}>
            <View style={styles.statusRow}>
              <View style={[
                styles.statusIndicator,
                { backgroundColor: serverRunning ? '#4CAF50' : '#F44336' }
              ]} />
              <Text style={styles.statusText}>
                {isLoading ? 'Starting...' : serverRunning ? 'Server Running' : 'Server Stopped'}
              </Text>
              {isLoading && <ActivityIndicator size="small" color="#007AFF" style={styles.loader} />}
            </View>

            {serverRunning && (
              <TouchableOpacity
                style={styles.urlContainer}
                onPress={() => copyToClipboard(getApiUrl(), 'API URL')}
              >
                <Icon name="link" size={16} color="#007AFF" />
                <Text style={styles.urlText}>{getApiUrl()}</Text>
                <Icon name="content-copy" size={16} color="#999" />
              </TouchableOpacity>
            )}
          </View>

          {/* Port Setting */}
          <SettingsInput
            label="Port"
            value={apiPort}
            onChangeText={handlePortChange}
            placeholder="8080"
            keyboardType="numeric"
            icon="numeric"
            hint="Port 1024-65535 (default: 8080)"
          />

          {/* API Key */}
          <View style={styles.apiKeyContainer}>
            <SettingsInput
              label="API Key (optional)"
              value={apiKey}
              onChangeText={handleApiKeyChange}
              placeholder="Leave empty for no authentication"
              secureTextEntry
              icon="key-variant"
              hint="Used as X-Api-Key header"
            />
            <View style={styles.apiKeyButtons}>
              <TouchableOpacity
                style={styles.smallButton}
                onPress={generateApiKey}
              >
                <Icon name="refresh" size={16} color="#007AFF" />
                <Text style={styles.smallButtonText}>Generate</Text>
              </TouchableOpacity>
              {apiKey ? (
                <TouchableOpacity
                  style={styles.smallButton}
                  onPress={() => copyToClipboard(apiKey, 'API Key')}
                >
                  <Icon name="content-copy" size={16} color="#007AFF" />
                  <Text style={styles.smallButtonText}>Copy</Text>
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* Allow Control */}
          <SettingsSwitch
            label="Allow Remote Control"
            value={allowControl}
            onValueChange={handleAllowControlChange}
            icon="remote"
            hint="Enable POST commands (brightness, reload, etc.)"
          />

          {/* Remote Screenshot (MediaProjection) */}
          <SettingsSwitch
            label="Remote Screenshot (Full Screen)"
            value={remoteScreenshotActive}
            onValueChange={handleRemoteScreenshotChange}
            icon="monitor-screenshot"
            hint={
              remoteScreenshotActive
                ? 'Full-screen capture active — keep the screen-recording notification visible'
                : 'Enable before starting kiosk mode, or re-enable if capture stopped. Required for external apps in Live View.'
            }
          />

          {/* API Endpoints Info */}
          <View style={styles.endpointsContainer}>
            <Text style={styles.endpointsTitle}>Available Endpoints:</Text>
            
            <View style={styles.endpointCategory}>
              <Text style={styles.categoryLabel}>GET (Read-only)</Text>
              <Text style={styles.endpoint}>/api/status - Full device status</Text>
              <Text style={styles.endpoint}>/api/battery - Battery info</Text>
              <Text style={styles.endpoint}>/api/brightness - Current brightness</Text>
              <Text style={styles.endpoint}>/api/screen - Screen state</Text>
              <Text style={styles.endpoint}>/api/info - Device info</Text>
              <Text style={styles.endpoint}>/api/health - Health check</Text>
              <Text style={styles.endpoint}>/api/sensors - Light, proximity, accelerometer</Text>
              <Text style={styles.endpoint}>/api/storage - Storage info</Text>
              <Text style={styles.endpoint}>/api/memory - RAM info</Text>
              <Text style={styles.endpoint}>/api/wifi - WiFi status</Text>
              <Text style={styles.endpoint}>/api/screenshot - Capture screen (PNG)</Text>
            </View>

            {allowControl && (
              <View style={styles.endpointCategory}>
                <Text style={styles.categoryLabel}>POST (Control)</Text>
                <Text style={styles.endpoint}>/api/brightness - Set brightness</Text>
                <Text style={styles.endpoint}>/api/screen/on - Turn screen on</Text>
                <Text style={styles.endpoint}>/api/screen/off - Turn screen off</Text>
                <Text style={styles.endpoint}>/api/screensaver/on - Enable screensaver</Text>
                <Text style={styles.endpoint}>/api/screensaver/off - Disable screensaver</Text>
                <Text style={styles.endpoint}>/api/reload - Reload WebView</Text>
                <Text style={styles.endpoint}>/api/url - Navigate to URL</Text>
                <Text style={styles.endpoint}>/api/wake - Wake from screensaver</Text>
                <Text style={styles.endpoint}>/api/tts - Text to speech</Text>
                <Text style={styles.endpoint}>/api/volume - Set volume</Text>
                <Text style={styles.endpoint}>/api/toast - Show toast message</Text>
                <Text style={styles.endpoint}>/api/js - Execute JavaScript</Text>
                <Text style={styles.endpoint}>/api/clearCache - Clear WebView cache</Text>
                <Text style={styles.endpoint}>/api/app/launch - Launch external app</Text>
                <Text style={styles.endpoint}>/api/reboot - Reboot (Device Owner)</Text>
                <Text style={styles.endpoint}>/api/audio/play - Play audio URL</Text>
                <Text style={styles.endpoint}>/api/audio/stop - Stop audio</Text>
                <Text style={styles.endpoint}>/api/audio/beep - Play beep sound</Text>
              </View>
            )}

            {allowControl && (
              <View style={styles.endpointCategory}>
                <Text style={styles.categoryLabel}>POST (Remote Control - Android TV)</Text>
                <Text style={styles.endpoint}>/api/remote/up - D-pad up</Text>
                <Text style={styles.endpoint}>/api/remote/down - D-pad down</Text>
                <Text style={styles.endpoint}>/api/remote/left - D-pad left</Text>
                <Text style={styles.endpoint}>/api/remote/right - D-pad right</Text>
                <Text style={styles.endpoint}>/api/remote/select - Select/Enter</Text>
                <Text style={styles.endpoint}>/api/remote/back - Back button</Text>
                <Text style={styles.endpoint}>/api/remote/home - Home button</Text>
                <Text style={styles.endpoint}>/api/remote/menu - Menu button</Text>
                <Text style={styles.endpoint}>/api/remote/playpause - Play/Pause</Text>
              </View>
            )}
          </View>

          {/* Home Assistant Hint */}
          <View style={styles.hintContainer}>
            <Icon name="home-assistant" size={20} color="#41BDF5" />
            <Text style={styles.hintText}>
              Use with Home Assistant's RESTful integration. See documentation for configuration examples.
            </Text>
          </View>
        </>
      )}
    </SettingsSection>

    {Platform.OS === 'android' && (
      <SettingsSection
        title="MDM Agent (Outbound)"
        icon="cloud-sync"
      >
        <SettingsSwitch
          label="Connect to MDM"
          value={mdmEnabled}
          onValueChange={handleMdmEnabledChange}
          icon="lan-connect"
          hint="For GSM tablets without inbound IP — tablet connects out to MDM over WebSocket"
        />

        <View style={styles.statusContainer}>
          <View style={styles.statusRow}>
            <View style={[styles.statusIndicator, { backgroundColor: mdmStatusColor }]} />
            <Text style={styles.statusText}>
              {mdmLoading
                ? 'Updating…'
                : mdmConnected
                  ? `Connected${mdmDeviceId > 0 ? ` (device #${mdmDeviceId})` : ''}`
                  : mdmEnabled
                    ? (mdmEnrolled
                      ? 'Reconnecting…'
                      : (hasEnrollmentInput ? 'Connecting…' : 'Enter enrollment token below'))
                    : 'Disconnected'}
            </Text>
            {mdmLoading && <ActivityIndicator size="small" color="#007AFF" style={styles.loader} />}
          </View>
          {mdmEnrolled && (
            <Text style={styles.mdmEnrolledText}>
              Enrolled as device #{mdmDeviceId}. Re-enroll after server migration or token rotation.
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={styles.reEnrollButton}
          onPress={handleReEnroll}
          disabled={mdmLoading}
        >
          <Icon name="refresh" size={16} color="#C62828" />
          <Text style={styles.reEnrollButtonText}>
            {mdmEnrolled ? 'Re-enroll' : 'Clear credentials'}
          </Text>
        </TouchableOpacity>

        <SettingsInput
          label="MDM WebSocket URL"
          value={mdmWsUrl}
          onChangeText={handleMdmWsUrlChange}
          placeholder="wss://mdm.example.com/api/agent/ws"
          icon="web"
          hint="Generate an enrollment token in FreeKiosk MDM → Settings"
          autoCapitalize="none"
        />

        {!mdmEnrolled && (
          <SettingsInput
            label="Enrollment Token"
            value={mdmEnrollToken}
            onChangeText={handleMdmEnrollTokenChange}
            placeholder="debug"
            secureTextEntry
            icon="ticket-confirmation"
            hint="Dev MDM: type debug. Production: one-time token from MDM Settings"
          />
        )}

        <View style={styles.hintContainer}>
          <Icon name="information" size={20} color="#1565C0" />
          <Text style={styles.hintText}>
            Enable REST API above so MDM can run commands. Works on cellular without VPN — the tablet initiates the connection.
          </Text>
        </View>
      </SettingsSection>
    )}
    </>
  );
};

const styles = StyleSheet.create({
  statusContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  statusText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  loader: {
    marginLeft: 8,
  },
  urlContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    padding: 8,
    backgroundColor: '#FFF',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  urlText: {
    flex: 1,
    marginHorizontal: 8,
    fontSize: 14,
    color: '#007AFF',
    fontFamily: 'monospace',
  },
  apiKeyContainer: {
    marginBottom: 8,
  },
  apiKeyButtons: {
    flexDirection: 'row',
    marginTop: 4,
    gap: 8,
  },
  smallButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#F0F0F0',
    borderRadius: 6,
  },
  smallButtonText: {
    fontSize: 12,
    color: '#007AFF',
    marginLeft: 4,
  },
  endpointsContainer: {
    backgroundColor: '#F8F9FA',
    borderRadius: 8,
    padding: 12,
    marginVertical: 8,
  },
  endpointsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  endpointCategory: {
    marginBottom: 8,
  },
  categoryLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#666',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  endpoint: {
    fontSize: 12,
    color: '#555',
    fontFamily: 'monospace',
    paddingVertical: 2,
  },
  hintContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
    padding: 12,
    marginTop: 8,
  },
  hintText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 13,
    color: '#1565C0',
    lineHeight: 18,
  },
  mdmEnrolledText: {
    marginTop: 6,
    fontSize: 12,
    color: '#666',
  },
  reEnrollButton: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 8,
    backgroundColor: '#FFEBEE',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  reEnrollButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#C62828',
    marginLeft: 6,
  },
});
