import { NavigationContainer } from "@react-navigation/native";
import { useAuthContext } from "../providers/AuthProvider";
import { useAuthStore } from "../viewmodels/stores/auth.store";
import { Loading } from "../views/components/common/loading";
import { AuthNavigator } from "./auth.navigator";
import { MainNavigator } from "./main.navigator";

export const AppNavigator = () => {
  const { loading } = useAuthContext();
  const { profile } = useAuthStore();

  if (loading) {
    return <Loading fullScreen message="Loading..." />;
  }

  return (
    <NavigationContainer>
      {profile ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};
