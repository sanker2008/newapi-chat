import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Stack } from 'expo-router/stack';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../core/store';
import { colors as c } from '../theme';
function Navigation() { const { ready, error } = useApp(); if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: 16 }}>{error ? <Text selectable style={{ color: c.red, padding: 30 }}>{String(error)}</Text> : <><ActivityIndicator color={c.accent} /><Text style={{ color: c.muted }}>正在打开你的工作空间…</Text></>}</View>; return <><StatusBar style="dark" /><Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg } }}><Stack.Screen name="index" options={{ title: '烛' }} /><Stack.Screen name="artworks" options={{ title: '作品' }} /><Stack.Screen name="settings" options={{ title: '设置' }} /></Stack></>; }
export default function Layout() { return <AppProvider><Navigation /></AppProvider>; }
