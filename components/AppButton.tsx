import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/lib/theme';

type Props = {
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  theme?: 'primary';
  onPress: () => unknown;
  disabled?: boolean;
};

export default function AppButton({
  title,
  icon,
  theme,
  onPress,
  disabled = false,
}: Props) {
  const { primary, colors } = useTheme();
  const styles = createStyles(colors);

  if (theme === 'primary') {
    return (
      <View style={styles.buttonOuter}>
        <Pressable
          style={[
            styles.buttonInner,
            { backgroundColor: primary, opacity: disabled ? 0.6 : 1 },
          ]}
          onPress={disabled ? undefined : onPress}
          disabled={disabled}
        >
          <Ionicons
            name={icon}
            size={22}
            color={colors.textOnPrimary}
            style={styles.icon}
          />
          <Text style={[styles.label, { color: colors.textOnPrimary }]}>
            {title}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.buttonOuter}>
      <Pressable
        style={[styles.buttonInner, { opacity: disabled ? 0.6 : 1 }]}
        onPress={disabled ? undefined : onPress}
        disabled={disabled}
      >
        <Ionicons
          name={icon}
          size={22}
          color={colors.textSecondary}
          style={styles.icon}
        />
        <Text style={styles.label}>{title}</Text>
      </Pressable>
    </View>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors']) {
  return StyleSheet.create({
  buttonOuter: {
    width: '100%',
    marginBottom: 14,
    borderRadius: 4,
  },
  buttonInner: {
    borderRadius: 4,
    paddingVertical: 14,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  icon: { paddingRight: 10 },
  label: { fontSize: 17, fontWeight: '600', color: colors.textPrimary },
  });
}
