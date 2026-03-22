// Page d'accueil Julaba — landing page animee responsive
import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
    View, Text, ScrollView, StyleSheet, TouchableOpacity,
    useWindowDimensions, Platform, Animated,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
    Package, TrendingUp, Wallet, Mic, Users, Smartphone,
    Store, Truck, MapPin, Shield, ChevronRight, ArrowRight,
    Mail, Phone as PhoneIcon, Facebook, Instagram, Linkedin, Twitter,
    UserPlus, Settings, Rocket, UserCheck, Menu, X,
} from 'lucide-react-native';
import JulabaLogo from './JulabaLogo';

// ── Couleurs ────────────────────────────────────────────────────────────────
const C = {
    primary: '#C47316', primaryDark: '#A36012', primaryLight: '#D4882E',
    dark: '#1E1E1E', cream: '#FFF8F0', white: '#FFFFFF', success: '#059669',
};

// ── Donnees ─────────────────────────────────────────────────────────────────
const FEATURES = [
    { Icon: Package,    title: 'Gestion de Stock',   desc: "Suivez vos stocks en temps réel, recevez des alertes de rupture" },
    { Icon: TrendingUp, title: 'Suivi des Ventes',   desc: "Analysez vos ventes quotidiennes et votre chiffre d'affaires" },
    { Icon: Wallet,     title: 'Crédit Client',      desc: "Gérez les crédits de vos clients en toute simplicité" },
    { Icon: Mic,        title: 'Assistant Vocal IA',  desc: "Parlez en Français ou Dioula, l'IA comprend et exécute" },
    { Icon: Users,      title: 'Coopératives',       desc: "Regroupez-vous pour des achats groupés à meilleur prix" },
    { Icon: Smartphone, title: 'Paiements Mobile',   desc: "Wave, Orange Money, MTN — tous les paiements intégrés" },
];

const STEPS = [
    { Icon: UserPlus, title: 'Inscrivez-vous', desc: "Créez votre compte en 30 secondes avec votre numéro" },
    { Icon: Settings,  title: 'Configurez',    desc: "Ajoutez vos produits et paramétrez votre boutique" },
    { Icon: Rocket,    title: 'Gérez tout',    desc: "Stocks, ventes, crédits — tout depuis votre téléphone" },
];

const ROLES_DATA = [
    { Icon: Store,     title: 'Marchand',       desc: "Gérez votre boutique, stocks et ventes au quotidien",           color: C.primary },
    { Icon: Truck,     title: 'Producteur',     desc: "Suivez vos livraisons et gérez vos commandes",                  color: '#2563EB' },
    { Icon: UserCheck, title: 'Agent Terrain',  desc: "Enrôlez les marchands et supervisez votre zone",                color: C.success },
    { Icon: Users,     title: 'Coopérative',    desc: "Coordonnez les achats groupés et gérez vos membres",            color: '#7C3AED' },
    { Icon: Shield,    title: 'Superviseur',    desc: "Tableau de bord complet, statistiques et contrôle",             color: '#DC2626' },
];

const TESTIMONIALS = [
    { initials: 'AK', name: 'Aminata K.', role: 'Marchande, Adjamé',    text: "Depuis que j'utilise Jùlaba, je ne perds plus le fil de mes crédits clients." },
    { initials: 'KB', name: 'Kouassi B.', role: 'Producteur, Bouaké',   text: "Les achats groupés m'ont permis de réduire mes coûts de 30%." },
    { initials: 'FD', name: 'Fatou D.',   role: 'Coopérative, Daloa',   text: "L'assistant vocal en Dioula, c'est ce qui a convaincu toutes nos femmes." },
];

const STATS = [
    { target: 5000, suffix: '+', label: 'Marchands' },
    { target: 200,  suffix: '+', label: 'Coopératives' },
    { target: 15,   suffix: '+', label: 'Villes' },
];

