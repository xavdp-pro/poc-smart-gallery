import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Sun, Moon, Monitor, ChevronDown } from 'lucide-react';

const themes = [
  { code: 'light', icon: Sun, labelKey: 'header.themeLight' },
  { code: 'dark', icon: Moon, labelKey: 'header.themeDark' },
  { code: 'system', icon: Monitor, labelKey: 'header.themeSystem' }
];

export default function ThemeSelector() {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [theme, setTheme] = useState(() => {
    return localStorage.getItem('theme') || 'system';
  });
  const dropdownRef = useRef(null);

  const applyTheme = (themeValue) => {
    const root = document.documentElement;
    
    if (themeValue === 'system') {
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      root.classList.toggle('dark', systemDark);
    } else {
      root.classList.toggle('dark', themeValue === 'dark');
    }
  };

  useEffect(() => {
    applyTheme(theme);

    // Listen for system theme changes
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const changeTheme = (themeCode) => {
    setTheme(themeCode);
    localStorage.setItem('theme', themeCode);
    applyTheme(themeCode);
    setIsOpen(false);
  };

  const currentTheme = themes.find(th => th.code === theme) || themes[2];
  const CurrentIcon = currentTheme.icon;

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
      >
        <CurrentIcon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
        <ChevronDown className={`w-4 h-4 text-gray-500 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-40 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
          {themes.map((th) => {
            const Icon = th.icon;
            return (
              <button
                key={th.code}
                onClick={() => changeTheme(th.code)}
                className={`w-full flex items-center gap-3 px-4 py-2 text-left hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${
                  th.code === theme ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                }`}
              >
                <Icon className="w-5 h-5 text-gray-600 dark:text-gray-300" />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-200">
                  {t(th.labelKey)}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
