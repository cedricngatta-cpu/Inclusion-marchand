// Formation & Tutoriels — contenu statique de démonstration
import React, { useState, useEffect, useRef } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    Modal, BackHandler,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
    ChevronLeft, ChevronRight, GraduationCap, ShoppingBag,
    Package, Mic, Store, PieChart, Volume2, VolumeX,
    CheckCircle, Play, X,
} from 'lucide-react-native';
import * as Speech from 'expo-speech';
import { colors } from '@/src/lib/colors';

// ── Types ──────────────────────────────────────────────────────────────────────
interface TutorialStep {
    emoji: string;
    title: string;
    body: string;
}

interface Tutorial {
    id: string;
    title: string;
    description: string;
    icon: React.ComponentType<any>;
    iconBg: string;
    iconColor: string;
    duration: string;
    level: string;
    steps: TutorialStep[];
}

// ── Contenu statique ───────────────────────────────────────────────────────────
const TUTORIALS: Tutorial[] = [
    {
        id: 'vente',
        title: 'Enregistrer une vente',
        description: 'Guide pas à pas pour encaisser un client rapidement',
        icon: ShoppingBag,
        iconBg: '#ecfdf5',
        iconColor: '#059669',
        duration: '3 min',
        level: 'Débutant',
        steps: [
            {
                emoji: '👆',
                title: 'Ouvrir l\'écran Vendre',
                body: 'Depuis le tableau de bord, appuyez sur le bouton vert "Vendre". Vous verrez la liste de vos produits en stock.',
            },
            {
                emoji: '🛍️',
                title: 'Sélectionner les produits',
                body: 'Appuyez sur chaque produit vendu. Un badge orange apparaît pour indiquer la quantité dans le panier. Utilisez les boutons + et − pour ajuster.',
            },
            {
                emoji: '👤',
                title: 'Ajouter le nom du client (optionnel)',
                body: 'Si votre client est connu, tapez son nom dans le champ "Nom du client". Cela vous permettra de retrouver ses achats dans le Carnet.',
            },
            {
                emoji: '💳',
                title: 'Choisir le mode de paiement',
                body: 'Trois options : Espèces (argent comptant), Mobile Money (MoMo, Orange Money…), ou Crédit (le client paie plus tard — dette enregistrée dans le Carnet).',
            },
            {
                emoji: '✅',
                title: 'Valider la vente',
                body: 'Appuyez sur le bouton vert "VALIDER" en bas. La vente est enregistrée, le stock est automatiquement mis à jour et la transaction apparaît dans votre historique.',
            },
        ],
    },
    {
        id: 'stock',
        title: 'Gérer votre stock',
        description: 'Ajouter, modifier et suivre vos produits en magasin',
        icon: Package,
        iconBg: '#fffbeb',
        iconColor: '#d97706',
        duration: '2 min',
        level: 'Débutant',
        steps: [
            {
                emoji: '📦',
                title: 'Accéder à votre inventaire',
                body: 'Appuyez sur "Stock" depuis le tableau de bord. Vous verrez tous vos produits avec leur quantité disponible.',
            },
            {
                emoji: '➕',
                title: 'Ajouter un nouveau produit',
                body: 'Appuyez sur le bouton vert "+" en bas à droite. Renseignez : nom du produit, prix de vente, catégorie et quantité initiale en stock.',
            },
            {
                emoji: '📷',
                title: 'Scanner le code-barres',
                body: 'Dans le formulaire d\'ajout, appuyez sur l\'icône scanner à droite du champ code-barres. Pointez l\'appareil photo vers le code du produit — il sera reconnu automatiquement lors des prochaines ventes.',
            },
            {
                emoji: '✏️',
                title: 'Modifier un produit',
                body: 'Appuyez sur un produit de la liste, puis sur l\'icône crayon. Vous pouvez changer le nom, le prix ou la quantité. Appuyez sur "Enregistrer" pour confirmer.',
            },
            {
                emoji: '🔴',
                title: 'Surveiller les alertes stock bas',
                body: 'Les produits affichés en rouge ou orange ont un stock faible (moins de 3 unités). Pensez à les réapprovisionner via le Marché Virtuel.',
            },
        ],
    },
    {
        id: 'vocal',
        title: 'Assistant vocal',
        description: 'Contrôler l\'application avec votre voix — exemples de commandes',
        icon: Mic,
        iconBg: '#f5f3ff',
        iconColor: '#7c3aed',
        duration: '4 min',
        level: 'Intermédiaire',
        steps: [
            {
                emoji: '🎙️',
                title: 'Activer l\'assistant',
                body: 'Appuyez sur le bouton microphone vert flottant en bas à droite de l\'écran. Le bouton devient rouge — parlez clairement.',
            },
            {
                emoji: '🛒',
                title: 'Commandes de vente',
                body: 'Dites : "Vendre du riz", "Faire une vente", "Enregistrer une vente". L\'application ouvre directement l\'écran Vendre.',
            },
            {
                emoji: '📊',
                title: 'Consulter le stock',
                body: 'Dites : "Voir mon stock", "Combien de riz ?", "Stock disponible". L\'assistant vous indique les quantités ou ouvre l\'écran Stock.',
            },
            {
                emoji: '💰',
                title: 'Consulter le bilan',
                body: 'Dites : "Voir mon bilan", "Combien j\'ai gagné ?", "Revenus du jour". L\'assistant affiche votre chiffre d\'affaires.',
            },
            {
                emoji: '🤝',
                title: 'Commander chez un fournisseur',
                body: 'Dites : "Commander du maïs", "Aller au marché", "Voir les fournisseurs". L\'assistant ouvre le Marché Virtuel.',
            },
            {
                emoji: '💡',
                title: 'Conseils d\'utilisation',
                body: 'Parlez dans une zone calme. Utilisez des mots simples et directs. L\'assistant comprend le français courant. Si la commande locale échoue, l\'IA Groq prend le relais.',
            },
        ],
    },
    {
        id: 'commande',
        title: 'Commander chez un fournisseur',
        description: 'Passer une commande via le Marché Virtuel en quelques étapes',
        icon: Store,
        iconBg: '#eef2ff',
        iconColor: '#4338ca',
        duration: '3 min',
        level: 'Intermédiaire',
        steps: [
            {
                emoji: '🏪',
                title: 'Ouvrir le Marché Virtuel',
                body: 'Depuis le tableau de bord, appuyez sur "Marché". Vous verrez les produits publiés par les producteurs de votre réseau.',
            },
            {
                emoji: '🔍',
                title: 'Chercher un produit',
                body: 'Utilisez la barre de recherche en haut pour filtrer par nom (ex : "riz", "tomate", "maïs"). Les produits disponibles en stock s\'affichent en vert.',
            },
            {
                emoji: '📋',
                title: 'Lire les informations du produit',
                body: 'Chaque produit affiche : prix unitaire, frais de livraison, zone de livraison couverte et délai estimé. Comparez avant de commander.',
            },
            {
                emoji: '🛒',
                title: 'Passer la commande',
                body: 'Appuyez sur "Commander" sur la carte produit. La commande est envoyée au producteur. Vous recevez une notification de confirmation.',
            },
            {
                emoji: '📦',
                title: 'Suivre la livraison',
                body: 'Le producteur accepte, prépare puis livre votre commande. À chaque étape, vous recevez une notification : Acceptée → En livraison → Livrée.',
            },
            {
                emoji: '✅',
                title: 'Réception et stock automatique',
                body: 'Quand le producteur marque la commande comme livrée, le produit est automatiquement ajouté à votre stock. Aucune saisie manuelle nécessaire.',
            },
        ],
    },
    {
        id: 'bilan',
        title: 'Comprendre votre bilan',
        description: 'Lire et interpréter vos chiffres pour mieux gérer votre commerce',
        icon: PieChart,
        iconBg: '#eff6ff',
        iconColor: '#2563eb',
        duration: '2 min',
        level: 'Avancé',
        steps: [
            {
                emoji: '📊',
                title: 'Accéder au Bilan',
                body: 'Depuis le tableau de bord, appuyez sur "Bilan". Vous verrez un résumé de votre activité : ventes, dettes et produits les plus vendus.',
            },
            {
                emoji: '💵',
                title: 'La Caisse du Jour',
                body: 'C\'est l\'argent réellement encaissé aujourd\'hui. Les ventes en crédit (DETTE) ne sont pas comptabilisées ici — elles apparaissent dans le Carnet de dettes.',
            },
            {
                emoji: '📈',
                title: 'Le Graphique des ventes',
                body: 'Le graphique en barres montre vos ventes par jour de la semaine. Les jours hauts = bonnes journées. Identifiez vos jours creux pour planifier des promotions.',
            },
            {
                emoji: '🏆',
                title: 'Les Produits Phares',
                body: 'La section "Top Produits" liste ce qui se vend le mieux. Priorisez ces produits dans votre stock pour ne jamais tomber en rupture.',
            },
            {
                emoji: '💳',
                title: 'Les Dettes en cours',
                body: 'Le montant affiché en orange représente l\'argent que vos clients vous doivent. Rendez-vous dans le Carnet pour suivre et encaisser ces dettes.',
            },
        ],
    },
];

