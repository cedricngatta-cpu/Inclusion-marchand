// Augmentation de types pour lucide-react-native
import 'lucide-react-native';

declare module 'lucide-react-native' {
    interface LucideProps {
        color?: string;
        size?: number | string;
        strokeWidth?: number | string;
    }
}
