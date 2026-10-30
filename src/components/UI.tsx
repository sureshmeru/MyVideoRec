import React from 'react';
import {Pressable, StyleSheet, Text, View} from 'react-native';

import {colors, spacing} from '../app/theme';

export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.button,
        variant === 'primary' && styles.primaryButton,
        variant === 'secondary' && styles.secondaryButton,
        variant === 'danger' && styles.dangerButton,
        disabled && styles.disabledButton,
        pressed && !disabled && styles.pressedButton,
      ]}>
      <Text
        style={[
          styles.buttonText,
          variant === 'secondary' && styles.secondaryButtonText,
          variant === 'danger' && styles.dangerButtonText,
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Label({children, color = colors.secondaryText}: {
  children: React.ReactNode;
  color?: string;
}) {
  return <Text style={[styles.label, {color}]}>{children}</Text>;
}

export function Metric({label, value, detail}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
      {detail ? <Text style={styles.metricDetail}>{detail}</Text> : null}
    </View>
  );
}

export function StatusBadge({
  label,
  tone = 'neutral',
}: {
  label: string;
  tone?: 'neutral' | 'good' | 'warning' | 'danger';
}) {
  const toneColor = {
    neutral: colors.secondaryText,
    good: colors.success,
    warning: colors.warning,
    danger: colors.danger,
  }[tone];
  return (
    <View style={[styles.badge, {borderColor: `${toneColor}55`}]}>
      <View style={[styles.dot, {backgroundColor: toneColor}]} />
      <Text style={[styles.badgeText, {color: toneColor}]}>{label}</Text>
    </View>
  );
}

export function Row({
  title,
  value,
  onPress,
}: {
  title: string;
  value?: string;
  onPress?: () => void;
}) {
  const content = (
    <>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      </View>
      {onPress ? <Text style={styles.chevron}>›</Text> : null}
    </>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={styles.row}>
      {content}
    </Pressable>
  ) : (
    <View style={styles.row}>{content}</View>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    paddingHorizontal: spacing.md,
  },
  primaryButton: {backgroundColor: colors.accent},
  secondaryButton: {backgroundColor: colors.raised, borderWidth: 1, borderColor: colors.border},
  dangerButton: {backgroundColor: colors.danger},
  disabledButton: {opacity: 0.45},
  pressedButton: {opacity: 0.8},
  buttonText: {color: colors.background, fontSize: 15, fontWeight: '700'},
  secondaryButtonText: {color: colors.text},
  dangerButtonText: {color: '#FFFFFF'},
  label: {fontSize: 13, lineHeight: 19},
  metric: {flex: 1, gap: 5},
  metricLabel: {color: colors.secondaryText, fontSize: 12},
  metricValue: {color: colors.text, fontSize: 20, fontWeight: '700'},
  metricDetail: {color: colors.muted, fontSize: 11},
  badge: {
    alignSelf: 'flex-start',
    minHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 10,
  },
  dot: {width: 7, height: 7, borderRadius: 4},
  badgeText: {fontSize: 11, fontWeight: '700'},
  row: {
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  rowCopy: {flex: 1, gap: 4},
  rowTitle: {color: colors.text, fontSize: 15, fontWeight: '600'},
  rowValue: {color: colors.secondaryText, fontSize: 12},
  chevron: {color: colors.muted, fontSize: 25, paddingHorizontal: 4},
});
