// Contexte global pour masquer/afficher le bouton assistant vocal
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

interface VoiceButtonContextValue {
    voiceButtonVisible: boolean;
    hideVoiceButton: () => void;
    showVoiceButton: () => void;
}

const VoiceButtonContext = createContext<VoiceButtonContextValue>({
    voiceButtonVisible: true,
    hideVoiceButton: () => {},
    showVoiceButton: () => {},
});

export function VoiceButtonProvider({ children }: { children: React.ReactNode }) {
    const [voiceButtonVisible, setVoiceButtonVisible] = useState(true);

    const hideVoiceButton = useCallback(() => setVoiceButtonVisible(false), []);
    const showVoiceButton = useCallback(() => setVoiceButtonVisible(true), []);

    const value = useMemo(() => ({
        voiceButtonVisible, hideVoiceButton, showVoiceButton,
    }), [voiceButtonVisible, hideVoiceButton, showVoiceButton]);

    return (
        <VoiceButtonContext.Provider value={value}>
            {children}
        </VoiceButtonContext.Provider>
    );
}

export function useVoiceButton() {
    return useContext(VoiceButtonContext);
}
