import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  Alert,
  BackHandler,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { hasSettingsAccess } from '../utils/authState';
import { mdmAgent, MdmCatalogApp } from '../utils/MdmAgentModule';
import { apkInstall } from '../utils/ApkInstallModule';
import Icon from '../components/Icon';
import { Colors, Spacing, Typography } from '../theme';

type InstallerScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Installer'>;

interface InstallerScreenProps {
  navigation: InstallerScreenNavigationProp;
}

type RowStatus = 'idle' | 'queued' | 'downloading' | 'installing' | 'installed' | 'failed';

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function statusLabel(status: RowStatus) {
  switch (status) {
    case 'queued': return 'Queued';
    case 'downloading': return 'Downloading';
    case 'installing': return 'Installing';
    case 'installed': return 'Installed';
    case 'failed': return 'Failed';
    default: return 'Not installed';
  }
}

const InstallerScreen: React.FC<InstallerScreenProps> = ({ navigation }) => {
  const [apps, setApps] = useState<MdmCatalogApp[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [rowStatus, setRowStatus] = useState<Record<number, RowStatus>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!hasSettingsAccess()) {
      navigation.replace('Kiosk');
    }
  }, [navigation]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      navigation.goBack();
      return true;
    });
    return () => backHandler.remove();
  }, [navigation]);

  const loadApps = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const info = await mdmAgent.getAgentInfo();
      if (!info.enrolled) {
        setError('MDM agent is not enrolled. Configure it in Settings → Advanced → REST API.');
        setApps([]);
        return;
      }

      const catalog = await mdmAgent.fetchAvailableApps();
      setApps(catalog);
      setRowStatus((prev) => {
        const next = { ...prev };
        catalog.forEach((app) => {
          if (app.installStatus === 'installed') {
            next[app.id] = 'installed';
          } else if (!next[app.id]) {
            next[app.id] = 'idle';
          }
        });
        return next;
      });
    } catch (e: any) {
      setError(e?.message || 'Failed to load apps from MDM');
      setApps([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  useEffect(() => {
    const progressSub = apkInstall.addProgressListener((event) => {
      if (event.appId <= 0) return;
      const stage = event.stage === 'downloading'
        ? 'downloading'
        : event.stage === 'installing'
          ? 'installing'
          : 'queued';
      setRowStatus((prev) => ({ ...prev, [event.appId]: stage }));
    });
    const completeSub = apkInstall.addCompleteListener((event) => {
      if (event.appId <= 0) return;
      setRowStatus((prev) => ({ ...prev, [event.appId]: 'installed' }));
    });
    const errorSub = apkInstall.addErrorListener((event) => {
      if (event.appId <= 0) return;
      setRowStatus((prev) => ({ ...prev, [event.appId]: 'failed' }));
    });

    return () => {
      progressSub?.remove();
      completeSub?.remove();
      errorSub?.remove();
    };
  }, []);

  const selectedApps = useMemo(
    () => apps.filter((app) => selectedIds.has(app.id)),
    [apps, selectedIds],
  );

  const toggleSelection = (appId: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(appId)) next.delete(appId);
      else next.add(appId);
      return next;
    });
  };

  const installSelected = async () => {
    if (!selectedApps.length) {
      Alert.alert('No apps selected', 'Select one or more apps to install.');
      return;
    }

    setIsInstalling(true);
    try {
      for (const app of selectedApps) {
        setRowStatus((prev) => ({ ...prev, [app.id]: 'queued' }));
        await apkInstall.downloadAndInstall({
          downloadUrl: app.downloadUrl,
          fileName: app.fileName,
          sha256: app.sha256,
          appId: app.id,
          packageName: app.packageName,
        });
      }
    } catch (e: any) {
      Alert.alert('Install failed', e?.message || 'Could not start installation');
    } finally {
      setIsInstalling(false);
    }
  };

  const renderItem = ({ item }: { item: MdmCatalogApp }) => {
    const selected = selectedIds.has(item.id);
    const status = rowStatus[item.id] || (item.installStatus === 'installed' ? 'installed' : 'idle');

    return (
      <TouchableOpacity
        style={[styles.row, selected && styles.rowSelected]}
        onPress={() => toggleSelection(item.id)}
        activeOpacity={0.8}
      >
        <View style={styles.rowMain}>
          <Text style={styles.rowTitle}>{item.name}</Text>
          <Text style={styles.rowMeta}>{item.packageName}</Text>
          <Text style={styles.rowMeta}>
            {item.versionName || 'Unknown version'} · {formatBytes(item.fileSizeBytes)}
          </Text>
          <Text style={[styles.rowStatus, status === 'failed' && styles.rowStatusFailed]}>
            {statusLabel(status)}
          </Text>
        </View>
        <Icon name={selected ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={Colors.primary} />
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-left" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>App Installer</Text>
          <Text style={styles.subtitle}>Install APKs assigned to this device via MDM</Text>
        </View>
        <TouchableOpacity onPress={loadApps} style={styles.refreshButton} disabled={isLoading}>
          <Icon name="refresh" size={22} color={Colors.primary} />
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={Colors.primary} />
          <Text style={styles.centeredText}>Loading apps…</Text>
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={loadApps}>
            <Text style={styles.primaryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <>
          <FlatList
            data={apps}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={apps.length ? styles.list : styles.centered}
            ListEmptyComponent={
              <Text style={styles.centeredText}>No apps assigned to this device.</Text>
            }
          />
          <View style={styles.footer}>
            <Text style={styles.footerText}>{selectedApps.length} selected</Text>
            <TouchableOpacity
              style={[styles.primaryButton, (!selectedApps.length || isInstalling) && styles.primaryButtonDisabled]}
              onPress={installSelected}
              disabled={!selectedApps.length || isInstalling}
            >
              <Text style={styles.primaryButtonText}>
                {isInstalling ? 'Installing…' : 'Install Selected'}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  backButton: {
    padding: Spacing.sm,
    marginRight: Spacing.sm,
  },
  refreshButton: {
    padding: Spacing.sm,
  },
  headerText: {
    flex: 1,
  },
  title: {
    ...Typography.sectionTitle,
    color: Colors.textPrimary,
  },
  subtitle: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 4,
  },
  list: {
    padding: Spacing.md,
    paddingBottom: 120,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowSelected: {
    borderColor: Colors.primary,
  },
  rowMain: {
    flex: 1,
    paddingRight: Spacing.md,
  },
  rowTitle: {
    ...Typography.labelSmall,
    color: Colors.textPrimary,
  },
  rowMeta: {
    ...Typography.caption,
    color: Colors.textSecondary,
    marginTop: 2,
  },
  rowStatus: {
    ...Typography.caption,
    color: Colors.primary,
    marginTop: 6,
    fontWeight: '600',
  },
  rowStatusFailed: {
    color: Colors.error,
  },
  centered: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  centeredText: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    textAlign: 'center',
  },
  errorText: {
    ...Typography.body,
    color: Colors.error,
    textAlign: 'center',
    marginBottom: Spacing.md,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.background,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  footerText: {
    ...Typography.body,
    color: Colors.textSecondary,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonText: {
    ...Typography.body,
    color: '#fff',
    fontWeight: '600',
  },
});

export default InstallerScreen;
