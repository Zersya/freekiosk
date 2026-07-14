import React from 'react';
import { TouchableOpacity, Text, StyleSheet, ViewStyle } from 'react-native';
import MaterialCommunityIcons from 'react-native-vector-icons/MaterialCommunityIcons';

interface MdmInstallerFabProps {
  visible: boolean;
  onPress: () => void;
  style?: ViewStyle;
}

const MdmInstallerFab: React.FC<MdmInstallerFabProps> = ({ visible, onPress, style }) => {
  if (!visible) return null;

  return (
    <TouchableOpacity
      style={[styles.fab, style]}
      onPress={onPress}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel="Open App Installer"
    >
      <MaterialCommunityIcons name="package-variant" size={18} color="#FFFFFF" />
      <Text style={styles.label}>App Installer</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    bottom: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#EF3434',
    borderRadius: 24,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    zIndex: 1001,
  },
  label: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});

export default MdmInstallerFab;
