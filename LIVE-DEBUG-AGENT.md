# LIVE-DEBUG-AGENT.md — Agent de détection d'erreurs en temps réel

Place ce fichier à la racine du projet inclusion-marchand-mobile/.

---

## Rôle

Tu es un agent de monitoring en temps réel. Tu interceptes TOUTES les erreurs de l'app pendant les tests sur téléphone et tu les affiches dans le terminal pour que Claude Code puisse les corriger immédiatement.

---

## COMMENT ÇA FONCTIONNE

L'app sur le téléphone capture chaque erreur et l'envoie au serveur Socket.io.
Le serveur affiche l'erreur dans le terminal.
Claude Code lit l'erreur et propose la correction.

Flux : Téléphone → Socket.io → Terminal PC → Claude Code corrige

---

## ÉTAPE 1 — Créer le système de reporting d'erreurs

### Fichier : src/lib/errorReporter.ts

```typescript
import { emitEvent } from './socket';
import { Platform } from 'react-native';

interface ErrorReport {
  id: string;
  timestamp: string;
  type: 'crash' | 'api_error' | 'navigation' | 'render' | 'network' | 'supabase' | 'socket' | 'voice' | 'warning';
  severity: 'critical' | 'major' | 'minor';
  message: string;
  stack?: string;
  screen?: string;
  action?: string;
  userId?: string;
  role?: string;
  platform: string;
  appVersion: string;
  extra?: Record<string, any>;
}

const isDev = __DEV__;

// File d'erreurs pour le batch
let errorQueue: ErrorReport[] = [];
let flushTimer: NodeJS.Timeout | null = null;

// Envoyer une erreur au serveur
export const reportError = (
  type: ErrorReport['type'],
  message: string,
  options?: {
    severity?: ErrorReport['severity'];
    stack?: string;
    screen?: string;
    action?: string;
    userId?: string;
    role?: string;
    extra?: Record<string, any>;
  }
) => {
  const report: ErrorReport = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    type,
    severity: options?.severity || 'major',
    message,
    stack: options?.stack,
    screen: options?.screen,
    action: options?.action,
    userId: options?.userId,
    role: options?.role,
    platform: Platform.OS,
    appVersion: '1.0.0',
    extra: options?.extra,
  };

  // Log local en dev
  if (isDev) {
    const emoji = report.severity === 'critical' ? '🔴' : report.severity === 'major' ? '🟡' : '🟢';
    console.log(`${emoji} [${report.type}] ${report.message}`);
    if (report.stack) console.log('Stack:', report.stack.split('\n').slice(0, 3).join('\n'));
  }

  // Envoyer via Socket.io
  try {
    emitEvent('app-error', report);
  } catch (e) {
    // Socket pas connecté, stocker localement
    errorQueue.push(report);
  }
};

// Reporter les erreurs Supabase automatiquement
export const reportSupabaseError = (
  operation: string,
  table: string,
  error: any,
  screen?: string
) => {
  reportError('supabase', `[${operation}] ${table}: ${error?.message || JSON.stringify(error)}`, {
    severity: 'major',
    screen,
    extra: { operation, table, code: error?.code, details: error?.details, hint: error?.hint },
  });
};

// Reporter les erreurs API (Groq) automatiquement
export const reportApiError = (
  api: string,
  error: any,
  screen?: string
) => {
  reportError('api_error', `[${api}] ${error?.message || JSON.stringify(error)}`, {
    severity: 'major',
    screen,
    extra: { api, status: error?.status },
  });
};

// Reporter les erreurs de navigation
export const reportNavigationError = (
  route: string,
  error: any
) => {
  reportError('navigation', `Navigation vers ${route} échouée: ${error?.message}`, {
    severity: 'critical',
    screen: route,
  });
};

// Reporter les erreurs de rendu
export const reportRenderError = (
  component: string,
  error: any
) => {
  reportError('render', `Rendu ${component} échoué: ${error?.message}`, {
    severity: 'critical',
    stack: error?.stack,
    screen: component,
  });
};

// Capturer les erreurs globales non gérées
export const setupGlobalErrorHandler = () => {
  // Erreurs JS non catchées
  const originalHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: Error, isFatal: boolean) => {
    reportError('crash', error.message, {
      severity: 'critical',
      stack: error.stack,
      extra: { isFatal },
    });
    // Appeler le handler original
    if (originalHandler) originalHandler(error, isFatal);
  });

  // Promesses rejetées non gérées
  const rejectionTracking = require('promise/setimmediate/rejection-tracking');
  rejectionTracking.enable({
    allRejections: true,
    onUnhandled: (id: number, error: any) => {
      reportError('crash', `Unhandled Promise: ${error?.message || error}`, {
        severity: 'major',
        stack: error?.stack,
      });
    },
  });
};
```

