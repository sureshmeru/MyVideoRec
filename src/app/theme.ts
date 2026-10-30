import {StyleSheet} from 'react-native';

export const colors = {
  background: '#080D13',
  surface: '#111A24',
  raised: '#182431',
  border: '#253442',
  text: '#F3F7FA',
  secondaryText: '#A0AFBC',
  muted: '#647584',
  accent: '#39D5E6',
  accentDark: '#15343B',
  danger: '#FF5964',
  success: '#54D49A',
  warning: '#F5B84B',
};

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 30,
};

export const commonStyles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.md,
    paddingBottom: 34,
    gap: spacing.md,
  },
  heading: {
    color: colors.text,
    fontSize: 27,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subheading: {
    color: colors.secondaryText,
    fontSize: 14,
    lineHeight: 20,
  },
});
