import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  BackHandler,
  RefreshControl,
} from 'react-native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { mdmAgent, MdmCatalogApp } from '../utils/MdmAgentModule';
import { apkInstall, ApkInstallResultEvent } from '../utils/ApkInstallModule';
import { StorageService } from '../utils/storage';
import { createManagedApp } from '../types/managedApps';
import AppLauncherModule from '../utils/AppLauncherModule';
import Icon from '../components/Icon';
import { Colors, Spacing, Typography } from '../theme';

type InstallerScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Installer'>;

interface InstallerScreenProps {
  navigation: InstallerScreenNavigationProp;
}

type RowStatus = 'idle' | 'queued' | 'downloading' | 'installing' | 'installed' | 'failed';

interface StatusMeta {
  label: string;
  color: string;
  icon?: 'check-circle' | 'alert-circle';
}

function formatBytes(bytes: number) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** i).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function mapStage(stage: string): RowStatus {
  switch (stage) {
    case 'queued':
      return 'queued';
    case 'downloading':
      return 'downloading';
    case 'installing':
      return 'installing';
    case 'completed':
      return 'installed';
    case 'failed':
      return 'failed';
    default:
      return 'queued';
  }
}

function statusMeta(status: RowStatus): StatusMeta | null {
  switch (status) {
    case 'queued':
    case 'downloading':
    case 'installing':
      return {
        label: status === 'downloading' ? 'Downloading' : status === 'installing' ? 'Installing' : 'Queued',
        color: Colors.textSecondary,
      };
    case 'installed':
      return {
        label: 'On device',
        color: Colors.successDark,
        icon: 'check-circle',
      };
    case 'failed':
      return {
        label: 'Failed',
        color: Colors.errorDark,
        icon: 'alert-circle',
      };
    default:
      return null;
  }
}

function isOnDevice(app: MdmCatalogApp): boolean {
  if (app.installedOnDevice != null) return app.installedOnDevice;
  return app.installStatus === 'installed';
}

function needsInstall(app: MdmCatalogApp): boolean {
  return !isOnDevice(app) || !!app.updateAvailable;
}

function isBusyStatus(status: RowStatus) {
  return status === 'queued' || status === 'downloading' || status === 'installing';
}

