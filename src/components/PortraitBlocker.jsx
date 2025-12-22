import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Monitor, Smartphone } from 'lucide-react';

export default function PortraitBlocker({ children }) {
  const { t } = useTranslation();
  const [isPortrait, setIsPortrait] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      const mobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
      const portrait = window.innerHeight > window.innerWidth;
      const smallScreen = window.innerWidth < 768;
      
      setIsMobile(mobile || smallScreen);
      setIsPortrait(portrait && (mobile || smallScreen));
    };

    checkOrientation();

    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  if (isPortrait && isMobile) {
    return (
      <div className="fixed inset-0 bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center z-[9999]">
        <div className="text-center text-white p-8 max-w-md">
          {/* Animated rotation icon */}
          <div className="mb-8 relative">
            <div className="w-32 h-32 mx-auto relative">
              <Smartphone className="w-32 h-32 text-white/30 absolute animate-pulse" />
              <div className="absolute inset-0 flex items-center justify-center">
                <RotateCcw className="w-16 h-16 text-white animate-spin-slow" />
              </div>
            </div>
          </div>

          <h1 className="text-2xl font-bold mb-4">
            {t('mobile.rotateDevice')}
          </h1>
          
          <p className="text-lg text-white/80 mb-6">
            {t('mobile.landscapeRequired')}
          </p>

          <div className="flex items-center justify-center gap-4 text-white/60 mb-8">
            <div className="flex items-center gap-2">
              <Smartphone className="w-6 h-6 rotate-90" />
              <span className="text-sm">{t('mobile.rotateInstruction')}</span>
            </div>
          </div>

          <div className="border-t border-white/20 pt-6">
            <div className="flex items-center justify-center gap-2 text-white/50">
              <Monitor className="w-5 h-5" />
              <span className="text-sm">{t('mobile.desktopRecommended')}</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return children;
}
