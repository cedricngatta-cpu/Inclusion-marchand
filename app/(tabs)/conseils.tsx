// Conseils financiers automatisés — analyse IA Groq + règles locales
import React, { useState, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import {
    ChevronLeft, RefreshCw, TrendingUp, TrendingDown,
    Package, AlertTriangle, Lightbulb, Sparkles,
} from 'lucide-react-native';
import { useAuth } from '@/src/context/AuthContext';
import { useProfileContext } from '@/src/context/ProfileContext';
import { supabase } from '@/src/lib/supabase';
import { colors } from '@/src/lib/colors';

const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY ?? '';
const CHAT_URL     = 'https://api.groq.com/openai/v1/chat/completions';
const CHAT_MODEL   = 'llama-3.3-70b-versatile';

// ── Types ──────────────────────────────────────────────────────────────────

type ConseilType = 'STOCK_BAS' | 'INVENDU' | 'HAUSSE' | 'BAISSE' | 'IA';

interface Conseil {
    id:      string;
    type:    ConseilType;
    titre:   string;
    message: string;
    action?: string;
}

// ── Config visuelle par type ───────────────────────────────────────────────

const CONSEIL_CONFIG: Record<ConseilType, {
    bg: string; border: string; icon: any; iconColor: string; badge: string; badgeBg: string;
}> = {
    STOCK_BAS: {
        bg: '#fffbeb', border: '#fde68a', icon: Package,
        iconColor: '#d97706', badge: 'STOCK', badgeBg: '#fef3c7',
    },
    INVENDU: {
        bg: '#fff1f2', border: '#fecdd3', icon: AlertTriangle,
        iconColor: '#e11d48', badge: 'ALERTE', badgeBg: '#ffe4e6',
    },
    HAUSSE: {
        bg: '#ecfdf5', border: '#a7f3d0', icon: TrendingUp,
        iconColor: '#059669', badge: 'HAUSSE', badgeBg: '#d1fae5',
    },
    BAISSE: {
        bg: '#fff1f2', border: '#fecdd3', icon: TrendingDown,
        iconColor: '#e11d48', badge: 'BAISSE', badgeBg: '#ffe4e6',
    },
    IA: {
        bg: '#faf5ff', border: '#e9d5ff', icon: Sparkles,
        iconColor: '#7c3aed', badge: 'IA', badgeBg: '#ede9fe',
    },
};

// ── Helpers ────────────────────────────────────────────────────────────────

function startOfMonth(date: Date): string {
    return new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
}
function startOfLastMonth(date: Date): string {
    return new Date(date.getFullYear(), date.getMonth() - 1, 1).toISOString();
}
function endOfLastMonth(date: Date): string {
    return new Date(date.getFullYear(), date.getMonth(), 0, 23, 59, 59).toISOString();
}
function daysAgo(n: number): string {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d.toISOString();
}

// ── Fetch + analyse + Groq ─────────────────────────────────────────────────

async function analyserDonnees(storeId: string): Promise<Conseil[]> {
    const now = new Date();
    const conseils: Conseil[] = [];

    // ─ Transactions ce mois ─
    const { data: txMois } = await supabase
        .from('transactions')
        .select('price, product_id, product_name, quantity, created_at, status')
        .eq('store_id', storeId)
        .eq('type', 'VENTE')
        .gte('created_at', startOfMonth(now));

    const txMoisList = txMois ?? [];

    // ─ Transactions mois dernier ─
    const { data: txPrev } = await supabase
        .from('transactions')
        .select('price, product_id, quantity')
        .eq('store_id', storeId)
        .eq('type', 'VENTE')
        .gte('created_at', startOfLastMonth(now))
        .lte('created_at', endOfLastMonth(now));

    const txPrevList = txPrev ?? [];

    // ─ Stock ─
    const { data: stockRows } = await supabase
        .from('stock')
        .select('product_id, quantity')
        .eq('store_id', storeId);

    const stockList = stockRows ?? [];

    // ─ Produits ─
    const allProductIds = [
        ...new Set([
            ...stockList.map((s: any) => s.product_id),
            ...txMoisList.map((t: any) => t.product_id).filter(Boolean),
        ]),
    ].filter(Boolean);

    let prodMap: Record<string, { name: string; price: number }> = {};
    if (allProductIds.length > 0) {
        const { data: prods } = await supabase
            .from('products')
            .select('id, name, price')
            .in('id', allProductIds);
        (prods ?? []).forEach((p: any) => { prodMap[p.id] = { name: p.name, price: p.price }; });
    }

    // ────────────────────────────────────────────────
    // RÈGLE 1 — Stock bas sur produits qui se vendent bien
    // ────────────────────────────────────────────────
    const ventesCeMois: Record<string, number> = {};
    txMoisList.forEach((t: any) => {
        if (t.product_id) {
            ventesCeMois[t.product_id] = (ventesCeMois[t.product_id] ?? 0) + (t.quantity ?? 1);
        }
    });

    // Seuil stock bas = 5 unités, best-seller = vendu ≥ 3 fois ce mois
    stockList.forEach((s: any) => {
        const qty = s.quantity ?? 0;
        const ventes = ventesCeMois[s.product_id] ?? 0;
        if (qty > 0 && qty < 5 && ventes >= 3) {
            const nom = prodMap[s.product_id]?.name ?? 'ce produit';
            conseils.push({
                id:      `stock_${s.product_id}`,
                type:    'STOCK_BAS',
                titre:   `Stock bas — ${nom}`,
                message: `Il ne reste que ${qty} unité${qty > 1 ? 's' : ''} de ${nom}, qui se vend bien (${ventes} ventes ce mois). Pensez à réapprovisionner.`,
                action:  'Voir le stock',
            });
        }
    });

    // ────────────────────────────────────────────────
    // RÈGLE 2 — Produits invendus depuis 21 jours (avec stock > 0)
    // ────────────────────────────────────────────────
    const limitDate = daysAgo(21);
    const venduRecemment = new Set(
        txMoisList
            .filter((t: any) => t.created_at >= limitDate && t.product_id)
            .map((t: any) => t.product_id)
    );

    stockList
        .filter((s: any) => (s.quantity ?? 0) > 0 && !venduRecemment.has(s.product_id))
        .slice(0, 2) // max 2 conseils invendus
        .forEach((s: any) => {
            const nom = prodMap[s.product_id]?.name ?? 'ce produit';
            conseils.push({
                id:      `invendu_${s.product_id}`,
                type:    'INVENDU',
                titre:   `Produit peu vendu — ${nom}`,
                message: `${nom} n'a pas été vendu ces 3 dernières semaines. Envisagez une promotion ou de baisser temporairement le prix.`,
                action:  'Voir les produits',
            });
        });

    // ────────────────────────────────────────────────
    // RÈGLE 3 — Tendance ventes (hausse / baisse)
    // ────────────────────────────────────────────────
    const totalMois = txMoisList.reduce((a: number, t: any) => a + (t.price ?? 0), 0);
    const totalPrev = txPrevList.reduce((a: number, t: any) => a + (t.price ?? 0), 0);

    if (totalPrev > 0) {
        const diff = ((totalMois - totalPrev) / totalPrev) * 100;
        if (diff >= 10) {
            conseils.push({
                id:      'tendance_hausse',
                type:    'HAUSSE',
                titre:   `Ventes en hausse de ${Math.round(diff)}% 🎉`,
                message: `Ce mois : ${totalMois.toLocaleString('fr-FR')} F contre ${totalPrev.toLocaleString('fr-FR')} F le mois dernier. Continuez sur cette lancée !`,
            });
        } else if (diff <= -10) {
            conseils.push({
                id:      'tendance_baisse',
                type:    'BAISSE',
                titre:   `Ventes en baisse de ${Math.abs(Math.round(diff))}%`,
                message: `Ce mois : ${totalMois.toLocaleString('fr-FR')} F contre ${totalPrev.toLocaleString('fr-FR')} F le mois dernier. Essayez de diversifier ou de promouvoir vos produits.`,
            });
        }
    }

    // ────────────────────────────────────────────────
    // GROQ IA — conseils personnalisés supplémentaires
    // ────────────────────────────────────────────────
    if (GROQ_API_KEY) {
        try {
            // Construire le résumé des données pour Groq
            const topProduits = Object.entries(ventesCeMois)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 3)
                .map(([id, qty]) => `${prodMap[id]?.name ?? id} (${qty} vendus)`)
                .join(', ') || 'aucun';

            const stockCritique = stockList
                .filter((s: any) => (s.quantity ?? 0) < 3 && (s.quantity ?? 0) > 0)
                .map((s: any) => `${prodMap[s.product_id]?.name ?? '?'} (${s.quantity} restant)`)
                .join(', ') || 'aucun';

            const contexte = [
                `Chiffre d'affaires ce mois : ${totalMois.toLocaleString('fr-FR')} F`,
                `Chiffre d'affaires mois dernier : ${totalPrev.toLocaleString('fr-FR')} F`,
                `Nombre de ventes ce mois : ${txMoisList.length}`,
                `Top produits vendus ce mois : ${topProduits}`,
                `Stock critique (< 3 unités) : ${stockCritique}`,
                `Nombre de produits en stock : ${stockList.filter((s: any) => (s.quantity ?? 0) > 0).length}`,
            ].join('\n');

            const prompt = `Tu es un conseiller financier pour un commerçant africain (Côte d'Ivoire).
Voici ses données de vente :

${contexte}

Génère exactement 2 conseils courts et pratiques en français. Chaque conseil doit :
- Être concret et actionnable (pas générique)
- Faire maximum 2 phrases
- Être adapté au contexte africain (petit commerce, F CFA)

Réponds UNIQUEMENT au format JSON valide, sans texte avant/après :
[
  {"titre": "Titre court", "message": "Conseil précis et actionnable."},
  {"titre": "Titre court", "message": "Conseil précis et actionnable."}
]`;

            const res = await fetch(CHAT_URL, {
                method:  'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Bearer ${GROQ_API_KEY}`,
                },
                body: JSON.stringify({
                    model:       CHAT_MODEL,
                    messages:    [{ role: 'user', content: prompt }],
                    temperature: 0.6,
                    max_tokens:  400,
                }),
            });

            if (res.ok) {
                const data  = await res.json();
                const raw   = (data.choices?.[0]?.message?.content ?? '').trim();
                // Extraire le JSON même si entouré de ```json ... ```
                const match = raw.match(/\[[\s\S]*\]/);
                if (match) {
                    const iaItems = JSON.parse(match[0]) as { titre: string; message: string }[];
                    iaItems.slice(0, 2).forEach((item, i) => {
                        if (item.titre && item.message) {
                            conseils.push({
                                id:      `ia_${i}`,
                                type:    'IA',
                                titre:   item.titre,
                                message: item.message,
                            });
                        }
                    });
                }
            }
        } catch (e) {
            console.warn('[conseils] Groq IA échoué, conseils locaux uniquement');
        }
    }

    return conseils;
}