const InstallerScreen: React.FC<InstallerScreenProps> = ({ navigation }) => {
  const [apps, setApps] = useState<MdmCatalogApp[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [rowStatus, setRowStatus] = useState<Record<number, RowStatus>>({});
  const [rowMessages, setRowMessages] = useState<Record<number, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const pendingInstallsRef = useRef<Set<number>>(new Set());
  const rowStatusRef = useRef<Record<number, RowStatus>>({});

  useEffect(() => {
    rowStatusRef.current = rowStatus;
  }, [rowStatus]);

  const markInstallDone = useCallback((appId: number) => {
    pendingInstallsRef.current.delete(appId);
    if (pendingInstallsRef.current.size === 0) {
      setIsInstalling(false);
      const statuses = Object.values(rowStatusRef.current);
      const failed = statuses.filter((s) => s === 'failed').length;
      const installed = statuses.filter((s) => s === 'installed').length;
      if (failed > 0 && installed > 0) {
        setNotice(`${installed} installed, ${failed} failed.`);
      } else if (failed > 0) {
        setNotice('Install failed. Long-press a row for details.');
      } else if (installed > 0) {
        setNotice('Done. New apps are on the home screen.');
      }
    }
  }, []);

  const syncManagedApp = useCallback(async (packageName?: string, displayName?: string) => {
    if (!packageName) return;
    try {
      const label = displayName || await AppLauncherModule.getPackageLabel(packageName);
      await StorageService.addManagedApp(createManagedApp(packageName, label));
      await StorageService.saveDisplayMode('external_app');
      await StorageService.saveExternalAppMode('multi');
    } catch (e) {
      console.warn('[InstallerScreen] Failed to sync managed app', e);
    }
  }, []);

  const handleInstallSuccess = useCallback(async (event: ApkInstallResultEvent) => {
    if (event.appId <= 0) return;
    await syncManagedApp(event.packageName, event.displayName);
    setRowStatus((prev) => ({ ...prev, [event.appId]: 'installed' }));
    setRowMessages((prev) => {
      const next = { ...prev };
      delete next[event.appId];
      return next;
    });
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(event.appId);
      return next;
    });
    markInstallDone(event.appId);
  }, [markInstallDone, syncManagedApp]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const info = await mdmAgent.getAgentInfo();
        if (!active) return;
        if (!info.enrolled) {
          navigation.replace('Kiosk');
        }
      } catch {
        if (active) navigation.replace('Kiosk');
      }
    })();
    return () => {
      active = false;
    };
  }, [navigation]);

  useEffect(() => {
    const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isInstalling) {
        Alert.alert(
          'Install in progress',
          'Installs continue in the background if you leave now.',
          [
            { text: 'Stay', style: 'cancel' },
            { text: 'Leave', onPress: () => navigation.goBack() },
          ],
        );
        return true;
      }
      navigation.goBack();
      return true;
    });
    return () => backHandler.remove();
  }, [navigation, isInstalling]);

  const loadApps = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    if (!refresh) setNotice(null);
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
          const current = next[app.id];
          if (isBusyStatus(current)) return;
          if (isOnDevice(app) && !app.updateAvailable) {
            next[app.id] = 'installed';
          } else if (!current) {
            next[app.id] = 'idle';
          }
        });
        return next;
      });
      setSelectedIds((prev) => {
        const next = new Set(prev);
        catalog.forEach((app) => {
          if (isOnDevice(app) && !app.updateAvailable) {
            next.delete(app.id);
          }
        });
        return next;
      });
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Failed to load apps from MDM';
      setError(message);
      setApps([]);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  useEffect(() => {
    const progressSub = apkInstall.addProgressListener((event) => {
      if (event.appId <= 0) return;
      const nextStatus = mapStage(event.stage);
      setRowStatus((prev) => ({ ...prev, [event.appId]: nextStatus }));
      if (event.message && nextStatus === 'failed') {
        setRowMessages((prev) => ({ ...prev, [event.appId]: event.message! }));
      }
      if (nextStatus === 'installed') {
        const app = apps.find((entry) => entry.id === event.appId);
        void syncManagedApp(event.packageName ?? app?.packageName, app?.name);
        setRowMessages((prev) => {
          const next = { ...prev };
          delete next[event.appId];
          return next;
        });
        setSelectedIds((prev) => {
          const next = new Set(prev);
          next.delete(event.appId);
          return next;
        });
        markInstallDone(event.appId);
      }
    });
    const completeSub = apkInstall.addCompleteListener((event) => {
      void handleInstallSuccess(event);
    });
    const errorSub = apkInstall.addErrorListener((event) => {
      if (event.appId <= 0) return;
      setRowStatus((prev) => ({ ...prev, [event.appId]: 'failed' }));
      if (event.error) {
        setRowMessages((prev) => ({ ...prev, [event.appId]: event.error! }));
      }
      markInstallDone(event.appId);
    });

    return () => {
      progressSub?.remove();
      completeSub?.remove();
      errorSub?.remove();
    };
  }, [markInstallDone, handleInstallSuccess, syncManagedApp, apps]);

  const selectedApps = useMemo(
    () => apps.filter((app) => selectedIds.has(app.id)),
    [apps, selectedIds],
  );

  const installStats = useMemo(() => {
    let installed = 0;
    let failed = 0;
    let inProgress = 0;
    apps.forEach((app) => {
      const status = rowStatus[app.id] || (isOnDevice(app) && !app.updateAvailable ? 'installed' : 'idle');
      if (status === 'installed') installed += 1;
      else if (status === 'failed') failed += 1;
      else if (isBusyStatus(status)) inProgress += 1;
    });
    return { installed, failed, inProgress, total: apps.length };
  }, [apps, rowStatus]);

  const headerSubtitle = useMemo(() => {
    if (isLoading) return 'Loading catalog…';
    if (installStats.total > 0) {
      return `${installStats.installed} of ${installStats.total} on device`;
    }
    return 'Apps assigned to this device';
  }, [isLoading, installStats]);

  const toggleSelection = (appId: number) => {
    const app = apps.find((entry) => entry.id === appId);
    const status = rowStatus[appId];
    if (isBusyStatus(status) || (app && isOnDevice(app) && !app.updateAvailable)) return;
    if (isInstalling && status !== 'failed') return;
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

    setNotice(null);
    const ids = selectedApps.map((app) => app.id);
    pendingInstallsRef.current = new Set(ids);
    setIsInstalling(true);

    for (const app of selectedApps) {
      setRowStatus((prev) => ({ ...prev, [app.id]: 'queued' }));
      setRowMessages((prev) => {
        const next = { ...prev };
        delete next[app.id];
        return next;
      });
      try {
        await apkInstall.downloadAndInstall({
          downloadUrl: app.downloadUrl,
          fileName: app.fileName,
          sha256: app.sha256,
          appId: app.id,
          packageName: app.packageName,
          displayName: app.name,
        });
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Could not start installation';
        setRowStatus((prev) => ({ ...prev, [app.id]: 'failed' }));
        setRowMessages((prev) => ({ ...prev, [app.id]: message }));
        markInstallDone(app.id);
      }
    }
  };

  const showRowDetails = (app: MdmCatalogApp) => {
    const detail = rowMessages[app.id];
    if (!detail) return;
    Alert.alert(app.name, detail);
  };

  const renderItem = ({ item }: { item: MdmCatalogApp }) => {
    const selected = selectedIds.has(item.id);
    const status = rowStatus[item.id] || (isOnDevice(item) && !item.updateAvailable ? 'installed' : 'idle');
    const meta = statusMeta(status);
    const busy = isBusyStatus(status);
    const showUpdate = isOnDevice(item) && item.updateAvailable && !busy && status !== 'failed';
    const disableSelect = busy || (isOnDevice(item) && !item.updateAvailable) || (isInstalling && status !== 'failed');

    return (
      <TouchableOpacity
        style={[
          styles.row,
          selected && styles.rowSelected,
          status === 'failed' && styles.rowFailed,
        ]}
        onPress={() => toggleSelection(item.id)}
        onLongPress={() => showRowDetails(item)}
        activeOpacity={0.85}
        disabled={disableSelect}
      >
        <View style={styles.rowMain}>
          <Text style={styles.rowTitle}>{item.name}</Text>
          <Text style={styles.rowMeta}>{item.packageName}</Text>
          <Text style={styles.rowMeta}>
            {item.deviceVersionName || item.versionName || 'Unknown version'} · {formatBytes(item.fileSizeBytes)}
          </Text>
          {showUpdate ? (
            <View style={styles.statusLine}>
              <Icon name="alert-circle" size={14} color={Colors.warningDark} />
              <Text style={[styles.statusText, { color: Colors.warningDark }]}>Update available</Text>
            </View>
          ) : meta ? (
            <View style={styles.statusLine}>
              {meta.icon ? (
                <Icon name={meta.icon} size={14} color={meta.color} />
              ) : null}
              <Text style={[styles.statusText, { color: meta.color }]}>{meta.label}</Text>
            </View>
          ) : null}
          {rowMessages[item.id] ? (
            <Text style={styles.rowError} numberOfLines={2}>
              {rowMessages[item.id]}
            </Text>
          ) : null}
        </View>

        <Icon
          name={
            status === 'installed'
              ? 'check-circle'
              : selected
                ? 'checkbox-marked'
                : 'checkbox-blank-outline'
          }
          size={22}
          color={
            status === 'installed'
              ? Colors.success
              : disableSelect
                ? Colors.textDisabled
                : Colors.primary
          }
        />
      </TouchableOpacity>
    );
  };

  const showList = !isLoading || apps.length > 0;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Icon name="arrow-left" size={22} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={styles.title}>App Installer</Text>
          <Text style={styles.subtitle}>{headerSubtitle}</Text>
        </View>
        <TouchableOpacity
          onPress={() => loadApps(true)}
          style={styles.refreshButton}
          disabled={isLoading || isRefreshing}
        >
          <Icon name="refresh" size={22} color={isLoading || isRefreshing ? Colors.textDisabled : Colors.primary} />
        </TouchableOpacity>
      </View>

      {notice ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.centered}>
          <Text style={styles.centeredTitle}>Could not load apps</Text>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => loadApps()}>
            <Text style={styles.primaryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : showList ? (
        <>
          <FlatList
            data={apps}
            keyExtractor={(item) => String(item.id)}
            renderItem={renderItem}
            contentContainerStyle={apps.length ? styles.list : styles.centered}
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={() => loadApps(true)}
                colors={[Colors.primary]}
                tintColor={Colors.primary}
              />
            }
            ListEmptyComponent={
              !isLoading ? (
                <View style={styles.emptyState}>
                  <Text style={styles.centeredTitle}>No apps assigned yet</Text>
                  <Text style={styles.centeredText}>
                    Assign APKs to this device&apos;s group in MDM, then pull down to refresh.
                  </Text>
                </View>
              ) : null
            }
          />
          <View style={styles.footer}>
            <Text style={styles.footerText}>
              {isInstalling
                ? `Installing ${installStats.inProgress || selectedApps.length}…`
                : `${selectedApps.length} selected`}
            </Text>
            <TouchableOpacity
              style={[
                styles.primaryButton,
                styles.installButton,
                (!selectedApps.length || isInstalling) && styles.primaryButtonDisabled,
              ]}
              onPress={installSelected}
              disabled={!selectedApps.length || isInstalling}
            >
              <Text style={styles.primaryButtonText}>
                {isInstalling ? 'Installing…' : 'Install selected'}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      ) : (
        <View style={styles.centered}>
          <Text style={styles.centeredText}>Loading catalog…</Text>
        </View>
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
    backgroundColor: Colors.surface,
  },
  backButton: {
    padding: Spacing.sm,
    marginRight: Spacing.sm,
  },
  refreshButton: {
    padding: Spacing.sm,
    minWidth: 40,
    alignItems: 'center',
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
  notice: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.surfaceVariant,
  },
  noticeText: {
    ...Typography.caption,
    color: Colors.textSecondary,
  },
  list: {
    padding: Spacing.md,
    paddingBottom: 100,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  rowSelected: {
    borderColor: Colors.primary,
  },
  rowFailed: {
    borderColor: Colors.error,
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
  statusLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: Spacing.sm,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  rowError: {
    ...Typography.caption,
    color: Colors.errorDark,
    marginTop: 4,
  },
  centered: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
  },
  centeredTitle: {
    ...Typography.labelSmall,
    color: Colors.textPrimary,
    textAlign: 'center',
  },
  centeredText: {
    ...Typography.body,
    color: Colors.textSecondary,
    marginTop: Spacing.sm,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  errorText: {
    ...Typography.body,
    color: Colors.error,
    textAlign: 'center',
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    maxWidth: 320,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: Spacing.md,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  footerText: {
    ...Typography.caption,
    color: Colors.textSecondary,
    flex: 1,
  },
  primaryButton: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  installButton: {
    minWidth: 140,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    ...Typography.body,
    color: Colors.textOnPrimary,
    fontWeight: '600',
  },
});

export default InstallerScreen;
