import React from 'react';
import { Image } from 'expo-image';
import { colors } from '../theme';

export const logoPalette = {
  primary: colors.accent,
  secondary: '#D6E1EF',
  mountain: '#839ABD',
  overlap: colors.ink,
  flame: '#FFFFFF',
};

export function logoSvg(palette = logoPalette) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 208" fill="none">
  <defs><clipPath id="image-frame"><rect x="108" y="56" width="144" height="144" rx="34"/></clipPath></defs>
  <rect x="108" y="56" width="144" height="144" rx="34" fill="${palette.secondary}"/>
  <path fill="${palette.primary}" d="M56 28H136C155 28 168 41 168 56V110C168 133 153 148 130 148H76L40 174V148C28 144 24 134 24 120V60C24 41 37 28 56 28Z"/>
  <path fill="${palette.mountain}" clip-path="url(#image-frame)" d="M96 212L163 145L181 163L207 129L272 212Z"/>
  <path fill="${palette.overlap}" d="M168 56V110C168 133 153 148 130 148H108V116C108 83 134 56 168 56Z"/>
  <path fill="${palette.flame}" d="M140 80C136 95 124 109 124 121C124 132 131 139 139 139C148 139 155 131 155 121C155 109 146 96 140 80Z"/>
</svg>`;
}

/** Transparent SVG; colors can be overridden without editing bitmap assets. */
export function BrandLogo({ size = 64, palette = logoPalette }: { size?: number; palette?: typeof logoPalette }) {
  return <Image
    source={{ uri: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(logoSvg(palette))}` }}
    accessibilityLabel="烛 Logo"
    contentFit="contain"
    style={{ width: size, height: size, marginBottom: 16 }}
  />;
}
