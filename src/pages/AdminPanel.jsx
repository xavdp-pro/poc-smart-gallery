import { useState, useEffect } from 'react';
import { Users, Plus, Edit2, Trash2, X, Mail, User, Shield, CheckCircle, XCircle, Eye, EyeOff, Brain, Cpu } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import EmailTestPanel from '../components/EmailTestPanel';
import toast from 'react-hot-toast';

export default function AdminPanel() {
  const { token } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState('create'); // 'create' or 'edit'
  const [selectedUser, setSelectedUser] = useState(null);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [userToDelete, setUserToDelete] = useState(null);
  const [activeTab, setActiveTab] = useState('users'); // 'users', 'email-test', or 'ai-settings'
  const [aiProvider, setAiProvider] = useState('ollama')
  const [availableModels, setAvailableModels] = useState({
    ollama: true,
    openrouter: true,
  })
  
  const [formData, setFormData] = useState({
    email: '',
    name: '',
    role: 'user',
    is_active: true,
    password: '',
  });
  
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    fetchUsers();
    fetchAISettings();
  }, []);

  const fetchAISettings = async () => {
    try {
      const response = await fetch('/api/admin/ai-settings', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        setAiProvider(data.provider || 'openrouter');
        setAvailableModels(data.availableModels || {
          ollama: true,
          openrouter: true,
        });
      }
    } catch (error) {
      console.error('Error fetching AI settings:', error);
    }
  };

  const saveAISettings = async () => {
    try {
      const response = await fetch('/api/admin/ai-settings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          provider: aiProvider,
          availableModels
        })
      });

      if (response.ok) {
        toast.success('Paramètres IA sauvegardés!');
      } else {
        toast.error('Erreur lors de la sauvegarde');
      }
    } catch (error) {
      console.error('Error saving AI settings:', error);
      toast.error('Erreur de connexion');
    }
  };

  const fetchUsers = async () => {
    try {
      const response = await fetch('/api/admin/users', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        toast.error('Erreur lors du chargement des utilisateurs');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
      toast.error('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setModalMode('create');
    setFormData({
      email: '',
      name: '',
      role: 'user',
      is_active: true,
      password: '',
    });
    setShowModal(true);
  };

  const openEditModal = (user) => {
    setModalMode('edit');
    setSelectedUser(user);
    setFormData({
      email: user.email,
      name: user.name,
      role: user.role,
      is_active: user.is_active === 1,
      password: '',
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setSelectedUser(null);
    setShowPassword(false);
  };

  // Password validation helper
  const isPasswordValid = (password) => {
    if (!password) return modalMode === 'edit'; // En mode édition, mot de passe optionnel
    return (
      password.length >= 10 &&
      /[A-Z]/.test(password) &&
      /[a-z]/.test(password) &&
      /[0-9]/.test(password) &&
      /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validate password if provided or required
    if (formData.password || modalMode === 'create') {
      if (!isPasswordValid(formData.password)) {
        toast.error('Le mot de passe ne respecte pas tous les critères de sécurité');
        return;
      }
    }

    try {
      const url = modalMode === 'create' 
        ? '/api/admin/users'
        : `/api/admin/users/${selectedUser.id}`;
      
      const method = modalMode === 'create' ? 'POST' : 'PUT';
      
      const payload = {
        email: formData.email,
        name: formData.name,
        role: formData.role,
        is_active: formData.is_active,
      };
      
      // Only include password if it's set
      if (formData.password) {
        payload.password = formData.password;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        if (modalMode === 'create') {
          const message = formData.password 
            ? '✅ Utilisateur créé avec le mot de passe personnalisé!' 
            : '✅ Utilisateur créé! Un email avec le mot de passe a été envoyé.';
          toast.success(message, { duration: 3000 });
        } else {
          toast.success('✅ Utilisateur mis à jour', { duration: 3000 });
        }
        fetchUsers();
        closeModal();
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur lors de l\'opération');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erreur de connexion');
    }
  };

  const openDeleteModal = (user) => {
    setUserToDelete(user);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    try {
      const response = await fetch(`/api/admin/users/${userToDelete.id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        toast.success('🗑️ Utilisateur supprimé', { duration: 3000 });
        fetchUsers();
        setShowDeleteModal(false);
        setUserToDelete(null);
      } else {
        const error = await response.json();
        toast.error(error.error || 'Erreur lors de la suppression');
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Erreur de connexion');
    }
  };

  const getRoleBadge = (role) => {
    if (role === 'admin') {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
          <Shield className="w-3 h-3" />
          Admin
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
        <User className="w-3 h-3" />
        Utilisateur
      </span>
    );
  };

  const getStatusBadge = (isActive) => {
    if (isActive) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
          <CheckCircle className="w-3 h-3" />
          Actif
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
        <XCircle className="w-3 h-3" />
        Inactif
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header with Tabs */}
      <div>
        <h2 className="text-3xl font-bold text-gray-900 mb-6">Panel Administrateur</h2>
        
        {/* Tabs */}
        <div className="flex gap-2 border-b border-gray-200">
          <button
            onClick={() => setActiveTab('users')}
            className={`flex items-center gap-2 px-6 py-3 font-semibold transition-all ${
              activeTab === 'users'
                ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Users className="w-5 h-5" />
            <span>Utilisateurs</span>
            <span className="ml-2 px-2 py-0.5 text-xs font-bold rounded-full bg-blue-100 text-blue-700">
              {users.length}
            </span>
          </button>
          <button
            onClick={() => setActiveTab('email-test')}
            className={`flex items-center gap-2 px-6 py-3 font-semibold transition-all ${
              activeTab === 'email-test'
                ? 'text-purple-600 border-b-2 border-purple-600 bg-purple-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Mail className="w-5 h-5" />
            <span>Test Email</span>
          </button>
          <button
            onClick={() => setActiveTab('ai-settings')}
            className={`flex items-center gap-2 px-6 py-3 font-semibold transition-all ${
              activeTab === 'ai-settings'
                ? 'text-green-600 border-b-2 border-green-600 bg-green-50'
                : 'text-gray-600 hover:text-gray-900 hover:bg-gray-50'
            }`}
          >
            <Brain className="w-5 h-5" />
            <span>Modèles IA</span>
          </button>
        </div>
      </div>

      {/* Users Tab */}
      {activeTab === 'users' && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                Gestion des utilisateurs
              </h3>
              <p className="text-gray-600 mt-1">
                Gérez les comptes utilisateurs et leurs permissions
              </p>
            </div>
            <button
              onClick={openCreateModal}
              className="inline-flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all"
            >
              <Plus className="w-5 h-5" />
              Créer un utilisateur
            </button>
          </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Utilisateur
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Email
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Rôle
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date création
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center">
                      <div className="flex-shrink-0 h-10 w-10">
                        <div className="h-10 w-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white font-semibold">
                          {user.name.charAt(0).toUpperCase()}
                        </div>
                      </div>
                      <div className="ml-4">
                        <div className="text-sm font-medium text-gray-900">{user.name}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Mail className="w-4 h-4" />
                      {user.email}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getRoleBadge(user.role)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(user.is_active)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(user.created_at).toLocaleDateString('fr-FR')}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEditModal(user)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Modifier"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => openDeleteModal(user)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
        </>
      )}

      {/* AI Settings Tab */}
      {activeTab === 'ai-settings' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <div className="mb-6">
            <h3 className="text-xl font-bold text-gray-900 flex items-center gap-2 mb-2">
              <Brain className="w-6 h-6 text-green-600" />
              Configuration des Modèles IA
            </h3>
            <p className="text-gray-600">
              Modèles <strong>gratuits uniquement</strong> : Ollama (local) ou OpenRouter (Nemotron VL :free)
            </p>
          </div>

          {/* Available Models */}
          <div className="mb-8">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Modèles gratuits</h4>
            <div className="space-y-3">
              {/* Ollama */}
              <label className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-green-300 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={availableModels.ollama}
                  onChange={(e) => setAvailableModels({ ...availableModels, ollama: e.target.checked })}
                  className="w-5 h-5 text-green-600 rounded focus:ring-2 focus:ring-green-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-green-600" />
                    <span className="font-semibold text-gray-900">Ollama LLaVA</span>
                    <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">Gratuit</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    Modèle local gratuit illimité, analyse détaillée en français
                  </p>
                </div>
              </label>

              {/* OpenRouter */}
              <label className="flex items-center gap-3 p-4 border-2 border-gray-200 rounded-lg hover:border-orange-300 cursor-pointer transition-colors">
                <input
                  type="checkbox"
                  checked={availableModels.openrouter}
                  onChange={(e) => setAvailableModels({ ...availableModels, openrouter: e.target.checked })}
                  className="w-5 h-5 text-orange-600 rounded focus:ring-2 focus:ring-orange-500"
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <Cpu className="w-5 h-5 text-orange-600" />
                    <span className="font-semibold text-gray-900">OpenRouter Nemotron VL</span>
                    <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">Gratuit</span>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    nvidia/nemotron-nano-12b-v2-vl:free — vision, 0 € (quota OpenRouter :free)
                  </p>
                </div>
              </label>
            </div>
          </div>

          {/* Active Provider */}
          <div className="mb-6">
            <h4 className="text-lg font-semibold text-gray-900 mb-4">Modèle Actif</h4>
            <div className="space-y-2">
              {availableModels.ollama && (
                <label className="flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="aiProvider"
                    value="ollama"
                    checked={aiProvider === 'ollama'}
                    onChange={(e) => setAiProvider(e.target.value)}
                    className="w-4 h-4 text-green-600"
                  />
                  <span className="font-medium text-gray-900">Ollama LLaVA</span>
                </label>
              )}
              {availableModels.openrouter && (
                <label className="flex items-center gap-3 p-3 border-2 rounded-lg cursor-pointer hover:bg-gray-50 transition-colors">
                  <input
                    type="radio"
                    name="aiProvider"
                    value="openrouter"
                    checked={aiProvider === 'openrouter'}
                    onChange={(e) => setAiProvider(e.target.value)}
                    className="w-4 h-4 text-orange-600"
                  />
                  <span className="font-medium text-gray-900">OpenRouter Nemotron VL (gratuit)</span>
                </label>
              )}
            </div>
          </div>

          {/* Save Button */}
          <div className="flex justify-end">
            <button
              onClick={saveAISettings}
              className="px-6 py-3 bg-gradient-to-r from-green-500 to-emerald-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 transition-all"
            >
              Sauvegarder les paramètres
            </button>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900">
                  {modalMode === 'create' ? 'Nouvel utilisateur' : 'Modifier l\'utilisateur'}
                </h3>
                <button
                  onClick={closeModal}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Nom complet
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  />
                </div>

                {/* Password */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {modalMode === 'create' ? 'Mot de passe' : 'Nouveau mot de passe (optionnel)'}
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={formData.password}
                      onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                      className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder={modalMode === 'create' ? 'Entrez un mot de passe' : 'Laisser vide pour ne pas changer'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    >
                      {showPassword ? (
                        <EyeOff className="h-5 w-5 text-gray-400" />
                      ) : (
                        <Eye className="h-5 w-5 text-gray-400" />
                      )}
                    </button>
                  </div>
                  {/* Password strength indicators */}
                  {(formData.password || modalMode === 'create') && (
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-2">
                        {formData.password.length >= 10 ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-gray-300" />
                        )}
                        <span className={`text-xs ${formData.password.length >= 10 ? 'text-green-600' : 'text-gray-500'}`}>
                          Minimum 10 caractères
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {/[A-Z]/.test(formData.password) ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-gray-300" />
                        )}
                        <span className={`text-xs ${/[A-Z]/.test(formData.password) ? 'text-green-600' : 'text-gray-500'}`}>
                          Au moins 1 majuscule
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {/[a-z]/.test(formData.password) ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-gray-300" />
                        )}
                        <span className={`text-xs ${/[a-z]/.test(formData.password) ? 'text-green-600' : 'text-gray-500'}`}>
                          Au moins 1 minuscule
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {/[0-9]/.test(formData.password) ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-gray-300" />
                        )}
                        <span className={`text-xs ${/[0-9]/.test(formData.password) ? 'text-green-600' : 'text-gray-500'}`}>
                          Au moins 1 chiffre
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(formData.password) ? (
                          <CheckCircle className="w-4 h-4 text-green-500" />
                        ) : (
                          <XCircle className="w-4 h-4 text-gray-300" />
                        )}
                        <span className={`text-xs ${/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(formData.password) ? 'text-green-600' : 'text-gray-500'}`}>
                          Au moins 1 symbole (!@#$%...)
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Role */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Rôle
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="user">Utilisateur</option>
                    <option value="admin">Administrateur</option>
                  </select>
                </div>

                {/* Active Status */}
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="is_active"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="is_active" className="ml-2 text-sm font-medium text-gray-700">
                    Compte actif
                  </label>
                </div>

                {/* Buttons */}
                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={closeModal}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg shadow-lg hover:shadow-xl transition-all"
                  >
                    {modalMode === 'create' ? 'Créer' : 'Mettre à jour'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
            <div className="text-center">
              <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100 mb-4">
                <Trash2 className="h-6 w-6 text-red-600" />
              </div>
              <h3 className="text-lg font-bold text-gray-900 mb-2">
                Supprimer l'utilisateur
              </h3>
              <p className="text-gray-600 mb-6">
                Êtes-vous sûr de vouloir supprimer <strong>{userToDelete?.name}</strong> ? Cette action est irréversible.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={() => {
                    setShowDeleteModal(false);
                    setUserToDelete(null);
                  }}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Annuler
                </button>
                <button
                  onClick={confirmDelete}
                  className="flex-1 px-4 py-2 bg-red-600 text-white font-semibold rounded-lg hover:bg-red-700 transition-colors"
                >
                  Supprimer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
