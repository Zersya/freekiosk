import React from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { SEGOE_GLYPHS, type ExtraIconName } from './segoeGlyphs';
import type { IconName } from '../../../components/Icon';

interface MaterialCommunityIconsProps {
  name: IconName | ExtraIconName | string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
}

const MaterialCommunityIcons: React.FC<MaterialCommunityIconsProps> = ({
  name,
  size = 24,
  color = '#000',
  style,
}) => {
  const glyph = SEGOE_GLYPHS[name as IconName | ExtraIconName] ?? '\uE9CE';
  return (
    <Text
      allowFontScaling={false}
      style={[
        {
          fontFamily: 'Segoe MDL2 Assets',
          fontSize: size,
          lineHeight: size,
          color,
        },
        style,
      ]}
    >
      {glyph}
    </Text>
  );
};

export default MaterialCommunityIcons;