const NAV_LINKS = [
    { label: 'Accueil', id: 'hero' },
    { label: 'Fonctionnalités', id: 'features' },
    { label: 'Rôles', id: 'roles' },
    { label: 'Contact', id: 'footer' },
];

// ── Compteur anime ──────────────────────────────────────────────────────────
function CounterStat({ target, suffix, label }: { target: number; suffix: string; label: string }) {
    const [val, setVal] = useState(0);
    useEffect(() => {
        const dur = 1500;
        const start = Date.now();
        let frame: number;
        const tick = () => {
            const p = Math.min((Date.now() - start) / dur, 1);
            setVal(Math.floor((1 - Math.pow(1 - p, 3)) * target));
            if (p < 1) frame = requestAnimationFrame(tick);
        };
        const t = setTimeout(() => { frame = requestAnimationFrame(tick); }, 600);
        return () => { clearTimeout(t); cancelAnimationFrame(frame); };
    }, [target]);
    return (
        <View style={s.statItem}>
            <Text style={s.statNumber}>{val.toLocaleString('fr-FR')}{suffix}</Text>
            <Text style={s.statLabel}>{label}</Text>
        </View>
    );
}

// ── Section animee (fade-in + slide-up au scroll) ───────────────────────────
function AnimatedSection({ visible, delay = 0, children, style }: any) {
    const anim = useRef(new Animated.Value(0)).current;
    const done = useRef(false);
    useEffect(() => {
        if (visible && !done.current) {
            done.current = true;
            const t = setTimeout(() => {
                Animated.timing(anim, { toValue: 1, duration: 600, useNativeDriver: false }).start();
            }, delay);
            return () => clearTimeout(t);
        }
    }, [visible]);
    return (
        <Animated.View style={[style, {
            opacity: anim,
            transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
        }]}>
            {children}
        </Animated.View>
    );
}

