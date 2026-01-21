import { useRouter } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { supabase } from "../../src/lib/supabase";
import { COLORS } from "../../src/theme/colors";
import { SPACING } from "../../src/theme/spacing";
import { FONT_SIZES } from "../../src/theme/typography";
import { US_STATES } from "../../src/utils/constants";
import { Button } from "../../src/views/components/common/button";
import { Dropdown } from "../../src/views/components/common/dropdown";
import { Input } from "../../src/views/components/common/input";

export default function CompleteProfileScreen() {
  const router = useRouter();

  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [homeState, setHomeState] = useState("");
  const [loading, setLoading] = useState(false);

  const [errors, setErrors] = useState({
    name: "",
    username: "",
    homeState: "",
    general: "",
  });

  const clearError = (field: string) => {
    setErrors((prev) => ({ ...prev, [field]: "", general: "" }));
  };

  const validate = (): boolean => {
    const newErrors = {
      name: "",
      username: "",
      homeState: "",
      general: "",
    };

    if (!name.trim()) {
      newErrors.name = "Full Name is required";
    } else if (!/^[a-zA-Z\s]+$/.test(name)) {
      newErrors.name = "Full Name can only contain letters";
    }

    if (!username.trim()) {
      newErrors.username = "Username is required";
    } else if (username.length < 3) {
      newErrors.username = "Username must be at least 3 characters";
    } else if (!/^[a-zA-Z0-9]+$/.test(username)) {
      newErrors.username = "Username can only contain letters and numbers";
    }

    if (!homeState) {
      newErrors.homeState = "Home State is required";
    }

    setErrors(newErrors);

    return !newErrors.name && !newErrors.username && !newErrors.homeState;
  };

  const handleComplete = async () => {
    if (!validate()) return;

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setErrors((prev) => ({
          ...prev,
          general: "No user found. Please log in again.",
        }));
        return;
      }

      // Check if username is taken
      const { data: existingUser } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_name", username.toLowerCase())
        .single();

      if (existingUser) {
        setErrors((prev) => ({
          ...prev,
          username: "Username is already taken",
        }));
        return;
      }

      const { error: insertError } = await supabase.from("profiles").insert({
        id: user.id,
        email: user.email,
        name: name.trim(),
        user_name: username.toLowerCase(),
        home_state: homeState,
      });

      if (insertError) {
        setErrors((prev) => ({ ...prev, general: insertError.message }));
        return;
      }

      Alert.alert("Profile Created!", "Welcome to Compete!", [
        { text: "OK", onPress: () => router.replace("/(tabs)") },
      ]);
    } catch (err: any) {
      setErrors((prev) => ({
        ...prev,
        general: err.message || "Failed to create profile",
      }));
    } finally {
      setLoading(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>COMPLETE PROFILE</Text>
      <Text style={styles.subtitle}>Tell us a bit about yourself</Text>

      <View style={styles.form}>
        <Input
          label="Full Name *"
          value={name}
          onChangeText={(text) => {
            setName(text);
            clearError("name");
          }}
          placeholder="Your Name"
          autoCapitalize="words"
          error={errors.name}
        />

        <Input
          label="Username *"
          value={username}
          onChangeText={(text) => {
            setUsername(text.replace(/[^a-zA-Z0-9]/g, ""));
            clearError("username");
          }}
          placeholder="username"
          autoCapitalize="none"
          error={errors.username}
          helper={
            !errors.username
              ? "Letters and numbers only. Cannot be changed later."
              : undefined
          }
        />

        <Dropdown
          label="Home State *"
          placeholder="Select State"
          options={US_STATES}
          value={homeState}
          onSelect={(value) => {
            setHomeState(value);
            clearError("homeState");
          }}
          error={errors.homeState}
        />

        {errors.general ? (
          <Text style={styles.generalError}>{errors.general}</Text>
        ) : null}

        <Button
          title="Complete Profile"
          onPress={handleComplete}
          loading={loading}
          fullWidth
        />
      </View>
    </ScrollView>
  );
}

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
  subtitle: {
    fontSize: FONT_SIZES.md,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xl,
  },
  form: {
    flex: 1,
  },
  generalError: {
    color: COLORS.error,
    fontSize: FONT_SIZES.sm,
    marginBottom: SPACING.md,
    textAlign: "center",
  },
});
