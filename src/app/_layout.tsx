import React from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AppProvider, useApp } from '../core/store';
import { Icon } from '../components/ui';
import { colors as c } from '../theme';
function Navigation() { const { ready, error } = useApp(); if (!ready) return <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: 16 }}>{error ? <Text selectable style={{ color: c.red, padding: 30 }}>{String(error)}</Text> : <><ActivityIndicator color={c.orange} /><Text style={{ color: c.muted }}>正在打开你的工作空间…</Text></>}</View>; return <><StatusBar style="dark" /><Tabs screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg }, tabBarActiveTintColor: c.orange, tabBarInactiveTintColor: c.muted, tabBarStyle: { backgroundColor: c.bg, borderTopColor: c.faint, elevation: 0 }, tabBarLabelStyle: { fontSize: 11, fontWeight: '500' }, tabBarHideOnKeyboard: true }}><Tabs.Screen name="index" options={{ title: '对话', tabBarIcon: ({ color }) => <Icon name="chatbubble-ellipses-outline" color={typeof color === 'string' ? color : c.muted} /> }} /><Tabs.Screen name="artworks" options={{ title: '作品', tabBarIcon: ({ color }) => <Icon name="images-outline" color={typeof color === 'string' ? color : c.muted} /> }} /><Tabs.Screen name="settings" options={{ title: '设置', tabBarIcon: ({ color }) => <Icon name="options-outline" color={typeof color === 'string' ? color : c.muted} /> }} /></Tabs></>; }
export default function Layout() { return <AppProvider><Navigation /></AppProvider>; }
