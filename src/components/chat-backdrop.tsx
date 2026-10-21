import React from 'react';
import { Image, StyleSheet, View } from 'react-native';

// Local asset stays available offline; the decorative layer never intercepts input.
export function ChatBackdrop({ quiet }: { quiet: boolean }) {
  return (
    <View pointerEvents="none" accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={StyleSheet.absoluteFill}>
      <Image
        source={require('../../assets/zhulong-background.png')}
        accessible={false}
        resizeMode="cover"
        style={[StyleSheet.absoluteFill, { width: '100%', height: '100%', opacity: quiet ? 0.07 : 0.24 }]}
      />
    </View>
  );
}