// ── Composant principal ─────────────────────────────────────────────────────
export default function LandingPage() {
    const router = useRouter();
    const { width } = useWindowDimensions();
    const isDesktop = width > 1024;
    const isTablet = width > 768 && width <= 1024;
    const isMobile = width <= 768;

    const scrollRef = useRef<ScrollView>(null);
    const [navSolid, setNavSolid] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const sections = useRef<Record<string, number>>({});
    const [visible, setVisible] = useState<Record<string, boolean>>({});

    // CSS global pour cacher la scrollbar sur le web
    useEffect(() => {
        if (Platform.OS === 'web') {
            const style = document.createElement('style');
            style.textContent = `
                * { scrollbar-width: none; -ms-overflow-style: none; }
                *::-webkit-scrollbar { display: none; }
            `;
            document.head.appendChild(style);
            return () => { document.head.removeChild(style); };
        }
    }, []);

    // Hero animations
    const heroLogo = useRef(new Animated.Value(0.6)).current;
    const heroText = useRef(new Animated.Value(0)).current;
    const heroSub  = useRef(new Animated.Value(0)).current;
    const heroBtns = useRef(new Animated.Value(0)).current;
    const ctaPulse = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.spring(heroLogo, { toValue: 1, friction: 6, tension: 40, useNativeDriver: false }).start();
        Animated.sequence([
            Animated.delay(300),
            Animated.timing(heroText, { toValue: 1, duration: 600, useNativeDriver: false }),
        ]).start();
        Animated.sequence([
            Animated.delay(500),
            Animated.timing(heroSub, { toValue: 1, duration: 600, useNativeDriver: false }),
        ]).start();
        Animated.sequence([
            Animated.delay(700),
            Animated.timing(heroBtns, { toValue: 1, duration: 600, useNativeDriver: false }),
        ]).start();
        Animated.loop(Animated.sequence([
            Animated.timing(ctaPulse, { toValue: 1.04, duration: 1200, useNativeDriver: false }),
            Animated.timing(ctaPulse, { toValue: 1, duration: 1200, useNativeDriver: false }),
        ])).start();
    }, []);

    const handleScroll = useCallback((e: any) => {
        const y = e.nativeEvent.contentOffset.y;
        const h = e.nativeEvent.layoutMeasurement.height;
        setNavSolid(y > 50);
        const threshold = y + h * 0.78;
        setVisible(prev => {
            const next = { ...prev };
            let changed = false;
            for (const [id, pos] of Object.entries(sections.current)) {
                if (pos <= threshold && !prev[id]) { next[id] = true; changed = true; }
            }
            return changed ? next : prev;
        });
    }, []);

    const reg = (id: string) => (e: any) => { sections.current[id] = e.nativeEvent.layout.y; };
    const scrollTo = (id: string) => {
        const y = sections.current[id];
        if (y !== undefined) scrollRef.current?.scrollTo({ y: y - 60, animated: true });
        setMenuOpen(false);
    };

    const featureCols = isDesktop ? 3 : isTablet ? 2 : 1;
    const roleCols = isDesktop ? 5 : isTablet ? 3 : 1;

    return (
        <View style={{ flex: 1 }}>
            {/* ── NAVBAR ── */}
            <View style={[
                s.nav, navSolid && s.navSolid,
                { position: Platform.OS === 'web' ? 'fixed' as any : 'absolute' },
            ]}>
                <View style={s.navInner}>
                    <TouchableOpacity onPress={() => scrollTo('hero')} activeOpacity={0.8}>
                        <JulabaLogo width={80} />
                    </TouchableOpacity>
                    {!isMobile ? (
                        <>
                            <View style={s.navLinks}>
                                {NAV_LINKS.map(l => (
                                    <TouchableOpacity key={l.id} onPress={() => scrollTo(l.id)}>
                                        <Text style={s.navLink}>{l.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <View style={s.navBtns}>
                                <TouchableOpacity
                                    style={s.navBtnOutline}
                                    onPress={() => router.push('/(auth)/login' as any)}
                                >
                                    <Text style={s.navBtnOutlineText}>Se connecter</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={s.navBtnFill} onPress={() => router.push('/(auth)/signup' as any)}>
                                    <Text style={s.navBtnFillText}>Créer un compte</Text>
                                </TouchableOpacity>
                            </View>
                        </>
                    ) : (
                        <TouchableOpacity onPress={() => setMenuOpen(!menuOpen)}>
                            {menuOpen
                                ? <X color="#fff" size={24} />
                                : <Menu color="#fff" size={24} />}
                        </TouchableOpacity>
                    )}
                </View>
                {isMobile && menuOpen && (
                    <View style={s.mobileMenu}>
                        {NAV_LINKS.map(l => (
                            <TouchableOpacity key={l.id} onPress={() => scrollTo(l.id)} style={s.mobileMenuItem}>
                                <Text style={s.mobileMenuText}>{l.label}</Text>
                            </TouchableOpacity>
                        ))}
                        <View style={s.mobileMenuDivider} />
                        <TouchableOpacity onPress={() => { setMenuOpen(false); router.push('/(auth)/login' as any); }} style={s.mobileMenuItem}>
                            <Text style={[s.mobileMenuText, { color: C.primary }]}>Se connecter</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => { setMenuOpen(false); router.push('/(auth)/signup' as any); }}
                            style={[s.mobileMenuItem, { backgroundColor: C.primary, borderRadius: 10 }]}
                        >
                            <Text style={[s.mobileMenuText, { color: '#fff', fontWeight: '700' }]}>Créer un compte</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>

            {/* ── SCROLLVIEW ── */}
            <ScrollView ref={scrollRef} onScroll={handleScroll} scrollEventThrottle={16}
                showsVerticalScrollIndicator={false} showsHorizontalScrollIndicator={false}
                style={s.root} contentContainerStyle={s.content}>

                {/* ── HERO ── */}
                <View style={s.hero} onLayout={reg('hero')}>
                    <View style={[s.shape, { top: '10%', left: '5%', width: 80, height: 80, borderRadius: 12 }]} />
                    <View style={[s.shape, { top: '60%', right: '8%', width: 60, height: 60, borderRadius: 8, transform: [{ rotate: '45deg' }] }]} />
                    <View style={[s.shape, { bottom: '15%', left: '15%', width: 40, height: 40, borderRadius: 10 }]} />

                    <View style={s.heroContent}>
                        <Animated.View style={{ transform: [{ scale: heroLogo }] }}>
                            <JulabaLogo width={280} />
                        </Animated.View>
                        <Animated.Text style={[s.heroSlogan, isDesktop && { fontSize: 40 }, { opacity: heroText }]}>
                            Ton djè est bien géré
                        </Animated.Text>
                        <Animated.Text style={[s.heroSub, isDesktop && { fontSize: 18, maxWidth: 600 }, { opacity: heroSub }]}>
                            Plateforme nationale d'inclusion économique{'\n'}des acteurs vivriers
                        </Animated.Text>
                        <Animated.View style={[s.heroBtns, isDesktop && { flexDirection: 'row', gap: 16 }, { opacity: heroBtns }]}>
                            <TouchableOpacity style={s.btnWhite} onPress={() => router.push('/(auth)/signup' as any)} activeOpacity={0.85}>
                                <Text style={s.btnWhiteText}>Commencer gratuitement</Text>
                                <ArrowRight color={C.primary} size={18} />
                            </TouchableOpacity>
                            <TouchableOpacity style={s.btnOutline} onPress={() => router.push('/(auth)/login' as any)} activeOpacity={0.85}>
                                <Text style={s.btnOutlineText}>Se connecter</Text>
                                <ChevronRight color="#fff" size={18} />
                            </TouchableOpacity>
                        </Animated.View>
                    </View>

                    <View style={[s.statsRow, isDesktop && { gap: 48 }]}>
                        {STATS.map((st, i) => <CounterStat key={i} {...st} />)}
                    </View>
                    <View style={s.heroGradient} />
                </View>

                {/* ── FONCTIONNALITES ── */}
                <View style={[s.section, s.sectionWhite]} onLayout={reg('features')}>
                    <AnimatedSection visible={visible['features']}>
                        <Text style={s.sectionLabel}>FONCTIONNALITÉS</Text>
                        <Text style={[s.sectionTitle, isDesktop && { fontSize: 30 }]}>Tout ce dont vous avez besoin</Text>
                    </AnimatedSection>
                    <View style={[s.grid, { maxWidth: isDesktop ? 1100 : 800 }]}>
                        {FEATURES.map((f, i) => (
                            <AnimatedSection key={i} visible={visible['features']} delay={i * 100}
                                style={[s.featureCard, { width: featureCols === 1 ? '100%' : `${Math.floor(100 / featureCols) - 2}%` as any }]}>
                                <View style={s.featureIcon}><f.Icon color={C.primary} size={24} /></View>
                                <Text style={s.featureTitle}>{f.title}</Text>
                                <Text style={s.featureDesc}>{f.desc}</Text>
                            </AnimatedSection>
                        ))}
                    </View>
                </View>

                {/* ── COMMENT CA MARCHE ── */}
                <View style={[s.section, { backgroundColor: C.cream }]} onLayout={reg('steps')}>
                    <AnimatedSection visible={visible['steps']}>
                        <Text style={s.sectionLabel}>COMMENT ÇA MARCHE</Text>
                        <Text style={[s.sectionTitle, isDesktop && { fontSize: 30 }]}>3 étapes pour démarrer</Text>
                    </AnimatedSection>
                    <View style={[s.stepsRow, isMobile && { flexDirection: 'column', gap: 32 }]}>
                        {STEPS.map((step, i) => (
                            <React.Fragment key={i}>
                                {i > 0 && !isMobile && <View style={s.stepLine} />}
                                <AnimatedSection visible={visible['steps']} delay={300 + i * 200} style={s.stepItem}>
                                    <View style={s.stepNumber}><Text style={s.stepNumberText}>{i + 1}</Text></View>
                                    <View style={s.stepIconBox}><step.Icon color={C.primary} size={28} /></View>
                                    <Text style={s.stepTitle}>{step.title}</Text>
                                    <Text style={s.stepDesc}>{step.desc}</Text>
                                </AnimatedSection>
                            </React.Fragment>
                        ))}
                    </View>
                </View>

                {/* ── ROLES ── */}
                <View style={[s.section, s.sectionWhite]} onLayout={reg('roles')}>
                    <AnimatedSection visible={visible['roles']}>
                        <Text style={s.sectionLabel}>5 PROFILS</Text>
                        <Text style={[s.sectionTitle, isDesktop && { fontSize: 30 }]}>Une plateforme, 5 profils</Text>
                    </AnimatedSection>
                    <View style={[s.grid, { maxWidth: isDesktop ? 1100 : 800 }]}>
                        {ROLES_DATA.map((r, i) => (
                            <AnimatedSection key={i} visible={visible['roles']} delay={i * 100}
                                style={[s.roleCard, {
                                    width: roleCols === 1 ? '100%' : `${Math.floor(100 / roleCols) - 2}%` as any,
                                    borderTopColor: r.color, borderTopWidth: 3,
                                }]}>
                                <View style={[s.roleIcon, { backgroundColor: r.color }]}>
                                    <r.Icon color="#fff" size={22} />
                                </View>
                                <Text style={s.roleTitle}>{r.title}</Text>
                                <Text style={s.roleDesc}>{r.desc}</Text>
                            </AnimatedSection>
                        ))}
                    </View>
                </View>

                {/* ── TEMOIGNAGES ── */}
                <View style={[s.section, { backgroundColor: '#FAFAFA' }]} onLayout={reg('testimonials')}>
                    <AnimatedSection visible={visible['testimonials']}>
                        <Text style={s.sectionLabel}>TÉMOIGNAGES</Text>
                        <Text style={[s.sectionTitle, isDesktop && { fontSize: 30 }]}>Ils utilisent Jùlaba</Text>
                    </AnimatedSection>
                    <View style={[s.grid, { maxWidth: isDesktop ? 1000 : 700 }]}>
                        {TESTIMONIALS.map((t, i) => (
                            <AnimatedSection key={i} visible={visible['testimonials']} delay={i * 150}
                                style={[s.testimonialCard, { width: isDesktop ? '31%' : '100%' as any }]}>
                                <View style={s.testimonialAvatar}>
                                    <Text style={s.testimonialInitials}>{t.initials}</Text>
                                </View>
                                <Text style={s.testimonialText}>"{t.text}"</Text>
                                <Text style={s.testimonialName}>{t.name}</Text>
                                <Text style={s.testimonialRole}>{t.role}</Text>
                            </AnimatedSection>
                        ))}
                    </View>
                </View>

                {/* ── CTA ── */}
                <View style={s.cta} onLayout={reg('cta')}>
                    <AnimatedSection visible={visible['cta']} style={{ alignItems: 'center' }}>
                        <Text style={[s.ctaTitle, isDesktop && { fontSize: 32 }]}>
                            Prêt à transformer votre activité ?
                        </Text>
                        <Text style={s.ctaSub}>Rejoignez des milliers de commerçants ivoiriens</Text>
                        <Animated.View style={{ transform: [{ scale: ctaPulse }] }}>
                            <TouchableOpacity style={s.ctaBtn} onPress={() => router.push('/(auth)/signup' as any)} activeOpacity={0.85}>
                                <Text style={s.ctaBtnText}>Créer mon compte gratuitement</Text>
                                <ArrowRight color={C.primary} size={18} />
                            </TouchableOpacity>
                        </Animated.View>
                        <Text style={s.ctaSmall}>Disponible sur Android et bientôt sur iOS</Text>
                    </AnimatedSection>
                </View>

                {/* ── FOOTER ── */}
                <View style={s.footer} onLayout={reg('footer')}>
                    <View style={[s.footerGrid, isMobile && { flexDirection: 'column' }]}>
                        <View style={[s.footerCol, !isMobile && { flex: 1.3 }]}>
                            <JulabaLogo width={56} />
                            <Text style={s.footerBrand}>Ton djè est bien géré</Text>
                            <Text style={s.footerDescText}>
                                Jùlaba connecte marchands, producteurs et coopératives
                                pour une économie vivière plus forte en Côte d'Ivoire.
                            </Text>
                        </View>
                        <View style={s.footerCol}>
                            <Text style={s.footerColTitle}>NAVIGATION</Text>
                            {NAV_LINKS.map(l => (
                                <TouchableOpacity key={l.id} onPress={() => scrollTo(l.id)}>
                                    <Text style={s.footerColLink}>{l.label}</Text>
                                </TouchableOpacity>
                            ))}
                            <TouchableOpacity onPress={() => router.push('/(auth)/signup' as any)}>
                                <Text style={s.footerColLink}>Créer un compte</Text>
                            </TouchableOpacity>
                        </View>
                        <View style={s.footerCol}>
                            <Text style={s.footerColTitle}>CONTACT</Text>
                            <View style={s.footerContactRow}>
                                <Mail color="rgba(255,255,255,0.5)" size={14} />
                                <Text style={s.footerColLink}>contact@julaba.ci</Text>
                            </View>
                            <View style={s.footerContactRow}>
                                <PhoneIcon color="rgba(255,255,255,0.5)" size={14} />
                                <Text style={s.footerColLink}>+225 07 XX XX XX XX</Text>
                            </View>
                            <View style={s.footerContactRow}>
                                <MapPin color="rgba(255,255,255,0.5)" size={14} />
                                <Text style={s.footerColLink}>Abidjan, Côte d'Ivoire</Text>
                            </View>
                        </View>
                        <View style={s.footerCol}>
                            <Text style={s.footerColTitle}>SUIVEZ-NOUS</Text>
                            <View style={s.socialRow}>
                                {[Facebook, Instagram, Linkedin, Twitter].map((Icon, i) => (
                                    <TouchableOpacity key={i} style={s.socialIcon} activeOpacity={0.7}>
                                        <Icon color="#fff" size={18} />
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>
                    </View>
                    <View style={s.footerBar}>
                        <View style={s.footerBarInner}>
                            <Text style={s.footerLegal}>Mentions légales</Text>
                            <Text style={s.footerCopyright}>© 2026 Jùlaba by Icons — Tous droits réservés</Text>
                            <Text style={s.footerLegal}>Politique de confidentialité</Text>
                        </View>
                    </View>
                </View>
            </ScrollView>

        </View>
    );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#fff' },
    content: { flexGrow: 1 },

    // Navbar
    nav: {
        top: 0, left: 0, right: 0, zIndex: 100,
        paddingHorizontal: 24, paddingVertical: 12,
        backgroundColor: C.primary,
    },
    navSolid: {
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1, shadowRadius: 8, elevation: 4,
    },
    navInner: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        maxWidth: 1200, alignSelf: 'center', width: '100%',
    },
    navLinks: { flexDirection: 'row', gap: 28 },
    navLink: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.85)' },
    navBtns: { flexDirection: 'row', gap: 10 },
    navBtnOutline: {
        borderWidth: 1.5, borderColor: '#FFFFFF', borderRadius: 10,
        paddingHorizontal: 16, paddingVertical: 8,
    },
    navBtnOutlineText: { fontSize: 13, fontWeight: '700', color: '#fff' },
    navBtnFill: {
        backgroundColor: C.white, borderRadius: 10,
        paddingHorizontal: 16, paddingVertical: 8,
    },
    navBtnFillText: { fontSize: 13, fontWeight: '700', color: C.primary },
    mobileMenu: {
        backgroundColor: '#fff', borderRadius: 12, marginTop: 8,
        padding: 8, gap: 4,
        shadowColor: '#000', shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1, shadowRadius: 12, elevation: 6,
    },
    mobileMenuItem: { paddingVertical: 12, paddingHorizontal: 16 },
    mobileMenuText: { fontSize: 15, fontWeight: '600', color: C.dark },
    mobileMenuDivider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 4 },

    // Hero
    hero: {
        backgroundColor: C.primary,
        alignItems: 'center', justifyContent: 'center',
        paddingTop: 100, paddingBottom: 48, paddingHorizontal: 24,
        overflow: 'hidden',
    },
    heroContent: { alignItems: 'center', gap: 16, zIndex: 2 },
    heroGradient: {
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 80,
        backgroundColor: C.primaryDark, opacity: 0.3,
    },
    shape: {
        position: 'absolute', backgroundColor: 'rgba(255,255,255,0.06)', zIndex: 1,
    },
    heroSlogan: {
        fontSize: 28, fontWeight: '900', color: '#fff',
        textAlign: 'center', letterSpacing: -0.5, marginTop: 8,
    },
    heroSub: {
        fontSize: 15, color: 'rgba(255,255,255,0.8)',
        textAlign: 'center', lineHeight: 22,
    },
    heroBtns: { marginTop: 12, gap: 12, alignItems: 'center' },
    btnWhite: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#fff', borderRadius: 12,
        paddingHorizontal: 28, paddingVertical: 16,
    },
    btnWhiteText: { fontSize: 15, fontWeight: '800', color: C.primary },
    btnOutline: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        borderWidth: 2, borderColor: 'rgba(255,255,255,0.4)', borderRadius: 12,
        paddingHorizontal: 28, paddingVertical: 14,
    },
    btnOutlineText: { fontSize: 15, fontWeight: '700', color: '#fff' },

    // Stats
    statsRow: {
        flexDirection: 'row', gap: 32, marginTop: 40,
        zIndex: 2, alignItems: 'center',
    },
    statItem: { alignItems: 'center' },
    statNumber: { fontSize: 28, fontWeight: '900', color: '#fff' },
    statLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(255,255,255,0.6)', marginTop: 2, textTransform: 'uppercase', letterSpacing: 1 },

    // Sections
    section: { alignItems: 'center', paddingHorizontal: 24, paddingVertical: 64 },
    sectionWhite: { backgroundColor: '#fff' },
    sectionLabel: {
        fontSize: 12, fontWeight: '800', color: C.primary,
        letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8, textAlign: 'center',
    },
    sectionTitle: {
        fontSize: 24, fontWeight: '900', color: C.dark,
        textAlign: 'center', marginBottom: 36, letterSpacing: -0.5,
    },

    // Grid
    grid: {
        width: '100%', flexDirection: 'row', flexWrap: 'wrap',
        justifyContent: 'center', gap: 16,
    },

    // Features
    featureCard: {
        backgroundColor: '#fff', borderRadius: 12,
        borderWidth: 1, borderColor: '#F3F4F6',
        padding: 24, gap: 10,
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    },
    featureIcon: {
        width: 48, height: 48, borderRadius: 12,
        backgroundColor: C.cream,
        alignItems: 'center', justifyContent: 'center',
    },
    featureTitle: { fontSize: 16, fontWeight: '800', color: C.dark },
    featureDesc: { fontSize: 13, color: '#6B7280', lineHeight: 20 },

    // Steps
    stepsRow: {
        flexDirection: 'row', alignItems: 'flex-start',
        justifyContent: 'center', gap: 0, maxWidth: 900, width: '100%',
    },
    stepItem: { flex: 1, alignItems: 'center', gap: 12, paddingHorizontal: 16 },
    stepLine: { width: 60, height: 2, backgroundColor: C.primaryLight, marginTop: 36, opacity: 0.4 },
    stepNumber: {
        width: 28, height: 28, borderRadius: 8,
        backgroundColor: C.primary,
        alignItems: 'center', justifyContent: 'center',
    },
    stepNumberText: { fontSize: 13, fontWeight: '800', color: '#fff' },
    stepIconBox: {
        width: 56, height: 56, borderRadius: 12,
        backgroundColor: '#fff',
        alignItems: 'center', justifyContent: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
    },
    stepTitle: { fontSize: 16, fontWeight: '800', color: C.dark, textAlign: 'center' },
    stepDesc: { fontSize: 13, color: '#6B7280', textAlign: 'center', lineHeight: 18 },

    // Roles
    roleCard: {
        backgroundColor: '#fff', borderRadius: 12,
        padding: 20, gap: 8, alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    },
    roleIcon: {
        width: 44, height: 44, borderRadius: 10,
        alignItems: 'center', justifyContent: 'center', marginBottom: 4,
    },
    roleTitle: { fontSize: 15, fontWeight: '800', color: C.dark },
    roleDesc: { fontSize: 12, color: '#6B7280', textAlign: 'center', lineHeight: 18 },

    // Testimonials
    testimonialCard: {
        backgroundColor: '#fff', borderRadius: 12, padding: 24, gap: 12,
        alignItems: 'center',
        shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.04, shadowRadius: 8, elevation: 2,
    },
    testimonialAvatar: {
        width: 48, height: 48, borderRadius: 12,
        backgroundColor: C.cream,
        alignItems: 'center', justifyContent: 'center',
    },
    testimonialInitials: { fontSize: 16, fontWeight: '800', color: C.primary },
    testimonialText: { fontSize: 14, color: '#374151', lineHeight: 22, textAlign: 'center', fontStyle: 'italic' },
    testimonialName: { fontSize: 14, fontWeight: '800', color: C.dark },
    testimonialRole: { fontSize: 12, color: '#9CA3AF' },

    // CTA
    cta: {
        backgroundColor: C.primary,
        alignItems: 'center', paddingVertical: 64, paddingHorizontal: 24, gap: 16,
    },
    ctaTitle: {
        fontSize: 26, fontWeight: '900', color: '#fff',
        textAlign: 'center', letterSpacing: -0.5,
    },
    ctaSub: { fontSize: 15, color: 'rgba(255,255,255,0.75)', textAlign: 'center' },
    ctaBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: '#fff', borderRadius: 12,
        paddingHorizontal: 28, paddingVertical: 16, marginTop: 8,
    },
    ctaBtnText: { fontSize: 15, fontWeight: '800', color: C.primary },
    ctaSmall: { fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 8 },

    // Footer
    footer: { backgroundColor: C.dark },
    footerGrid: {
        flexDirection: 'row', gap: 32,
        paddingHorizontal: 40, paddingTop: 56, paddingBottom: 40,
        maxWidth: 1100, alignSelf: 'center', width: '100%',
    },
    footerCol: { gap: 10, minWidth: 140 },
    footerBrand: { fontSize: 14, fontWeight: '700', color: C.primary, marginTop: 4 },
    footerDescText: { fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 18 },
    footerColTitle: {
        fontSize: 11, fontWeight: '800', color: 'rgba(255,255,255,0.3)',
        letterSpacing: 2, textTransform: 'uppercase', marginBottom: 4,
    },
    footerColLink: { fontSize: 13, color: 'rgba(255,255,255,0.6)' },
    footerContactRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    socialRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    socialIcon: {
        width: 36, height: 36, borderRadius: 8,
        backgroundColor: 'rgba(255,255,255,0.08)',
        alignItems: 'center', justifyContent: 'center',
    },
    footerBar: {
        borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.08)',
        paddingVertical: 20, paddingHorizontal: 40,
    },
    footerBarInner: {
        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
        maxWidth: 1100, alignSelf: 'center', width: '100%', flexWrap: 'wrap', gap: 8,
    },
    footerLegal: { fontSize: 11, color: 'rgba(255,255,255,0.3)' },
    footerCopyright: { fontSize: 11, color: 'rgba(255,255,255,0.4)', textAlign: 'center' },
});