---

## ÉTAPE 2 — Côté serveur (server/index.js)

Ajouter le handler pour recevoir les erreurs :

```javascript
// ── Monitoring erreurs temps réel ──
socket.on('app-error', (report) => {
  const emoji = report.severity === 'critical' ? '🔴' : report.severity === 'major' ? '🟡' : '🟢';
  const time = new Date(report.timestamp).toLocaleTimeString('fr-FR');
  
  console.log('\n════════════════════════════════════════');
  console.log(`${emoji} ERREUR ${report.severity.toUpperCase()} — ${time}`);
  console.log(`📱 ${report.platform} | 👤 ${report.role || '?'} | 📍 ${report.screen || '?'}`);
  console.log(`💬 ${report.message}`);
  if (report.extra) {
    console.log(`📋 Détails:`, JSON.stringify(report.extra, null, 2));
  }
  if (report.stack) {
    console.log(`📚 Stack: ${report.stack.split('\n').slice(0, 5).join('\n')}`);
  }
  console.log('════════════════════════════════════════\n');
  
  // Stocker dans un fichier log
  const fs = require('fs');
  const logLine = `${time} | ${emoji} ${report.severity} | ${report.type} | ${report.screen || '-'} | ${report.message}\n`;
  fs.appendFileSync('error-log.txt', logLine);
});
```

---

## ÉTAPE 3 — Intégrer dans l'app

### Dans _layout.tsx (au montage de l'app) :

```typescript
import { setupGlobalErrorHandler } from '@/src/lib/errorReporter';

useEffect(() => {
  setupGlobalErrorHandler();
}, []);
```

### Dans chaque appel Supabase (exemple vendre.tsx) :

```typescript
import { reportSupabaseError } from '@/src/lib/errorReporter';

const { data, error } = await supabase.from('transactions').insert({...});
if (error) {
  reportSupabaseError('INSERT', 'transactions', error, 'vendre.tsx');
  Alert.alert('Erreur', 'La vente n\'a pas pu être enregistrée.');
  return;
}
```

### Dans l'assistant vocal :

```typescript
import { reportApiError } from '@/src/lib/errorReporter';

try {
  const response = await fetch(GROQ_URL, {...});
} catch (error) {
  reportApiError('Groq', error, 'VoiceModal');
}
```

### Dans l'Error Boundary (_layout.tsx) :

```typescript
import { reportRenderError } from '@/src/lib/errorReporter';

function ErrorFallback({ error, resetErrorBoundary }) {
  useEffect(() => {
    reportRenderError('App', error);
  }, [error]);
  
  return (...);
}
```

---

## ÉTAPE 4 — Commandes utiles

### Voir les erreurs en temps réel :
Terminal 1 : cd server && node index.js
→ Les erreurs s'affichent automatiquement dans ce terminal

### Voir le log des erreurs :
```bash
cat server/error-log.txt
```

### Voir les erreurs par gravité :
```bash
# Critiques uniquement
grep "🔴" server/error-log.txt

# Majeures
grep "🟡" server/error-log.txt
```

### Vider le log :
```bash
echo "" > server/error-log.txt
```

---

## ÉTAPE 5 — Format pour Claude Code

Quand une erreur apparaît dans le terminal, copie-la et envoie à Claude Code avec ce format :

```
Lis DEBUG-AGENT.md. Erreur détectée en temps réel :

[coller l'erreur du terminal]

Diagnostique la cause racine et corrige. Vérifie avec grep que le même bug n'existe pas ailleurs.
```

---

## TYPES D'ERREURS CAPTURÉES

| Type | Quand | Exemple |
|---|---|---|
| crash | Erreur JS non catchée | ReferenceError, TypeError |
| api_error | Appel Groq/API échoue | Timeout, 401, 500 |
| navigation | Route introuvable | "Page introuvable" |
| render | Composant crash | "Cannot read property of null" |
| network | Pas de connexion | Fetch failed |
| supabase | Requête Supabase échoue | "column X does not exist" |
| socket | Socket.io déconnecté | Reconnection failed |
| voice | Assistant vocal bug | Whisper timeout, TTS fail |
| warning | Pas un crash mais suspect | Données vides, performance |

---

## QUAND UTILISER

- Lance le serveur Socket.io : `cd server && node index.js`
- Lance l'app : `npx expo start`
- Teste sur ton téléphone
- Les erreurs s'affichent EN TEMPS RÉEL dans le terminal du serveur
- Copie l'erreur → donne à Claude Code → correction immédiate
- L'app se met à jour automatiquement (hot reload)

C'est un cycle : Test → Erreur détectée → Correction → Re-test → ✅
