import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useCodeScanner,
} from 'react-native-vision-camera';
import Colors from '../theme/colors';
import Icon from './Icon';
import {
  MdmEnrollmentQrPayload,
  parseMdmEnrollmentQr,
} from '../utils/mdmEnrollmentQr';

type Props = {
  visible: boolean;
  onClose: () => void;
  onEnroll: (payload: MdmEnrollmentQrPayload) => Promise<void>;
};

const MdmEnrollmentQrScanner: React.FC<Props> = ({
  visible,
  onClose,
  onEnroll,
}) => {
  const device = useCameraDevice('back');
  const { hasPermission, requestPermission } = useCameraPermission();
  const [requestingPermission, setRequestingPermission] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const scanLocked = useRef(false);

  useEffect(() => {
    if (!visible) {
      scanLocked.current = false;
      setProcessing(false);
      setError('');
      return;
    }

    if (!hasPermission) {
      setRequestingPermission(true);
      requestPermission().finally(() => setRequestingPermission(false));
    }
  }, [hasPermission, requestPermission, visible]);

  const handleCode = useCallback(
    async (value: string) => {
      if (scanLocked.current) return;

      scanLocked.current = true;
      setProcessing(true);
      try {
        const payload = parseMdmEnrollmentQr(value);
        await onEnroll(payload);
      } catch (scanError) {
        setError(
          scanError instanceof Error
            ? scanError.message
            : 'Could not connect to MDM with this QR code.',
        );
        scanLocked.current = false;
        setProcessing(false);
      }
    },
    [onEnroll],
  );

  const codeScanner = useCodeScanner({
    codeTypes: ['qr'],
    onCodeScanned: codes => {
      const value = codes.find(code => code.value)?.value;
      if (value) handleCode(value);
    },
  });

  const retry = () => {
    scanLocked.current = false;
    setError('');
    setProcessing(false);
  };

  const renderContent = () => {
    if (requestingPermission) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.message}>Requesting camera permission…</Text>
        </View>
      );
    }

    if (!hasPermission) {
      return (
        <View style={styles.centered}>
          <Icon name="camera-outline" size={48} color={Colors.textSecondary} />
          <Text style={styles.permissionTitle}>Camera access required</Text>
          <Text style={styles.message}>
            Allow camera access to scan the enrollment QR from MDM.
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={Linking.openSettings}>
            <Text style={styles.primaryButtonText}>Open app settings</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (!device) {
      return (
        <View style={styles.centered}>
          <Text style={styles.permissionTitle}>Camera unavailable</Text>
          <Text style={styles.message}>No rear camera was found on this device.</Text>
        </View>
      );
    }

    return (
      <View style={styles.cameraContainer}>
        <Camera
          style={StyleSheet.absoluteFill}
          device={device}
          isActive={visible && !processing && !error}
          codeScanner={codeScanner}
        />
        <View style={styles.overlay}>
          <View style={styles.scanFrame} />
          <Text style={styles.scanHint}>
            Point the camera at a site or device enrollment QR
          </Text>
        </View>

        {(processing || error) && (
          <View style={styles.resultOverlay}>
            {processing ? (
              <>
                <ActivityIndicator size="large" color={Colors.primary} />
                <Text style={styles.resultTitle}>Connecting to MDM…</Text>
                <Text style={styles.resultText}>
                  Saving enrollment details and starting the agent.
                </Text>
              </>
            ) : (
              <>
                <Icon name="alert-circle-outline" size={44} color={Colors.error} />
                <Text style={styles.resultTitle}>Could not use this QR</Text>
                <Text style={styles.resultText}>{error}</Text>
                <TouchableOpacity style={styles.primaryButton} onPress={retry}>
                  <Text style={styles.primaryButtonText}>Scan again</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
      onRequestClose={onClose}
    >
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <View>
            <Text style={styles.title}>Scan MDM enrollment QR</Text>
            <Text style={styles.subtitle}>The tablet will connect automatically</Text>
          </View>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close QR scanner"
          >
            <Icon name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>
        {renderContent()}
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  header: {
    minHeight: 72,
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: {
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  subtitle: {
    color: Colors.textSecondary,
    fontSize: 13,
    marginTop: 2,
  },
  closeButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.background,
  },
  cameraContainer: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  scanFrame: {
    width: 260,
    height: 260,
    borderWidth: 3,
    borderColor: Colors.surface,
    borderRadius: 20,
  },
  scanHint: {
    marginTop: 24,
    color: Colors.textOnPrimary,
    backgroundColor: 'rgba(0,0,0,0.72)',
    borderRadius: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 14,
    textAlign: 'center',
  },
  centered: {
    flex: 1,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.surface,
  },
  permissionTitle: {
    marginTop: 16,
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
  },
  message: {
    marginTop: 8,
    maxWidth: 420,
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  resultOverlay: {
    ...StyleSheet.absoluteFillObject,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.96)',
  },
  resultTitle: {
    marginTop: 16,
    color: Colors.textPrimary,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  resultText: {
    marginTop: 8,
    maxWidth: 420,
    color: Colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
  },
  primaryButton: {
    marginTop: 20,
    minHeight: 44,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.primary,
  },
  primaryButtonText: {
    color: Colors.textOnPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
});

export default MdmEnrollmentQrScanner;
