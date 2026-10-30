import React from 'react';
import {ScrollView, StyleSheet, Text, View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';

import {colors, commonStyles, spacing} from '../app/theme';

interface ScreenProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  scroll?: boolean;
}

export function Screen({title, subtitle, children, scroll = true}: ScreenProps) {
  const content = (
    <View style={commonStyles.content}>
      <View style={styles.headingBlock}>
        <Text style={commonStyles.heading}>{title}</Text>
        {subtitle ? <Text style={commonStyles.subheading}>{subtitle}</Text> : null}
      </View>
      {children}
    </View>
  );

  return (
    <SafeAreaView style={commonStyles.page} edges={['top', 'left', 'right']}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scrollContent}>{content}</ScrollView>
      ) : (
        content
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  headingBlock: {gap: spacing.xs},
  scrollContent: {flexGrow: 1},
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 18,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
});

export function Card({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  return <View style={[styles.card, style]}>{children}</View>;
}
