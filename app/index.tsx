import { useEffect, useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../src/context/AuthContext';

export default function Index() {
  const router = useRouter();
  const { user, profile, isLoading } = useAuth();
  const [isReady, setIsReady] = useState(false);

  // Attendre que le layout soit complètement monté
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Naviguer seulement quand tout est prêt
  useEffect(() => {
    if (!isReady || isLoading) return;

    const role = profile?.role || user?.role;

    if (!user) {
      router.replace('/(auth)/login');
      return;
    }

    switch (role) {
      case 'MERCHANT':
      case 'commercant':
        router.replace('/(tabs)/commercant');
        break;
      case 'PRODUCER':
      case 'producteur':
        router.replace('/producteur');
        break;
      case 'COOPERATIVE':
      case 'cooperative':
        router.replace('/cooperative');
        break;
      case 'FIELD_AGENT':
      case 'agent':
        router.replace('/agent');
        break;
      case 'SUPERVISOR':
      case 'admin':
        router.replace('/admin');
        break;
      default:
        router.replace('/(auth)/login');
    }
  }, [isReady, isLoading, user, profile]);

  // Écran de chargement en attendant
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#059669' }}>
      <ActivityIndicator size="large" color="white" />
    </View>
  );
}
