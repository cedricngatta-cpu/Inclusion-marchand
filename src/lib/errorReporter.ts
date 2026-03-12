// Système de reporting d'erreurs en temps réel — envoie les erreurs au terminal via Socket.io
import { emitEvent, isConnected } from './socket';
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
  extra?: Record<string, unknown>;
}

// File d'erreurs si socket non connecté
let errorQueue: ErrorReport[] = [];

const flushQueue = () => {
  if (errorQueue.length === 0 || !isConnected()) return;
  const toFlush = errorQueue.splice(0);
  toFlush.forEach(report => emitEvent('app-error', report));
};

// Envoyer une erreur au serveur via Socket.io
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
    extra?: Record<string, unknown>;
  }
): void => {
  const report: ErrorReport = {
    id: Date.now().toString(),
    timestamp: new Date().toISOString(),
    type,
    severity: options?.severity ?? 'major',
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

  if (__DEV__) {
    const emoji = report.severity === 'critical' ? '🔴' : report.severity === 'major' ? '🟡' : '🟢';
    console.log(`${emoji} [${report.type}] ${report.message}`);
    if (report.stack) console.log('Stack:', report.stack.split('\n').slice(0, 3).join('\n'));
  }

  if (isConnected()) {
    flushQueue();
    emitEvent('app-error', report);
  } else {
    errorQueue.push(report);
  }
};

// Reporter les erreurs Supabase
export const reportSupabaseError = (
  operation: string,
  table: string,
  error: { message?: string; code?: string; details?: string; hint?: string } | null | undefined,
  screen?: string
): void => {
  if (!error) return;
  reportError('supabase', `[${operation}] ${table}: ${error.message ?? JSON.stringify(error)}`, {
    severity: 'major',
    screen,
    extra: { operation, table, code: error.code, details: error.details, hint: error.hint },
  });
};

// Reporter les erreurs API (Groq/Whisper)
export const reportApiError = (
  api: string,
  error: { message?: string; status?: number } | unknown,
  screen?: string
): void => {
  const err = error as { message?: string; status?: number };
  reportError('api_error', `[${api}] ${err?.message ?? JSON.stringify(error)}`, {
    severity: 'major',
    screen,
    extra: { api, status: err?.status },
  });
};

// Reporter les erreurs de navigation
export const reportNavigationError = (route: string, error: { message?: string } | unknown): void => {
  const err = error as { message?: string };
  reportError('navigation', `Navigation vers ${route} échouée: ${err?.message ?? String(error)}`, {
    severity: 'critical',
    screen: route,
  });
};

// Reporter les erreurs de rendu (Error Boundary)
export const reportRenderError = (component: string, error: { message?: string; stack?: string } | unknown): void => {
  const err = error as { message?: string; stack?: string };
  reportError('render', `Rendu ${component} échoué: ${err?.message ?? String(error)}`, {
    severity: 'critical',
    stack: err?.stack,
    screen: component,
  });
};

// Capture les erreurs JS non catchées + promesses rejetées
export const setupGlobalErrorHandler = (): void => {
  const originalHandler = ErrorUtils.getGlobalHandler();
  ErrorUtils.setGlobalHandler((error: Error, isFatal?: boolean) => {
    reportError('crash', error.message, {
      severity: 'critical',
      stack: error.stack,
      extra: { isFatal },
    });
    if (originalHandler) originalHandler(error, isFatal);
  });

  // Promesses rejetées non gérées
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const rejectionTracking = require('promise/setimmediate/rejection-tracking');
    rejectionTracking.enable({
      allRejections: true,
      onUnhandled: (_id: number, error: unknown) => {
        const err = error as { message?: string; stack?: string };
        reportError('crash', `Unhandled Promise: ${err?.message ?? String(error)}`, {
          severity: 'major',
          stack: err?.stack,
        });
      },
    });
  } catch {
    // Module absent en prod — ignorer silencieusement
  }
};
