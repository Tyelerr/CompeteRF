import { createStackNavigator } from "@react-navigation/stack";
import {
  CompleteProfileScreen,
  ForgotPasswordScreen,
  LoginScreen,
  RegisterScreen,
  WelcomeScreen,
} from "../views/screens/auth";
import { AuthStackParamList } from "./navigation.types";

const Stack = createStackNavigator<AuthStackParamList>();

export const AuthNavigator = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
      <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />
      <Stack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
    </Stack.Navigator>
  );
};
