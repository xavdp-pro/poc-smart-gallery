import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogOut, Shield, User as UserIcon, Zap, Bot, BookOpen } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import LanguageSelector from './LanguageSelector';
import ThemeSelector from './ThemeSelector';

export default function AppLayout({ children }) {
  const { user, logout, isAdmin, token } = useAuth();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [aiProvider, setAiProvider] = useState('ollama');
  const [availableModels, setAvailableModels] = useState({});
  const [providersInfo, setProvidersInfo] = useState([]);

  const handleLogout = () => {
    logout();
    toast.success('Déconnecté', { icon: '👋', duration: 2000 });
    navigate('/login');
  };

  // Charger le provider IA actuel
  useEffect(() => {
    fetchCurrentProvider();
  }, []);

  const fetchCurrentProvider = async () => {
    try {
      if (!token) {
        console.log('⚠️ No token available, skipping settings fetch');
        return;
      }

      const response = await fetch('/api/admin/ai-settings', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAiProvider(data.provider || 'ollama');
        setAvailableModels(data.availableModels || {});
        setProvidersInfo(data.providersInfo || []);
        console.log('✅ AI Providers loaded:', data.providersInfo?.filter(p => p.available).map(p => p.name).join(', '));
      }
    } catch (error) {
      console.error('Error fetching AI provider:', error);
    }
  };

  const handleProviderChange = async (provider) => {
    try {
      const response = await fetch('/api/admin/ai-settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ provider })
      });

      if (response.ok) {
        setAiProvider(provider);
        // Trouver le nom du provider depuis providersInfo
        const providerInfo = providersInfo.find(p => p.id === provider);
        const providerName = providerInfo?.name || provider;
        toast.success(`IA changée: ${providerName}`, { icon: '🤖' });
      } else {
        toast.error('Erreur lors du changement');
      }
    } catch (error) {
      console.error('Error updating provider:', error);
      toast.error('Erreur de connexion');
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 dark:bg-gray-900 flex flex-col">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 border-b border-slate-200 dark:border-gray-700 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex items-center justify-center">
                <span className="text-2xl">📸</span>
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900 dark:text-white">Smart Gallery</h1>
                <p className="text-xs text-gray-500 dark:text-gray-400">{t('gallery.title')}</p>
              </div>
            </Link>

            {/* AI Provider - Admin peut changer, User voit seulement */}
            <div className="flex items-center gap-2">
              <Bot className="w-5 h-5 text-purple-600" />
              {isAdmin() ? (
                <select
                  value={aiProvider}
                  onChange={(e) => handleProviderChange(e.target.value)}
                  className="px-3 py-2 text-sm font-medium bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer hover:border-purple-400 transition-all"
                >
                  {providersInfo
                    .filter(provider => provider.available)
                    .map(provider => (
                      <option key={provider.id} value={provider.id}>
                        {provider.icon} {provider.name}
                      </option>
                    ))
                  }
                </select>
              ) : (
                <div className="px-3 py-2 text-sm font-medium bg-gradient-to-r from-purple-50 to-blue-50 border-2 border-purple-200 rounded-lg">
                  {providersInfo.find(p => p.id === aiProvider)?.icon} {providersInfo.find(p => p.id === aiProvider)?.name || 'IA'}
                </div>
              )}
            </div>

            <div className="flex items-center gap-3">
              {/* Language Selector */}
              <LanguageSelector />

              {/* Theme Selector */}
              <ThemeSelector />

              {/* Documentation Link */}
              <Link
                to="/docs"
                className="flex items-center gap-2 px-3 py-2 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <BookOpen className="w-5 h-5" />
                <span className="hidden sm:inline text-sm font-medium">{t('header.documentation')}</span>
              </Link>

              {/* Admin Button (visible pour les admins) */}
              {isAdmin() && (
                <Link
                  to="/admin"
                  className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-500 to-purple-600 text-white font-medium rounded-lg hover:from-purple-600 hover:to-purple-700 transition-all shadow-sm"
                >
                  <Shield className="w-4 h-4" />
                  <span className="hidden sm:inline">{t('header.admin')}</span>
                </Link>
              )}

              {/* User Menu */}
            <div className="relative">
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-gray-50 transition-colors"
              >
                <div className="w-9 h-9 bg-gradient-to-br from-blue-400 to-purple-500 rounded-full flex items-center justify-center text-white font-semibold">
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
                <div className="text-left hidden sm:block">
                  <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                  <p className="text-xs text-gray-500">{user?.email}</p>
                </div>
              </button>

              {/* Dropdown */}
              {showUserMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowUserMenu(false)}
                  ></div>
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-gray-200 py-2 z-20">
                    <div className="px-4 py-3 border-b border-gray-100">
                      <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                      <p className="text-xs text-gray-500">{user?.email}</p>
                      {user?.role === 'admin' && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 mt-2 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          <Shield className="w-3 h-3" />
                          Administrateur
                        </span>
                      )}
                    </div>
                    
                    <div className="py-1">
                      <button
                        onClick={handleLogout}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Se déconnecter</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {children}
      </main>
    </div>
  );
}
