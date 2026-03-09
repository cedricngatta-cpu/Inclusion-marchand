import React from 'react';
import { StyleSheet, View, Text, SafeAreaView, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Settings, Bell, ChevronRight, ArrowUpRight, ArrowDownLeft } from 'lucide-react-native';

const { width } = Dimensions.get('window');

// Constantes de Layout
const TOP_HEADER_HEIGHT = 60;
const BALANCE_HEADER_HEIGHT = 140;
const STICKY_THRESHOLD = BALANCE_HEADER_HEIGHT - 40; // Le point où le solde s'arrête de monter

const WaveScrollDemo = () => {
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
    },
  });

  // Animation pour le bloc de solde (Header Inférieur)
  const stickyBalanceStyle = useAnimatedStyle(() => {
    const translateY = interpolate(
      scrollY.value,
      [0, STICKY_THRESHOLD],
      [TOP_HEADER_HEIGHT, -20], // Monte jusqu'à se caler sous le header fixe
      Extrapolation.CLAMP
    );

    const opacity = interpolate(
      scrollY.value,
      [0, STICKY_THRESHOLD],
      [1, 0.95],
      Extrapolation.CLAMP
    );

    return {
      transform: [{ translateY }],
      opacity,
    };
  });

  // Animation pour masquer subtilement le texte "Mon solde" au scroll
  const balanceTextStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      scrollY.value,
      [0, STICKY_THRESHOLD / 2],
      [1, 0],
      Extrapolation.CLAMP
    );
    return { opacity };
  });

  const renderTransaction = (id: number) => (
    <View key={id} style={styles.transactionItem}>
      <View style={styles.transactionIconContainer}>
        {id % 2 === 0 ? (
          <ArrowUpRight size={20} color="#10b981" />
        ) : (
          <ArrowDownLeft size={20} color="#ef4444" />
        )}
      </View>
      <View style={styles.transactionDetails}>
        <Text style={styles.transactionTitle}>Transaction #{id}</Text>
        <Text style={styles.transactionDate}>Aujourd'hui, 12:45</Text>
      </View>
      <View style={styles.transactionAmountContainer}>
        <Text style={[styles.transactionAmount, { color: id % 2 === 0 ? '#10b981' : '#1f2937' }]}>
          {id % 2 === 0 ? '+' : ''}{ (Math.random() * 1000).toFixed(2) } €
        </Text>
      </View>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* 1. Header Supérieur (Totalement Fixe) */}
      <View style={[styles.topHeader, { height: TOP_HEADER_HEIGHT }]}>
        <View style={styles.topHeaderInner}>
          <View style={styles.iconButton}>
            <Settings size={24} color="#1f2937" />
          </View>
          <View style={styles.waveLogo}>
             <Text style={styles.waveText}>wave</Text>
          </View>
          <View style={styles.iconButton}>
            <Bell size={24} color="#1f2937" />
          </View>
        </View>
      </View>

      {/* 2. Header de Solde (Sticky) */}
      <Animated.View style={[styles.balanceHeader, stickyBalanceStyle]}>
        <Animated.Text style={[styles.balanceLabel, balanceTextStyle]}>Mon solde</Animated.Text>
        <View style={styles.balanceValueContainer}>
          <Text style={styles.balanceCurrency}>€</Text>
          <Text style={styles.balanceValue}>1.245,50</Text>
        </View>
        <View style={styles.balanceAction}>
          <ChevronRight size={20} color="#6b7280" />
        </View>
      </Animated.View>

      {/* 3. Contenu Défilant */}
      <Animated.ScrollView
        style={styles.scrollView}
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        contentContainerStyle={{
          paddingTop: TOP_HEADER_HEIGHT + BALANCE_HEADER_HEIGHT - 40,
          paddingBottom: 40,
        }}
      >
        <View style={styles.contentCard}>
          <Text style={styles.sectionTitle}>Transactions récentes</Text>
          {[...Array(20).keys()].map(renderTransaction)}
        </View>
      </Animated.ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#3b82f6', // Fond bleu signature Wave
  },
  topHeader: {
    position: 'absolute',
    top: 40, // Simulation SafeArea
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: '#3b82f6',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  topHeaderInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  waveText: {
    color: '#fff',
    fontSize: 24,
    fontWeight: 'bold',
    letterSpacing: -1,
  },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceHeader: {
    position: 'absolute',
    top: 40, // Aligné avec le topHeader
    left: 20,
    right: 20,
    height: BALANCE_HEADER_HEIGHT,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    zIndex: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 5,
    justifyContent: 'center',
    alignItems: 'center',
  },
  balanceLabel: {
    color: '#6b7280',
    fontSize: 14,
    marginBottom: 8,
    fontWeight: '500',
  },
  balanceValueContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  balanceCurrency: {
    fontSize: 24,
    color: '#1f2937',
    fontWeight: '600',
    marginBottom: 4,
    marginRight: 4,
  },
  balanceValue: {
    fontSize: 36,
    color: '#1f2937',
    fontWeight: 'bold',
  },
  balanceAction: {
    position: 'absolute',
    right: 16,
    top: '50%',
    marginTop: -10,
  },
  scrollView: {
    flex: 1,
    zIndex: 1,
  },
  contentCard: {
    backgroundColor: '#f9fafb',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    minHeight: 1000,
    paddingHorizontal: 20,
    paddingTop: 30,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#111827',
    marginBottom: 20,
  },
  transactionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  transactionIconContainer: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#f3f4f6',
  },
  transactionDetails: {
    flex: 1,
    marginLeft: 16,
  },
  transactionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1f2937',
  },
  transactionDate: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  transactionAmountContainer: {
    alignItems: 'flex-end',
  },
  transactionAmount: {
    fontSize: 16,
    fontWeight: '700',
  },
});

export default WaveScrollDemo;
