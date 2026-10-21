import React from 'react';
import { Platform, View, type ViewStyle } from 'react-native';
import { colors } from '../theme';

const gradient = `linear-gradient(to bottom, ${colors.bg} 0%, ${colors.accentSoft} 100%)`;
const gradientStyle = (Platform.OS === 'web'
  ? { backgroundImage: gradient }
  : { experimental_backgroundImage: gradient }) as ViewStyle;

/** Decorative only: never intercept input or become an accessibility target. */
export function ComposerBackground() {
  return <View pointerEvents="none" accessible={false} style={[
    { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 },
    gradientStyle,
  ]} />;
}
