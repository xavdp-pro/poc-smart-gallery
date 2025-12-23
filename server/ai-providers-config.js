/**
 * Configuration centralisée des providers IA
 * Cette configuration est utilisée par le backend ET le frontend
 */

export const AI_PROVIDERS_CONFIG = {
  openai: {
    id: 'openai',
    name: 'OpenAI GPT-4o',
    icon: '🔵',
    type: 'cloud',
    cost: 'payant',
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o',
    description: 'Modèle le plus puissant, analyse exhaustive'
  },
  grok: {
    id: 'grok',
    name: 'Grok 2 Vision',
    icon: '🟣',
    type: 'cloud',
    cost: 'payant',
    envKey: 'GROK_API_KEY',
    model: 'grok-2-vision-1212',
    description: 'Modèle alternatif puissant'
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama LLaVA',
    icon: '🦙',
    type: 'local',
    cost: 'gratuit',
    envKey: 'OLLAMA_URL',
    model: 'llava:7b',
    description: 'Modèle local gratuit illimité'
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter Qwen3 VL',
    icon: '🟠',
    type: 'cloud',
    cost: 'gratuit',
    envKey: 'OPENROUTER_API_KEY',
    model: 'qwen/qwen-2.5-vl-7b-instruct:free',
    description: 'Qwen 2.5 VL 7B gratuit (vision)'
  }
};

/**
 * Vérifie si un provider est disponible (clé API configurée)
 */
export function isProviderAvailable(providerId) {
  const config = AI_PROVIDERS_CONFIG[providerId];
  if (!config) return false;

  const envValue = process.env[config.envKey];
  return !!envValue;
}

/**
 * Retourne la liste des providers disponibles
 */
export function getAvailableProviders() {
  const available = {};

  Object.keys(AI_PROVIDERS_CONFIG).forEach(providerId => {
    available[providerId] = isProviderAvailable(providerId);
  });

  return available;
}

/**
 * Retourne les informations complètes d'un provider
 */
export function getProviderInfo(providerId) {
  return AI_PROVIDERS_CONFIG[providerId] || null;
}

/**
 * Retourne tous les providers avec leur disponibilité
 */
export function getAllProvidersInfo() {
  return Object.keys(AI_PROVIDERS_CONFIG).map(providerId => ({
    ...AI_PROVIDERS_CONFIG[providerId],
    available: isProviderAvailable(providerId)
  }));
}