// ── Helper pour le texte audio ─────────────────────────────────────────────────
function buildSpeechText(tutorial: Tutorial): string {
    const intro = `Tutoriel : ${tutorial.title}. ${tutorial.description}. `;
    const steps = tutorial.steps
        .map((s, i) => `Étape ${i + 1} : ${s.title}. ${s.body}`)
        .join(' ... ');
    return intro + steps;
}

// ── Composant principal ────────────────────────────────────────────────────────
export default function FormationScreen() {
    const router = useRouter();
    const [selected, setSelected] = useState<Tutorial | null>(null);
    const [speaking, setSpeaking] = useState(false);
    const [currentStep, setCurrentStep] = useState(0);

    // Arrêter la synthèse vocale si on ferme le modal
    const stopSpeech = async () => {
        await Speech.stop();
        setSpeaking(false);
    };

    // Bouton retour Android dans le modal
    useEffect(() => {
        if (!selected) return;
        const handler = BackHandler.addEventListener('hardwareBackPress', () => {
            stopSpeech();
            setSelected(null);
            setCurrentStep(0);
            return true;
        });
        return () => handler.remove();
    }, [selected]);

    // Nettoyer speech au démontage
    useEffect(() => {
        return () => { Speech.stop(); };
    }, []);

    const openTutorial = (t: Tutorial) => {
        stopSpeech();
        setCurrentStep(0);
        setSelected(t);
    };

    const closeTutorial = () => {
        stopSpeech();
        setSelected(null);
        setCurrentStep(0);
    };

    const toggleSpeech = async () => {
        if (!selected) return;
        if (speaking) {
            await stopSpeech();
        } else {
            setSpeaking(true);
            const text = buildSpeechText(selected);
            Speech.speak(text, {
                language: 'fr-FR',
                rate: 0.88,
                pitch: 1.0,
                onDone: () => setSpeaking(false),
                onError: () => setSpeaking(false),
                onStopped: () => setSpeaking(false),
            });
        }
    };

    const goStep = (dir: 1 | -1) => {
        if (!selected) return;
        const next = currentStep + dir;
        if (next < 0 || next >= selected.steps.length) return;
        setCurrentStep(next);
    };

    return (
        <SafeAreaView style={styles.safe} edges={['top']}>

            {/* ── HEADER ── */}
            <View style={styles.header}>
                <View style={styles.headerTop}>
                    <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
                        <ChevronLeft color={colors.white} size={20} />
                    </TouchableOpacity>
                    <View style={styles.headerTitleBlock}>
                        <Text style={styles.headerTitle}>FORMATION</Text>
                        <Text style={styles.headerSub}>GUIDES & TUTORIELS</Text>
                    </View>
                    <View style={styles.headerBadge}>
                        <GraduationCap color={colors.white} size={18} />
                    </View>
                </View>

                {/* Sous-titre header */}
                <Text style={styles.headerDesc}>
                    Apprenez à utiliser chaque fonctionnalité avec nos guides audio interactifs
                </Text>
            </View>

            {/* ── LISTE TUTORIELS ── */}
            <ScrollView
                style={styles.scroll}
                contentContainerStyle={styles.scrollContent}
                showsVerticalScrollIndicator={false}
            >
                <Text style={styles.sectionLabel}>{TUTORIALS.length} TUTORIELS DISPONIBLES</Text>

                {TUTORIALS.map((tutorial, idx) => {
                    const Icon = tutorial.icon;
                    return (
                        <TouchableOpacity
                            key={tutorial.id}
                            style={styles.card}
                            activeOpacity={0.82}
                            onPress={() => openTutorial(tutorial)}
                        >
                            <View style={[styles.cardIcon, { backgroundColor: tutorial.iconBg }]}>
                                <Icon color={tutorial.iconColor} size={22} />
                            </View>

                            <View style={styles.cardBody}>
                                <View style={styles.cardTitleRow}>
                                    <Text style={styles.cardTitle} numberOfLines={1}>{tutorial.title}</Text>
                                    <View style={[styles.levelBadge, { backgroundColor: tutorial.iconBg }]}>
                                        <Text style={[styles.levelText, { color: tutorial.iconColor }]}>
                                            {tutorial.level}
                                        </Text>
                                    </View>
                                </View>
                                <Text style={styles.cardDesc} numberOfLines={2}>{tutorial.description}</Text>
                                <View style={styles.cardMeta}>
                                    <Play color={colors.slate400} size={10} />
                                    <Text style={styles.cardMetaText}>{tutorial.duration}</Text>
                                    <Text style={styles.cardMetaDot}>·</Text>
                                    <Text style={styles.cardMetaText}>{tutorial.steps.length} étapes</Text>
                                </View>
                            </View>

                            <ChevronRight color={colors.slate300} size={18} />
                        </TouchableOpacity>
                    );
                })}

                {/* Astuce bas de page */}
                <View style={styles.tipCard}>
                    <Volume2 color={colors.primary} size={18} />
                    <View style={{ flex: 1 }}>
                        <Text style={styles.tipTitle}>Tutoriels audio disponibles</Text>
                        <Text style={styles.tipText}>
                            Appuyez sur le bouton 🔊 dans chaque tutoriel pour l'écouter à voix haute — pratique quand vos mains sont occupées.
                        </Text>
                    </View>
                </View>
            </ScrollView>

            {/* ── MODAL TUTORIEL ── */}
            {selected !== null && (
                <Modal visible animationType="slide" statusBarTranslucent>
                    <SafeAreaView style={styles.modalSafe} edges={['top', 'bottom']}>

                        {/* Header modal */}
                        <View style={styles.modalHeader}>
                            <TouchableOpacity style={styles.modalBackBtn} onPress={closeTutorial}>
                                <X color={colors.white} size={20} />
                            </TouchableOpacity>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.modalTitle} numberOfLines={1}>{selected.title}</Text>
                                <Text style={styles.modalSub}>
                                    Étape {currentStep + 1} / {selected.steps.length}
                                </Text>
                            </View>
                            <TouchableOpacity
                                style={[styles.audioBtn, speaking && styles.audioBtnActive]}
                                onPress={toggleSpeech}
                                activeOpacity={0.8}
                            >
                                {speaking
                                    ? <VolumeX color={colors.white} size={18} />
                                    : <Volume2 color={speaking ? colors.white : colors.primary} size={18} />
                                }
                            </TouchableOpacity>
                        </View>

                        {/* Barre de progression */}
                        <View style={styles.progressTrack}>
                            <View
                                style={[
                                    styles.progressFill,
                                    { width: `${((currentStep + 1) / selected.steps.length) * 100}%` },
                                ]}
                            />
                        </View>

                        {/* Contenu de l'étape */}
                        <ScrollView
                            style={styles.stepScroll}
                            contentContainerStyle={styles.stepContent}
                            showsVerticalScrollIndicator={false}
                        >
                            {/* Illustration emoji */}
                            <View style={styles.stepEmoji}>
                                <Text style={styles.stepEmojiText}>
                                    {selected.steps[currentStep].emoji}
                                </Text>
                            </View>

                            <Text style={styles.stepTitle}>
                                {selected.steps[currentStep].title}
                            </Text>
                            <Text style={styles.stepBody}>
                                {selected.steps[currentStep].body}
                            </Text>

                            {/* Indicateurs de toutes les étapes */}
                            <View style={styles.stepsNav}>
                                {selected.steps.map((_, i) => (
                                    <TouchableOpacity
                                        key={i}
                                        style={[
                                            styles.stepDot,
                                            i === currentStep && styles.stepDotActive,
                                            i < currentStep && styles.stepDotDone,
                                        ]}
                                        onPress={() => setCurrentStep(i)}
                                    >
                                        {i < currentStep && (
                                            <CheckCircle color={colors.white} size={10} />
                                        )}
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Aperçu rapide des autres étapes */}
                            <View style={styles.allSteps}>
                                <Text style={styles.allStepsTitle}>TOUTES LES ÉTAPES</Text>
                                {selected.steps.map((step, i) => (
                                    <TouchableOpacity
                                        key={i}
                                        style={[
                                            styles.stepItem,
                                            i === currentStep && styles.stepItemActive,
                                        ]}
                                        onPress={() => setCurrentStep(i)}
                                        activeOpacity={0.75}
                                    >
                                        <View style={[
                                            styles.stepNum,
                                            i < currentStep && styles.stepNumDone,
                                            i === currentStep && styles.stepNumActive,
                                        ]}>
                                            {i < currentStep
                                                ? <CheckCircle color={colors.white} size={12} />
                                                : <Text style={[
                                                    styles.stepNumText,
                                                    (i === currentStep) && { color: colors.white },
                                                ]}>{i + 1}</Text>
                                            }
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[
                                                styles.stepItemTitle,
                                                i === currentStep && styles.stepItemTitleActive,
                                                i < currentStep && styles.stepItemTitleDone,
                                            ]} numberOfLines={1}>
                                                {step.emoji} {step.title}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </ScrollView>

                        {/* Navigation étapes */}
                        <View style={styles.navRow}>
                            <TouchableOpacity
                                style={[styles.navBtn, currentStep === 0 && styles.navBtnDisabled]}
                                onPress={() => goStep(-1)}
                                disabled={currentStep === 0}
                                activeOpacity={0.8}
                            >
                                <ChevronLeft
                                    color={currentStep === 0 ? colors.slate300 : colors.slate700}
                                    size={20}
                                />
                                <Text style={[styles.navBtnText, currentStep === 0 && { color: colors.slate300 }]}>
                                    Précédent
                                </Text>
                            </TouchableOpacity>

                            {currentStep < selected.steps.length - 1 ? (
                                <TouchableOpacity
                                    style={styles.navBtnPrimary}
                                    onPress={() => goStep(1)}
                                    activeOpacity={0.85}
                                >
                                    <Text style={styles.navBtnPrimaryText}>Suivant</Text>
                                    <ChevronRight color={colors.white} size={20} />
                                </TouchableOpacity>
                            ) : (
                                <TouchableOpacity
                                    style={styles.navBtnFinish}
                                    onPress={closeTutorial}
                                    activeOpacity={0.85}
                                >
                                    <CheckCircle color={colors.white} size={16} />
                                    <Text style={styles.navBtnPrimaryText}>Terminer</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                    </SafeAreaView>
                </Modal>
            )}
        </SafeAreaView>
    );
}

// ── Styles ─────────────────────────────────────────────────────────────────────
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
        gap: 12,
    },
    headerTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backBtn: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerTitleBlock: { alignItems: 'center', flex: 1, marginHorizontal: 12 },
    headerTitle: { fontSize: 16, fontWeight: '900', color: colors.white, letterSpacing: 1 },
    headerSub:   { fontSize: 9, fontWeight: '700', color: 'rgba(255,255,255,0.7)', letterSpacing: 3, marginTop: 2 },
    headerBadge: {
        width: 40, height: 40, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
    },
    headerDesc: {
        fontSize: 12, color: 'rgba(255,255,255,0.75)', textAlign: 'center',
        fontWeight: '500', lineHeight: 18,
    },

    // ── Liste ──
    scroll:        { flex: 1 },
    scrollContent: { paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40, gap: 12 },
    sectionLabel: {
        fontSize: 10, fontWeight: '900', color: colors.slate400,
        letterSpacing: 2, marginBottom: 4,
    },

    card: {
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: colors.white, borderRadius: 10, padding: 16,
        borderWidth: 1, borderColor: colors.slate100,
        shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    },
    cardIcon: { width: 48, height: 48, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
    cardBody:  { flex: 1, minWidth: 0 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' },
    cardTitle:    { fontSize: 14, fontWeight: '800', color: colors.slate800, flex: 1 },
    levelBadge:   { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, flexShrink: 0 },
    levelText:    { fontSize: 9, fontWeight: '700' },
    cardDesc:     { fontSize: 12, color: colors.slate500, lineHeight: 17, marginBottom: 6 },
    cardMeta:     { flexDirection: 'row', alignItems: 'center', gap: 5 },
    cardMetaText: { fontSize: 10, color: colors.slate400, fontWeight: '600' },
    cardMetaDot:  { fontSize: 10, color: colors.slate300 },

    tipCard: {
        flexDirection: 'row', gap: 12, alignItems: 'flex-start',
        backgroundColor: '#ecfdf5', borderRadius: 10, padding: 16,
        borderWidth: 1, borderColor: '#a7f3d0',
        marginTop: 4,
    },
    tipTitle: { fontSize: 13, fontWeight: '800', color: colors.slate800, marginBottom: 4 },
    tipText:  { fontSize: 12, color: colors.slate600, lineHeight: 18 },

    // ── Modal ──
    modalSafe: { flex: 1, backgroundColor: colors.white },

    modalHeader: {
        flexDirection: 'row', alignItems: 'center', gap: 12,
        backgroundColor: colors.primary,
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 16,
    },
    modalBackBtn: {
        width: 38, height: 38, borderRadius: 10,
        backgroundColor: 'rgba(255,255,255,0.2)',
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
    },
    modalTitle: { fontSize: 15, fontWeight: '900', color: colors.white },
    modalSub:   { fontSize: 10, color: 'rgba(255,255,255,0.7)', marginTop: 2, fontWeight: '600' },

    audioBtn: {
        width: 38, height: 38, borderRadius: 10,
        backgroundColor: colors.white,
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
    },
    audioBtnActive: { backgroundColor: '#ef4444' },

    progressTrack: { height: 4, backgroundColor: colors.slate100 },
    progressFill:  { height: 4, backgroundColor: colors.primary, borderRadius: 2 },

    // ── Étape ──
    stepScroll:  { flex: 1 },
    stepContent: { paddingHorizontal: 24, paddingTop: 32, paddingBottom: 24, gap: 20 },

    stepEmoji: {
        width: 100, height: 100, borderRadius: 10,
        backgroundColor: colors.bgSecondary,
        alignItems: 'center', justifyContent: 'center',
        alignSelf: 'center',
        borderWidth: 1, borderColor: colors.slate100,
    },
    stepEmojiText: { fontSize: 52 },
    stepTitle: { fontSize: 20, fontWeight: '900', color: colors.slate900, textAlign: 'center', lineHeight: 28 },
    stepBody:  { fontSize: 15, color: colors.slate600, lineHeight: 24, textAlign: 'center' },

    stepsNav: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginTop: 8 },
    stepDot: {
        width: 28, height: 10, borderRadius: 5,
        backgroundColor: colors.slate200,
        alignItems: 'center', justifyContent: 'center',
    },
    stepDotActive: { backgroundColor: colors.primary, width: 28 },
    stepDotDone:   { backgroundColor: '#a7f3d0', width: 10 },

    // Récap étapes
    allSteps:      { marginTop: 8, gap: 8 },
    allStepsTitle: { fontSize: 9, fontWeight: '900', color: colors.slate400, letterSpacing: 2, marginBottom: 4 },
    stepItem: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10,
        borderWidth: 1, borderColor: colors.slate100,
        backgroundColor: colors.bgSecondary,
    },
    stepItemActive: { backgroundColor: '#ecfdf5', borderColor: '#6ee7b7' },
    stepNum: {
        width: 26, height: 26, borderRadius: 8,
        backgroundColor: colors.slate100,
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
    },
    stepNumDone:    { backgroundColor: colors.primary },
    stepNumActive:  { backgroundColor: colors.primary },
    stepNumText:    { fontSize: 11, fontWeight: '900', color: colors.slate500 },
    stepItemTitle:  { fontSize: 12, fontWeight: '700', color: colors.slate500 },
    stepItemTitleActive: { color: colors.primary },
    stepItemTitleDone:   { color: colors.slate400 },

    // Navigation
    navRow: {
        flexDirection: 'row', gap: 10,
        paddingHorizontal: 16, paddingVertical: 16,
        borderTopWidth: 1, borderTopColor: colors.slate100,
        backgroundColor: colors.white,
    },
    navBtn: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4,
        paddingVertical: 14, borderRadius: 10,
        borderWidth: 1.5, borderColor: colors.slate200,
        backgroundColor: colors.white,
    },
    navBtnDisabled: { borderColor: colors.slate100, backgroundColor: colors.slate50 },
    navBtnText:     { fontSize: 13, fontWeight: '700', color: colors.slate700 },
    navBtnPrimary: {
        flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 14, borderRadius: 10,
        backgroundColor: colors.primary,
        shadowColor: colors.primary, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
    },
    navBtnFinish: {
        flex: 1.5, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
        paddingVertical: 14, borderRadius: 10,
        backgroundColor: '#16a34a',
        shadowColor: '#16a34a', shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
    },
    navBtnPrimaryText: { fontSize: 14, fontWeight: '900', color: colors.white },
});
