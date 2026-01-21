import { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { COLORS } from "../../../theme/colors";
import { SPACING } from "../../../theme/spacing";
import { FONT_SIZES } from "../../../theme/typography";
import { US_STATES } from "../../../utils/constants";
import { toTitleCase } from "../../../utils/helpers";
import { containsBadWord, isValidUsername } from "../../../utils/validation";
import { useAuth } from "../../../viewmodels/hooks/use.auth";
import { useCheckUsername } from "../../../viewmodels/hooks/use.profile";
import { Button } from "../../components/common/button";
import { Dropdown } from "../../components/common/dropdown";
import { Input } from "../../components/common/input";

export const CompleteProfileScreen = () => {
  const { user, createProfile } = useAuth();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [homeState, setHomeState] = useState("");
  const [homeCity, setHomeCity] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const { isAvailable, isChecking } = useCheckUsername(username);

  const handleComplete = async () => {
    setError("");

    if (!name.trim()) {
      setError("Please enter your name");
      return;
    }

    if (!isValidUsername(username)) {
      setError("Username must be 3-20 letters only (no numbers)");
      return;
    }

    if (containsBadWord(username)) {
      setError("This username is not allowed");
      return;
    }

    if (!isAvailable) {
      setError("This username is already taken");
      return;
    }

    if (!homeState) {
      setError("Please select your home state");
      return;
    }

    setLoading(true);
    try {
      await createProfile({
        id: user!.id,
        email: user!.email!,
        name: toTitleCase(name),
        user_name: username.toLowerCase(),
        home_state: homeState,
        home_city: homeCity || undefined,
      });
    } catch (err: any) {
      setError(err.message || "Failed to create profile");
    } finally {
      setLoading(false);
    }
  };

  const getUsernameHelper = () => {
    if (username.length < 3) return "This cannot be changed later";
    if (isChecking) return "Checking availability...";
    if (isAvailable) return "✓ Username available";
    return "✗ Username taken";
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>COMPLETE YOUR PROFILE</Text>
      <Text style={styles.step}>Step 1 of 2</Text>

      <Text style={styles.subtitle}>Let's get you set up!</Text>

      <View style={styles.form}>
        <Input
          label="Full Name *"
          value={name}
          onChangeText={setName}
          placeholder="Your Name"
          autoCapitalize="words"
        />

        <Input
          label="Username *"
          value={username}
          onChangeText={(text) => setUsername(text.toLowerCase())}
          placeholder="username"
          autoCapitalize="none"
          helper={getUsernameHelper()}
        />

        <Dropdown
          label="Home State *"
          placeholder="Select State"
          options={US_STATES}
          value={homeState}
          onSelect={setHomeState}
        />

        <Input
          label="Home City"
          value={homeCity}
          onChangeText={setHomeCity}
          placeholder="City (optional)"
          autoCapitalize="words"
          helper="Optional but recommended"
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          title="Continue"
          onPress={handleComplete}
          loading={loading}
          disabled={!name || !username || !homeState}
          fullWidth
        />
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
    padding: SPACING.lg,
  },
  title: {
    fontSize: FONT_SIZES.xxl,
    fontWeight: "700",
    color: COLORS.text,
    marginTop: SPACING.xl,
  },
  step: {
    fontSize: FONT_SIZES.sm,
    color: COLORS.textMuted,
    marginBottom: SPACING.lg,
  },
  subtitle: {
    fontSize: FONT_SIZES.lg,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },
  form: {
    flex: 1,
  },
  error: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.md,
  },
});
