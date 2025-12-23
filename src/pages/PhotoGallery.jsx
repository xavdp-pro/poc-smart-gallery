import { useState, useEffect, useRef } from 'react'
import { Upload, Image as ImageIcon, Tag, X, Plus, Loader2, Trash2, Search, Download, Maximize2, Edit2, Check, RefreshCw, Brain, Smartphone } from 'lucide-react'
import { io } from 'socket.io-client'
import toast from 'react-hot-toast'
import { useTranslation } from 'react-i18next'
import { useAuth } from '../contexts/AuthContext'
import UploadProgress from '../components/UploadProgress'
import ConfirmModal from '../components/ConfirmModal'
import MobileWarningModal from '../components/MobileWarningModal'
import '../App.css'

export default function PhotoGallery() {
  const { token } = useAuth()
  const { t, i18n } = useTranslation()
  const [photos, setPhotos] = useState([])
  const [selectedPhoto, setSelectedPhoto] = useState(null)
  const [selectedPhotoTags, setSelectedPhotoTags] = useState([])
  const [uploading, setUploading] = useState(false)
  const [showMobileWarning, setShowMobileWarning] = useState(false)
  const [newTag, setNewTag] = useState('')
  const [addingTag, setAddingTag] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [socket, setSocket] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [deleteModal, setDeleteModal] = useState({ isOpen: false, photoId: null, photoName: '' })
  const fileInputRef = useRef(null)
  const tagsListRef = useRef(null)
  const [highlightedTagId, setHighlightedTagId] = useState(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [editingPhotoId, setEditingPhotoId] = useState(null)
  const [editingName, setEditingName] = useState('')
  const [quotaErrorModal, setQuotaErrorModal] = useState({ isOpen: false, provider: '', error: '' })
  const [reanalyzing, setReanalyzing] = useState(false)

  // Fonction pour traduire les valeurs de qualité
  const translateQuality = (value) => {
    if (!value) return ''
    const normalized = value.toLowerCase()
    if (['excellent', 'excellente', 'excelente'].includes(normalized)) return t('gallery.excellent')
    if (['good', 'bon', 'bonne', 'bueno', 'buena'].includes(normalized)) return t('gallery.good')
    if (['average', 'moyen', 'moyenne', 'medio', 'media'].includes(normalized)) return t('gallery.average')
    if (['poor', 'faible', 'bajo', 'baja'].includes(normalized)) return t('gallery.poor')
    return value
  }

  const closeFullscreen = () => {
    setIsFullscreen(false)
  }

  // Gérer la touche ESC pour fermer le fullscreen
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isFullscreen) {
        closeFullscreen()
      }
    }
    
    window.addEventListener('keydown', handleEscape)
    return () => window.removeEventListener('keydown', handleEscape)
  }, [isFullscreen])

  // Vérifier si l'utilisateur est sur mobile
  const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || window.innerWidth < 1024;
  }

  useEffect(() => {
    // Afficher l'avertissement mobile si nécessaire
    if (isMobile()) {
      setShowMobileWarning(true);
    }
    
    fetchPhotos()
    
    // Connexion Socket.IO - utiliser uniquement polling pour compatibilité Cloudflare Tunnel
    // WebSocket ne fonctionne pas bien via le tunnel car Vite proxy ne gère pas l'upgrade
    const newSocket = io({
      path: '/socket.io',
      transports: ['polling'], // Polling uniquement - fiable avec Cloudflare Tunnel
      upgrade: false // Désactiver l'upgrade vers WebSocket
    })
    setSocket(newSocket)

    newSocket.on('connect', () => {
      console.log('✅ Connected to server:', newSocket.id)
    })

    newSocket.on('photo:progress', (data) => {
      console.log('📊 Progress:', data)
      setUploadProgress(data)
    })

    newSocket.on('photo:complete', (data) => {
      console.log('✅ Complete:', data)
      console.log('📊 Tags received:', data.photo.tags.length, 'tags')
      
      setUploadProgress(null)
      setReanalyzing(false)
      toast.success(data.message, {
        duration: 4000,
        icon: '🎉',
      })
      
      const photoId = parseInt(data.photoId)
      
      // Mettre à jour la liste des photos
      setPhotos(prev => prev.map(p => 
        p.id === photoId ? data.photo : p
      ))
      
      // Mettre à jour directement les tags et métadonnées si c'est la photo sélectionnée
      setSelectedPhoto(current => {
        if (current && current.id === photoId) {
          console.log('🔄 Updating tags and metadata for selected photo')
          // Mettre à jour les tags immédiatement
          setSelectedPhotoTags(data.photo.tags || [])
          // Retourner la photo complète avec métadonnées
          return { ...data.photo }
        }
        return current
      })
      
      // Refetch les métadonnées après un court délai pour s'assurer que tout est à jour
      setTimeout(() => {
        setSelectedPhoto(current => {
          if (current && current.id === photoId) {
            fetchPhotoMetadata(photoId)
            fetchPhotoTags(photoId)
          }
          return current
        })
      }, 500)
    })

    newSocket.on('photo:error', (data) => {
      console.error('❌ Error:', data)
      setUploadProgress(null)
      setUploading(false)
      
      // Détecter les erreurs de quota et d'API
      const errorMsg = data.error || data.message || ''
      const isQuotaError = errorMsg.includes('quota') || 
                          errorMsg.includes('insufficient_quota') || 
                          errorMsg.includes('429') ||
                          errorMsg.includes('401') ||
                          errorMsg.includes('Incorrect API key') ||
                          errorMsg.includes('API key')
      
      if (isQuotaError) {
        let provider = 'IA'
        if (errorMsg.includes('OpenAI') || errorMsg.includes('openai')) provider = 'OpenAI'
        else if (errorMsg.includes('Grok') || errorMsg.includes('grok')) provider = 'Grok'
        
        setQuotaErrorModal({
          isOpen: true,
          provider: provider,
          error: errorMsg
        })
      } else {
        toast.error(data.message, {
          duration: 4000,
        })
      }
    })

    // Debug: écouter les événements de connexion
    newSocket.on('connect', () => {
      console.log('🔌 Socket connected:', newSocket.id)
    })

    newSocket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason)
    })

    newSocket.on('connect_error', (error) => {
      console.error('🔌 Socket connection error:', error)
    })

    return () => {
      newSocket.close()
    }
  }, [])

  useEffect(() => {
    if (selectedPhoto && selectedPhoto.id) {
      // Utiliser les tags déjà chargés dans selectedPhoto au lieu de refetch
      if (selectedPhoto.tags) {
        setSelectedPhotoTags(selectedPhoto.tags)
      } else {
        fetchPhotoTags(selectedPhoto.id)
      }
      fetchPhotoMetadata(selectedPhoto.id)
    }
  }, [selectedPhoto?.id]) // Dépendre uniquement de l'ID pour éviter les boucles

  const fetchPhotos = async () => {
    try {
      const response = await fetch('/api/photos', {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const data = await response.json()
      
      // Charger les tags pour chaque photo
      const photosWithTags = await Promise.all(
        data.map(async (photo) => {
          try {
            const tagsResponse = await fetch(`/api/photos/${photo.id}/tags`, {
              headers: { 'Authorization': `Bearer ${token}` }
            })
            if (!tagsResponse.ok) {
              return { ...photo, tags: [] }
            }
            const tags = await tagsResponse.json()
            return { ...photo, tags }
          } catch (error) {
            return { ...photo, tags: [] }
          }
        })
      )
      
      setPhotos(photosWithTags)
      if (photosWithTags.length > 0 && !selectedPhoto) {
        setSelectedPhoto(photosWithTags[0])
      }
    } catch (error) {
      console.error('Error fetching photos:', error)
    }
  }

  const fetchPhotoTags = async (photoId) => {
    try {
      const response = await fetch(`/api/photos/${photoId}/tags`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) {
        console.warn(`Photo ${photoId} tags not found (${response.status})`)
        setSelectedPhotoTags([])
        return
      }
      const data = await response.json()
      setSelectedPhotoTags(data)
    } catch (error) {
      console.error('Error fetching tags:', error)
      setSelectedPhotoTags([])
    }
  }

  const fetchPhotoMetadata = async (photoId) => {
    try {
      const response = await fetch(`/api/photos/${photoId}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      })
      if (!response.ok) {
        console.warn(`Photo ${photoId} metadata not found (${response.status})`)
        return
      }
      const data = await response.json()
      if (data.metadata) {
        setSelectedPhoto(current => ({
          ...current,
          metadata: data.metadata
        }))
      }
    } catch (error) {
      console.error('Error fetching photo metadata:', error)
    }
  }

  const handleFileUpload = async (event) => {
    const file = event.target.files[0]
    if (!file) {
      console.log('❌ No file selected')
      return
    }

    // Vérifier si un upload est déjà en cours
    if (uploading) {
      console.log('⚠️ Upload already in progress, ignoring')
      toast.error('Un upload est déjà en cours')
      event.target.value = '' // Reset input
      return
    }

    // Vérifier le token
    if (!token) {
      console.error('❌ No auth token available')
      toast.error('Erreur d\'authentification')
      event.target.value = '' // Reset input
      return
    }

    console.log('📤 Starting upload:', file.name, `(${(file.size / 1024 / 1024).toFixed(2)} MB)`)
    
    setUploading(true)
    setUploadProgress({
      stage: 'uploading',
      progress: 0,
      message: 'Upload du fichier...'
    })

    // Timeout de sécurité : réinitialiser après 2 minutes si pas de réponse
    const safetyTimeout = setTimeout(() => {
      console.error('⏱️ Upload timeout - resetting state')
      setUploading(false)
      setUploadProgress(null)
      toast.error('Timeout - veuillez réessayer', { id: 'upload' })
    }, 120000) // 2 minutes

    const formData = new FormData()
    formData.append('photo', file)
    formData.append('language', i18n.language)
    
    // Ajouter le socket ID pour recevoir les mises à jour
    if (socket && socket.connected) {
      formData.append('socketId', socket.id)
      console.log('🔌 Socket connected:', socket.id)
    } else {
      console.log('⚠️ Socket not connected, upload will work but no real-time updates')
    }

    try {
      toast.loading('Upload en cours...', { id: 'upload' })
      
      const response = await fetch('/api/photos/upload', {
        method: 'POST',
        body: formData,
        headers: socket && socket.connected ? { 
          'X-Socket-Id': socket.id,
          'Authorization': `Bearer ${token}`
        } : {
          'Authorization': `Bearer ${token}`
        }
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const newPhoto = await response.json()
      console.log('✅ Photo uploaded:', newPhoto.id)
      
      toast.success('Photo uploadée!', { id: 'upload' })
      
      setPhotos([newPhoto, ...photos])
      setSelectedPhoto(newPhoto)
      setSelectedPhotoTags(newPhoto.tags || [])
      
      // Afficher le progress si le traitement est en cours
      if (newPhoto.processing) {
        setUploadProgress({
          stage: 'analyzing',
          progress: 10,
          message: newPhoto.message
        })
      }
      
      // Réinitialiser l'input file pour permettre de re-uploader le même fichier
      event.target.value = ''
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch (error) {
      console.error('❌ Error uploading photo:', error)
      toast.error('Erreur lors de l\'upload', { id: 'upload' })
      setUploadProgress(null)
      // Reset input on error
      event.target.value = ''
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } finally {
      clearTimeout(safetyTimeout) // Annuler le timeout
      setUploading(false)
      console.log('🏁 Upload process finished')
    }
  }

  const handleAddTag = async () => {
    if (!newTag.trim() || !selectedPhoto) return

    const tagName = newTag.trim()
    setAddingTag(true)
    
    try {
      const response = await fetch(`/api/photos/${selectedPhoto.id}/tags`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ tagName }),
      })
      const updatedTags = await response.json()
      setSelectedPhotoTags(updatedTags)
      setNewTag('')
      
      // Mettre à jour les tags dans la liste des photos
      setPhotos(prev => prev.map(p => 
        p.id === selectedPhoto.id ? { ...p, tags: updatedTags } : p
      ))
      
      // Trouver le nouveau tag (le dernier ajouté)
      const newTagObj = updatedTags.find(t => t.name === tagName)
      
      // Toast de confirmation
      toast.success(`Tag "${tagName}" ajouté`, {
        icon: '🏷️',
        duration: 2000,
      })
      
      // Mettre en surbrillance le nouveau tag
      if (newTagObj) {
        setHighlightedTagId(newTagObj.id)
        
        // Retirer la surbrillance après 3 secondes
        setTimeout(() => {
          setHighlightedTagId(null)
        }, 3000)
        
        // Scroll vers le tag spécifique (pas forcément en bas)
        setTimeout(() => {
          if (tagsListRef.current) {
            // Trouver l'élément du tag dans le DOM
            const tagElement = tagsListRef.current.querySelector(`[data-tag-id="${newTagObj.id}"]`)
            
            if (tagElement) {
              // Scroller vers cet élément spécifique
              tagElement.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',  // Scroll seulement si nécessaire
                inline: 'nearest'
              })
            }
          }
        }, 100)
      }
    } catch (error) {
      console.error('Error adding tag:', error)
      toast.error('Erreur lors de l\'ajout du tag')
    } finally {
      setAddingTag(false)
    }
  }

  const handleRemoveTag = async (tagId) => {
    if (!selectedPhoto) return

    try {
      await fetch(`/api/photos/${selectedPhoto.id}/tags/${tagId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      const updatedTags = selectedPhotoTags.filter(tag => tag.id !== tagId)
      setSelectedPhotoTags(updatedTags)
      
      // Mettre à jour les tags dans la liste des photos
      setPhotos(prev => prev.map(p => 
        p.id === selectedPhoto.id ? { ...p, tags: updatedTags } : p
      ))
      
      toast.success('Tag supprimé')
    } catch (error) {
      console.error('Error removing tag:', error)
      toast.error('Erreur lors de la suppression du tag')
    }
  }

  const openDeleteModal = (photoId, photoName) => {
    setDeleteModal({ isOpen: true, photoId, photoName })
  }

  const closeDeleteModal = () => {
    setDeleteModal({ isOpen: false, photoId: null, photoName: '' })
  }

  const handleDeletePhoto = async () => {
    const photoId = deleteModal.photoId

    try {
      toast.loading('Suppression...', { id: 'delete' })
      
      await fetch(`/api/photos/${photoId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      })
      
      setPhotos(photos.filter(p => p.id !== photoId))
      
      if (selectedPhoto && selectedPhoto.id === photoId) {
        setSelectedPhoto(null)
        setSelectedPhotoTags([])
      }
      
      toast.success('Photo supprimée', { id: 'delete' })
    } catch (error) {
      console.error('Error deleting photo:', error)
      toast.error('Erreur lors de la suppression', { id: 'delete' })
    }
  }

  const filteredPhotos = photos.filter(photo => {
    if (!photo || !photo.original_name) return false
    
    const query = searchQuery.toLowerCase()
    
    // Chercher dans le nom
    const nameMatch = photo.original_name.toLowerCase().includes(query)
    
    // Chercher dans les tags
    const tagsMatch = photo.tags && photo.tags.some(tag => 
      tag.name && tag.name.toLowerCase().includes(query)
    )
    
    return nameMatch || tagsMatch
  })

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const handleDownloadPhoto = async (photo) => {
    try {
      toast.loading('Téléchargement...', { id: 'download' })
      
      // Récupérer l'image
      const response = await fetch(photo.path)
      const blob = await response.blob()
      
      // Créer un lien de téléchargement
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = photo.original_name
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      window.URL.revokeObjectURL(url)
      
      toast.success('Photo téléchargée!', { id: 'download' })
    } catch (error) {
      console.error('Error downloading photo:', error)
      toast.error('Erreur lors du téléchargement', { id: 'download' })
    }
  }

  const handleFullscreen = () => {
    setIsFullscreen(true)
  }

  const startRenaming = (photo) => {
    setEditingPhotoId(photo.id)
    setEditingName(photo.original_name)
  }

  const cancelRenaming = () => {
    setEditingPhotoId(null)
    setEditingName('')
  }

  const handleReanalyze = async (photoId) => {
    if (reanalyzing) {
      toast.error('Une analyse est déjà en cours')
      return
    }

    try {
      setReanalyzing(true)
      toast.loading('Relance de l\'analyse IA...', { id: 'reanalyze' })

      const response = await fetch(`/api/photos/${photoId}/reanalyze`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
          'X-Socket-Id': socket?.id
        },
        body: JSON.stringify({
          socketId: socket?.id,
          language: i18n.language
        })
      })

      if (!response.ok) {
        throw new Error('Erreur lors de la réanalyse')
      }

      const data = await response.json()
      
      toast.success('Analyse IA en cours...', { id: 'reanalyze' })

      // Mettre à jour la photo pour afficher qu'elle est en cours d'analyse
      setPhotos(prev => prev.map(p => 
        p.id === photoId ? { ...p, tags: [], metadata: null } : p
      ))

      if (selectedPhoto?.id === photoId) {
        setSelectedPhoto({ ...selectedPhoto, tags: [], metadata: null })
        setSelectedPhotoTags([])
      }

      // Afficher le progress
      setUploadProgress({
        stage: 'analyzing',
        progress: 10,
        message: 'Analyse IA en cours...'
      })

    } catch (error) {
      console.error('Error reanalyzing photo:', error)
      toast.error('Erreur lors de la réanalyse', { id: 'reanalyze' })
      setReanalyzing(false)
    }
  }

  const saveRename = async (photoId) => {
    if (!editingName.trim()) {
      toast.error('Le nom ne peut pas être vide')
      return
    }

    try {
      toast.loading('Renommage...', { id: 'rename' })
      
      const response = await fetch(`/api/photos/${photoId}/rename`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ newName: editingName.trim() }),
      })
      
      const updatedPhoto = await response.json()
      
      // Mettre à jour la liste des photos
      setPhotos(prev => prev.map(p => 
        p.id === photoId ? { ...p, original_name: updatedPhoto.original_name } : p
      ))
      
      // Mettre à jour la photo sélectionnée si c'est celle-ci
      if (selectedPhoto && selectedPhoto.id === photoId) {
        setSelectedPhoto({ ...selectedPhoto, original_name: updatedPhoto.original_name })
      }
      
      setEditingPhotoId(null)
      setEditingName('')
      
      toast.success('Photo renommée!', { id: 'rename' })
    } catch (error) {
      console.error('Error renaming photo:', error)
      toast.error('Erreur lors du renommage', { id: 'rename' })
    }
  }

  return (
    <>
      {uploadProgress && (
        <UploadProgress 
          stage={uploadProgress.stage}
          progress={uploadProgress.progress}
          message={uploadProgress.message}
        />
      )}

      <ConfirmModal
        isOpen={deleteModal.isOpen}
        onClose={closeDeleteModal}
        onConfirm={handleDeletePhoto}
        title={t('modals.deletePhoto')}
        message={t('modals.deletePhotoConfirm', { name: deleteModal.photoName })}
        type="danger"
      />
      
      <div className="flex flex-col bg-gradient-to-br from-slate-50 to-slate-100 dark:from-gray-900 dark:to-gray-800" style={{ height: 'calc(100vh - 80px)' }}>
      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Photo List */}
        <div className="w-80 bg-white dark:bg-gray-800 border-r border-slate-200 dark:border-gray-700 overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-2">
                <ImageIcon className="w-5 h-5" />
                Photos ({filteredPhotos.length})
              </h2>
              
              {/* Upload Button */}
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={uploading}
                />
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all text-sm font-medium ${
                  uploading 
                    ? 'bg-slate-200 text-slate-500 cursor-not-allowed' 
                    : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white hover:from-blue-600 hover:to-purple-700 shadow-sm'
                }`}>
                  {uploading ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-2 border-slate-400 border-t-transparent"></div>
                      <span>Upload...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      <span>Upload</span>
                    </>
                  )}
                </div>
              </label>
            </div>
            
            {/* Search Bar */}
            <div className="mb-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-gray-500" />
                <input
                  type="text"
                  placeholder={t('gallery.searchPlaceholder')}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                />
                {searchQuery && (
                  <button
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 transform -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    <X className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            <div className="space-y-2">
              {filteredPhotos.map((photo) => (
                <div
                  key={photo.id}
                  onClick={() => setSelectedPhoto(photo)}
                  className={`cursor-pointer rounded-lg border-2 transition-all overflow-hidden ${
                    selectedPhoto?.id === photo.id
                      ? 'border-primary shadow-md'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="aspect-video bg-slate-100 overflow-hidden relative group">
                    <img
                      src={photo.path}
                      alt={photo.original_name}
                      className="w-full h-full object-cover"
                    />
                    {/* Action Buttons */}
                    <div className="absolute top-2 right-2 flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedPhoto(photo)
                          handleFullscreen()
                        }}
                        className="p-2 bg-purple-500 text-white rounded-full hover:bg-purple-600 shadow-lg"
                        title="Voir en plein écran"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDownloadPhoto(photo)
                        }}
                        className="p-2 bg-blue-500 text-white rounded-full hover:bg-blue-600 shadow-lg"
                        title="Télécharger la photo"
                      >
                        <Download className="w-4 h-4" />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation()
                          openDeleteModal(photo.id, photo.original_name)
                        }}
                        className="p-2 bg-red-500 text-white rounded-full hover:bg-red-600 shadow-lg"
                        title="Supprimer la photo"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="p-3 bg-white dark:bg-gray-800">
                    {editingPhotoId === photo.id ? (
                      <div className="flex items-center gap-2 mb-1">
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyPress={(e) => {
                            if (e.key === 'Enter') saveRename(photo.id)
                            if (e.key === 'Escape') cancelRenaming()
                          }}
                          className="flex-1 px-2 py-1 text-sm border border-primary rounded focus:outline-none focus:ring-1 focus:ring-primary"
                          autoFocus
                        />
                        <button
                          onClick={() => saveRename(photo.id)}
                          className="p-1 text-green-500 hover:bg-green-50 rounded"
                          title="Sauvegarder"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={cancelRenaming}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                          title="Annuler"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 mb-1 group">
                        <p className="flex-1 text-sm font-medium text-slate-700 dark:text-gray-200 truncate">
                          {photo.original_name}
                        </p>
                        <button
                          onClick={() => startRenaming(photo)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-primary hover:bg-slate-100 rounded transition-opacity"
                          title="Renommer"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                    <div className="flex items-center justify-between text-xs text-slate-500 dark:text-gray-400">
                      <span>{new Date(photo.created_at).toLocaleDateString()}</span>
                      <span className="font-semibold text-primary">{formatFileSize(photo.size)}</span>
                    </div>
                  </div>
                </div>
              ))}
              {filteredPhotos.length === 0 && photos.length > 0 && (
                <div className="text-center py-12 text-slate-400 dark:text-gray-500">
                  <Search className="w-16 h-16 mx-auto mb-3 opacity-50" />
                  <p>Aucune photo trouvée</p>
                  <p className="text-sm mt-1">Essayez un autre terme de recherche</p>
                </div>
              )}
              {photos.length === 0 && (
                <div className="text-center py-12 text-slate-400 dark:text-gray-500">
                  <ImageIcon className="w-16 h-16 mx-auto mb-3 opacity-50" />
                  <p>Aucune photo</p>
                  <p className="text-sm mt-1">Uploadez votre première photo!</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center - Photo Preview */}
        <div className="flex-1 overflow-auto bg-slate-50 dark:bg-gray-900">
          {selectedPhoto ? (
            <div className="h-full flex items-start justify-center py-8 px-8">
              <div className="max-w-5xl w-full">
                <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl overflow-hidden">
                  <img
                    src={selectedPhoto.path}
                    alt={selectedPhoto.original_name}
                    className="w-full h-auto max-h-[60vh] object-contain bg-slate-900"
                  />
                  <div className="p-6 bg-white dark:bg-gray-800">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        {/* AI Model Badge */}
                        {selectedPhoto.metadata && selectedPhoto.metadata.ai_model && (
                          <div className="mb-3">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-semibold bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900 dark:to-blue-900 text-purple-700 dark:text-purple-300 rounded-full border border-purple-200 dark:border-purple-700">
                              🤖 {t('gallery.analyzedBy')} {
                                selectedPhoto.metadata.ai_model === 'gpt-4o' ? 'OpenAI GPT-4o' : 
                                selectedPhoto.metadata.ai_model === 'grok-2-vision-1212' ? 'Grok 2 Vision' : 
                                selectedPhoto.metadata.ai_model === 'llava' ? 'Ollama LLaVA' : 
                                selectedPhoto.metadata.ai_model?.includes('gemini') ? 'OpenRouter Gemini 2.0' :
                                selectedPhoto.metadata.ai_model?.includes('qwen') ? 'OpenRouter Qwen' :
                                selectedPhoto.metadata.ai_model?.includes('llama-4') ? 'OpenRouter Llama 4' :
                                selectedPhoto.metadata.ai_model
                              }
                            </span>
                          </div>
                        )}
                        
                        {editingPhotoId === selectedPhoto.id ? (
                          <div className="flex items-center gap-2 mb-2">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyPress={(e) => {
                                if (e.key === 'Enter') saveRename(selectedPhoto.id)
                                if (e.key === 'Escape') cancelRenaming()
                              }}
                              className="flex-1 px-3 py-2 text-xl font-semibold border border-primary rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
                              autoFocus
                            />
                            <button
                              onClick={() => saveRename(selectedPhoto.id)}
                              className="p-2 text-green-500 hover:bg-green-50 rounded-lg"
                              title="Sauvegarder"
                            >
                              <Check className="w-5 h-5" />
                            </button>
                            <button
                              onClick={cancelRenaming}
                              className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                              title="Annuler"
                            >
                              <X className="w-5 h-5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 mb-2 group">
                            <h3 className="text-xl font-semibold text-slate-800 dark:text-white">
                              {selectedPhoto.original_name}
                            </h3>
                            <button
                              onClick={() => startRenaming(selectedPhoto)}
                              className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-primary hover:bg-slate-100 rounded transition-opacity"
                              title="Renommer"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <div className="flex flex-wrap gap-3 text-sm text-slate-600 dark:text-gray-400">
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{t('gallery.size')}:</span>
                            <span>{formatFileSize(selectedPhoto.size)}</span>
                          </div>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{t('gallery.type')}:</span>
                            <span>{selectedPhoto.mime_type}</span>
                          </div>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <span className="font-medium">{t('gallery.addedOn')}:</span>
                            <span>{new Date(selectedPhoto.created_at).toLocaleString()}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex gap-2 ml-4">
                        <button
                          onClick={() => handleReanalyze(selectedPhoto.id)}
                          disabled={reanalyzing}
                          className="p-2 text-purple-500 hover:bg-purple-50 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed group relative"
                          title="Relancer l'analyse IA"
                        >
                          {reanalyzing ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                          ) : (
                            <div className="relative">
                              <RefreshCw className="w-5 h-5" />
                              <Brain className="w-3 h-3 absolute -top-1 -right-1 text-purple-600" />
                            </div>
                          )}
                        </button>
                        <button
                          onClick={handleFullscreen}
                          className="p-2 text-purple-500 hover:bg-purple-50 rounded-lg transition-colors"
                          title="Voir en plein écran"
                        >
                          <Maximize2 className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDownloadPhoto(selectedPhoto)}
                          className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Télécharger cette photo"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => openDeleteModal(selectedPhoto.id, selectedPhoto.original_name)}
                          className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                          title="Supprimer cette photo"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>

                    {/* AI Analysis Panel */}
                    {selectedPhoto.metadata && (
                      <div className="mt-4 p-4 bg-gradient-to-br from-slate-50 to-blue-50 dark:from-gray-700 dark:to-gray-600 rounded-lg space-y-4 border border-slate-200 dark:border-gray-600">
                        {/* Description */}
                        {selectedPhoto.metadata.description && (
                          <div>
                            <h4 className="font-semibold text-sm text-slate-700 dark:text-gray-200 mb-2 flex items-center gap-2">
                              <span className="text-lg">📝</span>
                              {t('gallery.aiDescription')}
                            </h4>
                            <p className="text-sm text-slate-600 dark:text-gray-300 leading-relaxed">
                              {selectedPhoto.metadata.description}
                            </p>
                            {selectedPhoto.metadata.atmosphere && (
                              <p className="text-xs text-slate-500 dark:text-gray-400 mt-2 italic flex items-center gap-1">
                                <span>✨</span>
                                <span>{selectedPhoto.metadata.atmosphere}</span>
                              </p>
                            )}
                          </div>
                        )}

                        {/* Dominant Colors */}
                        {selectedPhoto.metadata.dominant_colors && selectedPhoto.metadata.dominant_colors.length > 0 && (
                          <div>
                            <h4 className="font-semibold text-sm text-slate-700 dark:text-gray-200 mb-2 flex items-center gap-2">
                              <span className="text-lg">🎨</span>
                              {t('gallery.dominantColors')}
                            </h4>
                            <div className="flex gap-3">
                              {selectedPhoto.metadata.dominant_colors.map((color, idx) => (
                                <div key={idx} className="flex flex-col items-center gap-1">
                                  <div 
                                    className="w-12 h-12 rounded-lg border-2 border-white shadow-md transition-transform hover:scale-110"
                                    style={{ backgroundColor: color.hex }}
                                    title={`${color.name} (${color.percentage}%)`}
                                  />
                                  <span className="text-xs font-medium text-slate-600 dark:text-gray-300">
                                    {color.percentage}%
                                  </span>
                                  <span className="text-xs text-slate-500 dark:text-gray-400 capitalize">
                                    {color.name}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Quality Score */}
                        {selectedPhoto.metadata.quality_score && (
                          <div>
                            <h4 className="font-semibold text-sm text-slate-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                              <span className="text-lg">⭐</span>
                              {t('gallery.imageQuality')}
                            </h4>
                            <div className="space-y-3">
                              {/* Score global */}
                              <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                  <div className="text-3xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
                                    {selectedPhoto.metadata.quality_score}
                                  </div>
                                  <div className="text-slate-400 dark:text-gray-400">/100</div>
                                </div>
                                <div className="flex-1">
                                  <div className="h-2 bg-slate-200 dark:bg-gray-500 rounded-full overflow-hidden">
                                    <div 
                                      className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                                      style={{ width: `${selectedPhoto.metadata.quality_score}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-slate-500 dark:text-gray-400 mt-1 capitalize">
                                    {translateQuality(selectedPhoto.metadata.quality_overall)}
                                  </span>
                                </div>
                              </div>

                              {/* Détails */}
                              <div className="grid grid-cols-3 gap-2 text-xs">
                                <div className="bg-white dark:bg-gray-800 p-2 rounded-lg text-center">
                                  <div className="font-medium text-slate-700 dark:text-gray-300">{t('gallery.sharpness')}</div>
                                  <div className={`mt-1 capitalize font-semibold ${
                                    ['excellent', 'excellente', 'excelente'].includes(selectedPhoto.metadata.quality_sharpness?.toLowerCase()) ? 'text-green-600' :
                                    ['good', 'bon', 'bonne', 'bueno', 'buena'].includes(selectedPhoto.metadata.quality_sharpness?.toLowerCase()) ? 'text-blue-600' :
                                    ['average', 'moyen', 'moyenne', 'medio', 'media'].includes(selectedPhoto.metadata.quality_sharpness?.toLowerCase()) ? 'text-yellow-600' :
                                    'text-red-600'
                                  }`}>
                                    {translateQuality(selectedPhoto.metadata.quality_sharpness)}
                                  </div>
                                </div>
                                <div className="bg-white dark:bg-gray-800 p-2 rounded-lg text-center">
                                  <div className="font-medium text-slate-700 dark:text-gray-300">{t('gallery.lighting')}</div>
                                  <div className={`mt-1 capitalize font-semibold ${
                                    ['excellent', 'excellente', 'excelente'].includes(selectedPhoto.metadata.quality_lighting?.toLowerCase()) ? 'text-green-600' :
                                    ['good', 'bon', 'bonne', 'bueno', 'buena'].includes(selectedPhoto.metadata.quality_lighting?.toLowerCase()) ? 'text-blue-600' :
                                    ['average', 'moyen', 'moyenne', 'medio', 'media'].includes(selectedPhoto.metadata.quality_lighting?.toLowerCase()) ? 'text-yellow-600' :
                                    'text-red-600'
                                  }`}>
                                    {translateQuality(selectedPhoto.metadata.quality_lighting)}
                                  </div>
                                </div>
                                <div className="bg-white dark:bg-gray-800 p-2 rounded-lg text-center">
                                  <div className="font-medium text-slate-700 dark:text-gray-300">{t('gallery.composition')}</div>
                                  <div className={`mt-1 capitalize font-semibold ${
                                    ['excellent', 'excellente', 'excelente'].includes(selectedPhoto.metadata.quality_composition?.toLowerCase()) ? 'text-green-600' :
                                    ['good', 'bon', 'bonne', 'bueno', 'buena'].includes(selectedPhoto.metadata.quality_composition?.toLowerCase()) ? 'text-blue-600' :
                                    ['average', 'moyen', 'moyenne', 'medio', 'media'].includes(selectedPhoto.metadata.quality_composition?.toLowerCase()) ? 'text-yellow-600' :
                                    'text-red-600'
                                  }`}>
                                    {translateQuality(selectedPhoto.metadata.quality_composition)}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-400 dark:text-gray-500">
              <div className="text-center">
                <ImageIcon className="w-24 h-24 mx-auto mb-4 opacity-50" />
                <p className="text-lg">Select a photo to view</p>
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar - Tags */}
        <div className="w-80 bg-white dark:bg-gray-800 border-l border-slate-200 dark:border-gray-700 flex flex-col">
          <div className="p-4 flex-shrink-0">
            <div className="mb-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-slate-700 dark:text-gray-200 flex items-center gap-2">
                  <Tag className="w-5 h-5" />
                  Tags
                </h2>
                
                {/* AI Model Badge */}
                {selectedPhoto && selectedPhoto.metadata && selectedPhoto.metadata.ai_model && (
                  <span className="inline-flex items-center px-2 py-0.5 text-xs font-semibold bg-gradient-to-r from-purple-100 to-blue-100 dark:from-purple-900 dark:to-blue-900 text-purple-700 dark:text-purple-300 rounded-full border border-purple-200 dark:border-purple-700">
                    🤖 {selectedPhoto.metadata.ai_model === 'gpt-4o' ? 'GPT-4o' : selectedPhoto.metadata.ai_model === 'grok-2-vision-1212' ? 'Grok 2' : selectedPhoto.metadata.ai_model === 'llava' ? 'Ollama' : selectedPhoto.metadata.ai_model}
                  </span>
                )}
              </div>
            </div>
            
            {selectedPhoto && (
              /* Add Tag Input */
              <div className="mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && handleAddTag()}
                    placeholder={t('gallery.addTagPlaceholder')}
                    className="flex-1 px-3 py-2 border border-slate-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent text-sm"
                    disabled={addingTag}
                  />
                  <button
                    onClick={handleAddTag}
                    disabled={!newTag.trim() || addingTag}
                    className="px-3 py-2 bg-primary text-white rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {addingTag ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Plus className="w-5 h-5" />
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Tags List - Scrollable */}
          <div ref={tagsListRef} className="flex-1 overflow-y-auto px-4 pb-4">
            {selectedPhoto ? (
              <div className="space-y-2">
                  {selectedPhotoTags.length > 0 ? (
                    selectedPhotoTags.map((tag) => (
                      <div
                        key={tag.id}
                        data-tag-id={tag.id}
                        className={`flex items-center justify-between px-3 py-2 rounded-lg group transition-colors ${
                          highlightedTagId === tag.id 
                            ? 'tag-highlight' 
                            : 'bg-slate-100 dark:bg-gray-700 hover:bg-slate-200 dark:hover:bg-gray-600'
                        }`}
                      >
                        <span className={`text-sm font-medium ${
                          highlightedTagId === tag.id ? '' : 'text-slate-700 dark:text-gray-200'
                        }`}>
                          {tag.name}
                        </span>
                        <button
                          onClick={() => handleRemoveTag(tag.id)}
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-slate-400 hover:text-red-500"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="text-center py-8 text-slate-400 dark:text-gray-500">
                      <Tag className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No tags yet</p>
                    </div>
                  )}
              </div>
            ) : (
              <div className="text-center py-12 text-slate-400 dark:text-gray-500">
                <Tag className="w-16 h-16 mx-auto mb-3 opacity-50" />
                <p>Select a photo to view tags</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal d'avertissement mobile */}
      {showMobileWarning && (
        <MobileWarningModal onClose={() => setShowMobileWarning(false)} />
      )}

    </div>

    {/* Fullscreen Modal */}
    {isFullscreen && selectedPhoto && (
      <div 
        className="fixed inset-0 z-50 bg-black flex items-center justify-center"
        onClick={closeFullscreen}
      >
        <button
          onClick={closeFullscreen}
          className="absolute top-4 right-4 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors backdrop-blur-sm z-10"
          title="Fermer (ESC)"
        >
          <X className="w-6 h-6" />
        </button>
        
        <img
          src={selectedPhoto.path}
          alt={selectedPhoto.original_name}
          className="max-w-full max-h-full object-contain cursor-zoom-out"
          onClick={closeFullscreen}
        />
        
        <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 bg-black/50 backdrop-blur-sm text-white px-6 py-3 rounded-full">
          <p className="text-sm font-medium">{selectedPhoto.original_name}</p>
        </div>
      </div>
    )}

    {/* Quota Error Modal */}
    {quotaErrorModal.isOpen && (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
        <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <X className="w-8 h-8 text-red-600" />
            </div>
            
            <h3 className="text-xl font-bold text-gray-900 mb-2">
              {t('modals.quotaError', { provider: quotaErrorModal.provider })}
            </h3>
            
            <p className="text-gray-600 mb-2">
              {t('modals.quotaErrorMessage')}
            </p>
            
            <p className="text-orange-600 font-bold text-lg mb-4">
              {t('modals.quotaErrorWarning')}
            </p>
            
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4">
              <p className="text-sm text-red-800 font-mono break-words">
                {quotaErrorModal.error}
              </p>
            </div>
            
            <div className="space-y-3">
              <div className="text-left bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold text-blue-900 mb-2">{t('modals.solutions')}</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>• {t('modals.solutionRecharge', { provider: quotaErrorModal.provider })}</li>
                  <li>• {t('modals.solutionChangeModel')}</li>
                  <li>• {t('modals.solutionUseOllama')}</li>
                </ul>
              </div>
              
              <button
                onClick={() => setQuotaErrorModal({ isOpen: false, provider: '', error: '' })}
                className="w-full px-4 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg"
              >
                {t('modals.understood')}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