// ── Composant ──────────────────────────────────────────────────────────────

export default function ConseilsScreen() {
    const router        = useRouter();
    const { user }          = useAuth();
    const { activeProfile } = useProfileContext();

    const [conseils,  setConseils]  = useState<Conseil[]>([]);
    const [loading,   setLoading]   = useState(false);
    const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
    const [hasLoaded, setHasLoaded] = useState(false);

    const charger = useCallback(async () => {
        const storeId = activeProfile?.id;
        if (!storeId) return;

        setLoading(true);
        try {
            const result = await analyserDonnees(storeId);
            setConseils(result);
            setLastUpdate(new Date());
            setHasLoaded(true);
        } catch (e) {
            console.error('[conseils] Erreur analyse:', e);
        } finally {
            setLoading(false);
        }
    }, [activeProfile?.id]);

    // Charger au premier focus seulement
    useFocusEffect(useCallback(() => {
        if (!hasLoaded) charger();
    }, [hasLoaded, charger]));

    const firstName = user?.name?.split(' ')[0] || 'Marchand';

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>

            {/* ── HEADER ── */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <View style={styles.headerTitleBlock}>
                        <Text style={styles.headerTitle}>MES CONSEILS</Text>
                        <Text style={styles.headerSub}>ANALYSE INTELLIGENTE</Text>
                    </View>
                    <TouchableOpacity
                        style={[styles.refreshBtn, loading && { opacity: 0.5 }]}
                        onPress={charger}
                        disabled={loading}
                    >
                        <RefreshCw color={colors.white} size={18} />
                    </TouchableOpacity>
                </View>

                {/* Résumé */}
                <View style={styles.kpiBlock}>
                    <Lightbulb color="rgba(255,255,255,0.8)" size={20} />
                    <Text style={styles.kpiText}>
                        {loading
                            ? 'Analyse en cours...'
                            : hasLoaded
                                ? `${conseils.length} conseil${conseils.length !== 1 ? 's' : ''} pour ${firstName}`
                                : `Appuyez sur ↻ pour analyser, ${firstName}`}
                    </Text>
                </View>
            </View>

            {/* ── CONTENU ── */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                {/* Chargement */}
                {loading && (
                    <View style={styles.loadingBox}>
                        <ActivityIndicator color={colors.primary} size="large" />
                        <Text style={styles.loadingText}>Analyse de vos données en cours...</Text>
                        <Text style={styles.loadingSubText}>Intelligence artificielle Groq Llama</Text>
                    </View>
                )}

                {/* Aucun conseil */}
                {!loading && hasLoaded && conseils.length === 0 && (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyEmoji}>🎉</Text>
                        <Text style={styles.emptyTitle}>TOUT VA BIEN !</Text>
                        <Text style={styles.emptyText}>Aucune alerte détectée. Votre boutique tourne bien.</Text>
                    </View>
                )}

                {/* État initial */}
                {!loading && !hasLoaded && (
                    <View style={styles.emptyCard}>
                        <Text style={styles.emptyEmoji}>🤖</Text>
                        <Text style={styles.emptyTitle}>PRÊT À ANALYSER</Text>
                        <Text style={styles.emptyText}>
                            L'IA va analyser vos ventes et votre stock pour vous donner des conseils personnalisés.
                        </Text>
                        <TouchableOpacity style={styles.analyseBtn} onPress={charger}>
                            <Sparkles color={colors.white} size={16} />
                            <Text style={styles.analyseBtnText}>ANALYSER MA BOUTIQUE</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Conseils */}
                {!loading && conseils.map(conseil => {
                    const cfg = CONSEIL_CONFIG[conseil.type];
                    const IconComp = cfg.icon;
                    return (
                        <View
                            key={conseil.id}
                            style={[styles.conseilCard, { backgroundColor: cfg.bg, borderColor: cfg.border }]}
                        >
                            <View style={styles.conseilHeader}>
                                <View style={[styles.conseilIconBox, { backgroundColor: cfg.bg }]}>
                                    <IconComp color={cfg.iconColor} size={22} />
                                </View>
                                <View style={styles.conseilTitleBlock}>
                                    <View style={[styles.badge, { backgroundColor: cfg.badgeBg }]}>
                                        <Text style={[styles.badgeText, { color: cfg.iconColor }]}>{cfg.badge}</Text>
                                    </View>
                                    <Text style={styles.conseilTitre} numberOfLines={2}>{conseil.titre}</Text>
                                </View>
                            </View>
                            <Text style={styles.conseilMessage}>{conseil.message}</Text>
                            {conseil.action && (
                                <TouchableOpacity style={[styles.actionBtn, { borderColor: cfg.border }]}>
                                    <Text style={[styles.actionBtnText, { color: cfg.iconColor }]}>
                                        {conseil.action} →
                                    </Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    );
                })}

                {/* Horodatage */}
                {lastUpdate && !loading && (
                    <Text style={styles.timestamp}>
                        Dernière analyse : {lastUpdate.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                )}
            </ScrollView>

        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safe: { flex: 1, backgroundColor: colors.bgSecondary },

    // ── Header ──
    header: {
        backgroundColor: colors.primary,
        paddingHorizontal: 16,
        paddingTop: 8,
        paddingBottom: 24,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
    },
    headerTop: {
        flexDirection: 'row', alignItems: 'center',
        justifyContent: 'space-between', marginBottom: 20,
    },
    backBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitleBlock: { alignItems: 'center' },
    headerTitle: { fontSize: 16, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    headerSub:   { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 3, marginTop: 2 },
    refreshBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },

    kpiBlock: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 4 },
    kpiText:  { fontSize: 13, fontWeight: '700', color: 'rgba(255,255,255,0.9)' },

    // ── Scroll ──
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 14 },

    // ── Chargement ──
    loadingBox: {
        backgroundColor: colors.white, borderRadius: 10,
        padding: 40, alignItems: 'center', gap: 12,
        borderWidth: 1, borderColor: colors.slate100,
    },
    loadingText:    { fontSize: 14, fontWeight: '700', color: colors.slate700, textAlign: 'center' },
    loadingSubText: { fontSize: 11, fontWeight: '600', color: colors.slate400, textAlign: 'center' },

    // ── Vide ──
    emptyCard: {
        backgroundColor: colors.white, borderRadius: 10, padding: 40,
        alignItems: 'center', gap: 12,
        borderWidth: 2, borderColor: colors.slate100, borderStyle: 'dashed',
    },
    emptyEmoji: { fontSize: 40 },
    emptyTitle: { fontSize: 15, fontWeight: '900', color: colors.slate700, letterSpacing: 1 },
    emptyText:  { fontSize: 13, fontWeight: '600', color: colors.slate400, textAlign: 'center', lineHeight: 20 },
    analyseBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 14,
        borderRadius: 10, marginTop: 8,
    },
    analyseBtnText: { fontSize: 12, fontWeight: '900', color: colors.white, letterSpacing: 1 },

    // ── Conseil card ──
    conseilCard: {
        borderRadius: 10, padding: 16,
        borderWidth: 1,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05, shadowRadius: 4, elevation: 2,
    },
    conseilHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 10 },
    conseilIconBox: {
        width: 44, height: 44, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center',
        borderWidth: 1, borderColor: 'rgba(0,0,0,0.06)', flexShrink: 0,
    },
    conseilTitleBlock: { flex: 1, gap: 4 },
    badge:       { alignSelf: 'flex-start', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
    badgeText:   { fontSize: 9, fontWeight: '900', letterSpacing: 1 },
    conseilTitre: { fontSize: 14, fontWeight: '900', color: colors.slate800, lineHeight: 20 },
    conseilMessage: { fontSize: 13, fontWeight: '500', color: colors.slate600, lineHeight: 20 },
    actionBtn: {
        alignSelf: 'flex-start', marginTop: 12,
        paddingHorizontal: 14, paddingVertical: 8,
        borderRadius: 8, borderWidth: 1, backgroundColor: 'rgba(255,255,255,0.6)',
    },
    actionBtnText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.5 },

    // ── Timestamp ──
    timestamp: {
        fontSize: 10, fontWeight: '600', color: colors.slate300,
        textAlign: 'center', letterSpacing: 1,
    },
});
