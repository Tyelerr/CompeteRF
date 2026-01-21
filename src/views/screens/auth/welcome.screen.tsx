import { useNavigation } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { StyleSheet, Text, View } from "react-native";
import { AuthStackParamList } from "../../../navigation/navigation.types";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { Button } from "../../components/common/button";

type WelcomeNavigationProp = StackNavigationProp<AuthStackParamList, "Welcome">;

export const WelcomeScreen = () => {
  const navigation = useNavigation<WelcomeNavigationProp>();

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <Text style={styles.logo}>🎱</Text>
        <Text style={styles.title}>COMPETE</Text>
        <Text style={styles.subtitle}>Find Billiards Tournaments Near You</Text>
      </View>

      <View style={styles.buttons}>
        <Button
          title="Create Account"
          onPress={() => navigation.navigate("Register")}
          fullWidth
        />
        <View style={styles.spacer} />
        <Button
          title="Log In"
          onPress={() => navigation.navigate("Login")}
          variant="outline"
          fullWidth
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
    justifyContent: "space-between",
  },
  content: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  logo: {
    fontSize: 80,
    marginBottom: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.title,
    fontWeight: "700",
    color: COLORS.text,
    marginBottom: SPACING.sm,
  },
  subtitle: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
    textAlign: "center",
  },
  buttons: {
    paddingBottom: SPACING.xl,
  },
  spacer: {
    height: SPACING.md,
  },
});
