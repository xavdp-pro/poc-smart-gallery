/**
 * Configuration centralisée des providers IA
 * FREE_ONLY : uniquement modèles gratuits (Ollama local + OpenRouter :free)
 */

export const FREE_ONLY = true;

export const AI_PROVIDERS_CONFIG = {
  openai: {
    id: 'openai',
    name: 'OpenAI GPT-4o',
    icon: '🔵',
    type: 'cloud',
    cost: 'payant',
    free: false,
    envKey: 'OPENAI_API_KEY',
    model: 'gpt-4o',
    description: 'Modèle payant — désactivé en mode gratuit uniquement'
  },
  grok: {
    id: 'grok',
    name: 'Grok 2 Vision',
    icon: '🟣',
    type: 'cloud',
    cost: 'payant',
    free: false,
    envKey: 'GROK_API_KEY',
    model: 'grok-2-vision-1212',
    description: 'Modèle payant — désactivé en mode gratuit uniquement'
  },
  ollama: {
    id: 'ollama',
    name: 'Ollama LLaVA',
    icon: '🦙',
    type: 'local',
    cost: 'gratuit',
    free: true,
    envKey: 'OLLAMA_URL',
    model: 'llava:latest',
    description: 'Le plus rapide (~4 s), gratuit et illimité sur votre serveur'
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter Nemotron VL (gratuit)',
    icon: '🟠',
    type: 'cloud',
    cost: 'gratuit',
    free: true,
    envKey: 'OPENROUTER_API_KEY',
    model: 'nvidia/nemotron-nano-12b-v2-vl:free',
    description: 'Vision-language NVIDIA 12B — 0 € via OpenRouter (:free)'
  }
};

/** Modèles vision gratuits OpenRouter (fallback si le principal échoue) */
export const OPENROUTER_FREE_VISION_MODELS = [
  'nvidia/nemotron-nano-12b-v2-vl:free',
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'openrouter/free',
];

export function isProviderFree(providerId) {
  return AI_PROVIDERS_CONFIG[providerId]?.free === true;
}

export function isProviderAllowed(providerId) {
  if (!AI_PROVIDERS_CONFIG[providerId]) return false;
  if (FREE_ONLY && !isProviderFree(providerId)) return false;
  return true;
}

export function isProviderAvailable(providerId) {
  if (!isProviderAllowed(providerId)) return false;
  const config = AI_PROVIDERS_CONFIG[providerId];
  return !!process.env[config.envKey];
}

export function getAvailableProviders() {
  const available = {};
  Object.keys(AI_PROVIDERS_CONFIG).forEach((providerId) => {
    available[providerId] = isProviderAvailable(providerId);
  });
  return available;
}

export function getProviderInfo(providerId) {
  return AI_PROVIDERS_CONFIG[providerId] || null;
}

export function getAllProvidersInfo() {
  return Object.keys(AI_PROVIDERS_CONFIG)
    .filter(isProviderAllowed)
    .map((providerId) => ({
      ...AI_PROVIDERS_CONFIG[providerId],
      available: isProviderAvailable(providerId),
    }));
}

export function getDefaultFreeProvider() {
  // Ollama local : ~4 s/analyse | OpenRouter :free : ~20–40 s
  const order = ['ollama', 'openrouter'];
  for (const id of order) {
    if (isProviderAvailable(id)) return id;
  }
  return 'ollama';
}
