import OpenAI from 'openai';
import { readFileSync } from 'fs';
import dotenv from 'dotenv';
import { getSetting } from './database.js';
import {
  AI_PROVIDERS_CONFIG,
  OPENROUTER_FREE_VISION_MODELS,
  isProviderAllowed,
  getDefaultFreeProvider,
} from './ai-providers-config.js';

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Client Grok (xAI)
const grok = new OpenAI({
  apiKey: process.env.GROK_API_KEY,
  baseURL: 'https://api.x.ai/v1',
});

// Client OpenRouter (modèles gratuits LLaVA)
const openrouter = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: 'https://openrouter.ai/api/v1',
  defaultHeaders: {
    'HTTP-Referer': process.env.APP_URL || 'https://photo-v1.c9.ooo.ovh',
    'X-Title': 'Photo Manager V1'
  }
});

// Fonction pour récupérer l'usage et les crédits OpenAI
export async function getOpenAIUsage() {
  try {
    const apiKey = process.env.OPENAI_API_KEY;

    // 1. Récupérer les informations de facturation (crédit restant)
    const billingResponse = await fetch(
      'https://api.openai.com/v1/dashboard/billing/credit_grants',
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let totalGranted = 0;
    let totalUsed = 0;
    let totalAvailable = 0;

    if (billingResponse.ok) {
      const billingData = await billingResponse.json();
      totalGranted = billingData.total_granted || 0;
      totalUsed = billingData.total_used || 0;
      totalAvailable = billingData.total_available || 0;
    }

    // 2. Récupérer l'usage du mois en cours
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

    const usageResponse = await fetch(
      `https://api.openai.com/v1/dashboard/billing/usage?start_date=${startOfMonth.toISOString().split('T')[0]}&end_date=${endOfMonth.toISOString().split('T')[0]}`,
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        }
      }
    );

    let monthlyUsageCents = 0;
    if (usageResponse.ok) {
      const usageData = await usageResponse.json();
      monthlyUsageCents = usageData.total_usage || 0;
    }

    return {
      success: true,
      creditRemaining: totalAvailable / 100, // Convertir centimes en dollars
      creditTotal: totalGranted / 100,
      creditUsed: totalUsed / 100,
      monthlyUsage: monthlyUsageCents / 100,
      period: 'Mois en cours'
    };
  } catch (error) {
    console.error('Error fetching OpenAI usage:', error);
    return {
      success: false,
      error: error.message,
      creditRemaining: 0,
      creditTotal: 0,
      creditUsed: 0,
      monthlyUsage: 0
    };
  }
}

// Configuration des langues pour les prompts
const LANGUAGE_CONFIG = {
  fr: {
    name: 'français',
    systemPrompt: "Tu es un expert en analyse d'images. Tu fournis des analyses complètes et détaillées incluant des tags, descriptions, couleurs et évaluation de qualité. Tu réponds TOUJOURS en français.",
    ollamaPrompt: "Décris cette image en français de manière détaillée en incluant tous les objets visibles, les couleurs, l'ambiance, le style, la composition et l'éclairage.",
    stopWords: ['cette', 'dans', 'avec', 'pour', 'sont', 'très', 'plus', 'comme', 'peut', 'être', 'fait', 'tous', 'tout']
  },
  en: {
    name: 'English',
    systemPrompt: "You are an expert in image analysis. You provide complete and detailed analyses including tags, descriptions, colors and quality assessment. You ALWAYS respond in English.",
    ollamaPrompt: "Describe this image in English in detail including all visible objects, colors, atmosphere, style, composition and lighting.",
    stopWords: ['this', 'that', 'with', 'from', 'have', 'been', 'were', 'they', 'their', 'what', 'when', 'where', 'which', 'there', 'these', 'those', 'about', 'would', 'could', 'should', 'being', 'very', 'more', 'some', 'into', 'also']
  },
  es: {
    name: 'español',
    systemPrompt: "Eres un experto en análisis de imágenes. Proporcionas análisis completos y detallados que incluyen etiquetas, descripciones, colores y evaluación de calidad. SIEMPRE respondes en español.",
    ollamaPrompt: "Describe esta imagen en español de manera detallada incluyendo todos los objetos visibles, los colores, el ambiente, el estilo, la composición y la iluminación.",
    stopWords: ['esta', 'este', 'esto', 'esos', 'esas', 'para', 'como', 'pero', 'más', 'todo', 'todos', 'toda', 'todas', 'puede', 'sido', 'están', 'tiene', 'tienen', 'desde', 'donde', 'cuando', 'sobre', 'entre', 'también', 'aunque', 'porque', 'mientras']
  }
};

async function openrouterVisionCompletion(client, messages, maxTokens = 3000) {
  const models = [
    AI_PROVIDERS_CONFIG.openrouter.model,
    ...OPENROUTER_FREE_VISION_MODELS.filter((m) => m !== AI_PROVIDERS_CONFIG.openrouter.model),
  ];

  let lastError;
  for (const model of models) {
    try {
      console.log('🌐 OpenRouter try model:', model);
      return await client.chat.completions.create({
        model,
        messages,
        max_tokens: maxTokens,
        temperature: 0.7,
      });
    } catch (err) {
      lastError = err;
      console.warn(`⚠️ OpenRouter model ${model} failed:`, err.message);
    }
  }
  throw lastError;
}

export async function analyzeImage(imagePath, language = 'fr') {
  try {
    const providerSetting = getSetting('ai_provider');
    let provider = providerSetting?.value || getDefaultFreeProvider();
    if (!isProviderAllowed(provider)) {
      provider = getDefaultFreeProvider();
      console.warn(`⚠️ Provider non autorisé (mode gratuit), bascule sur ${provider}`);
    }

    // Récupérer la config de langue (défaut: français)
    const langConfig = LANGUAGE_CONFIG[language] || LANGUAGE_CONFIG.fr;

    console.log(`🤖 Using AI provider: ${provider.toUpperCase()} | Language: ${langConfig.name}`);

    // Read the image file and convert to base64
    const imageBuffer = readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    // OLLAMA - Utiliser votre instance Ollama locale avec LLaVA
    if (provider === 'ollama') {
      console.log('🦙 Using Ollama with LLaVA');

      const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

      // Appeler Ollama avec LLaVA pour analyse vision
      const response = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: AI_PROVIDERS_CONFIG.ollama.model,
          prompt: langConfig.ollamaPrompt,
          images: [base64Image],
          stream: false
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Ollama error response:', errorText);
        throw new Error(`Ollama API error (${response.status}): ${errorText || response.statusText}`);
      }

      const result = await response.json();
      const description = result.response || '';

      console.log('🦙 LLaVA response:', description.substring(0, 200));

      // Extraire des tags intelligemment de la description
      const stopWords = langConfig.stopWords;
      const words = description.toLowerCase()
        .replace(/[.,;:!?()]/g, ' ')
        .split(/\s+/)
        .filter(w => w.length > 3 && w.length < 25 && !stopWords.includes(w));

      const tags = [...new Set(words)].slice(0, 60);

      // Extraire les couleurs dominantes de l'image avec Sharp
      const sharp = (await import('sharp')).default;
      const stats = await sharp(imageBuffer)
        .resize(150, 150, { fit: 'cover' })
        .raw()
        .toBuffer({ resolveWithObject: true });

      // Fonction pour nommer une couleur de manière précise
      function getColorName(r, g, b) {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const lightness = (max + min) / 2;
        const saturation = max === min ? 0 : (max - min) / (255 - Math.abs(max + min - 255));

        // Couleurs achromatiques (noir, blanc, gris)
        if (saturation < 0.15) {
          if (lightness > 220) return 'blanc';
          if (lightness < 40) return 'noir';
          if (lightness > 160) return 'gris clair';
          if (lightness < 90) return 'gris foncé';
          return 'gris';
        }

        // Couleurs chromatiques
        const dominantChannel = Math.max(r, g, b);
        const isRed = r === dominantChannel;
        const isGreen = g === dominantChannel;
        const isBlue = b === dominantChannel;

        // Marron/Beige (rouge+vert, peu de bleu, pas trop lumineux)
        if (r > 80 && g > 60 && b < 140 && r > b && g > b && Math.abs(r - g) < 80) {
          if (lightness < 100) return 'marron';
          if (lightness < 150) return 'beige';
          return 'beige clair';
        }

        // Orange (rouge + vert moyen, peu de bleu)
        if (isRed && r > 180 && g > 80 && g < 180 && b < 100) return 'orange';

        // Jaune (rouge + vert, peu de bleu)
        if (r > 180 && g > 180 && b < 140) return 'jaune';

        // Rose (rouge dominant, bleu moyen, lumineux)
        if (isRed && b > 120 && lightness > 140) return 'rose';

        // Rouge
        if (isRed && r > 140 && g < 100 && b < 100) return 'rouge';

        // Violet/Mauve (rouge + bleu)
        if (r > 100 && b > 100 && Math.abs(r - b) < 60 && g < Math.min(r, b) - 20) {
          return lightness > 140 ? 'mauve' : 'violet';
        }

        // Cyan (vert + bleu, peu de rouge)
        if (g > 120 && b > 120 && r < 100) return 'cyan';

        // Vert
        if (isGreen && g > 100 && r < 120 && b < 120) {
          return lightness > 160 ? 'vert clair' : 'vert';
        }

        // Bleu
        if (isBlue && b > 100 && r < 120 && g < 140) {
          return lightness > 160 ? 'bleu clair' : 'bleu';
        }

        return 'couleur';
      }

      // Calculer les couleurs dominantes avec clustering optimisé
      const colorMap = {};
      const pixels = stats.data;

      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];

        // Clustering plus large pour regrouper les couleurs similaires
        const rr = Math.round(r / 40) * 40;
        const gg = Math.round(g / 40) * 40;
        const bb = Math.round(b / 40) * 40;
        const key = `${rr},${gg},${bb}`;

        colorMap[key] = (colorMap[key] || 0) + 1;
      }

      // Trier et prendre les 5 couleurs les plus fréquentes
      const sortedColors = Object.entries(colorMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      const totalPixels = pixels.length / 4;
      const colors = sortedColors.map(([color, count]) => {
        const [r, g, b] = color.split(',').map(Number);
        const hex = '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
        const percentage = Math.round((count / totalPixels) * 100);
        const name = getColorName(r, g, b);

        return { hex, name, percentage };
      }).filter(c => c.percentage > 0);

      return {
        tags: tags.slice(0, 100),
        description: description,
        atmosphere: 'Analysé par Ollama LLaVA',
        colors: colors,
        quality: {
          score: 80,
          sharpness: 'bon',
          lighting: 'bon',
          composition: 'bon',
          overall_rating: 'bon'
        },
        aiModel: 'llava'
      };
    }

    if (provider === 'openrouter') {
      const messages = [
        {
          role: "system",
          content: langConfig.systemPrompt
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `Analyze this image in extreme detail and provide a complete analysis in JSON format.

IMPORTANT: 
- ALL tags must be in ${langConfig.name.toUpperCase()}
- The description must be in ${langConfig.name.toUpperCase()}
- The atmosphere must be in ${langConfig.name.toUpperCase()}
- Color names must be in ${langConfig.name.toUpperCase()}

Return a JSON object with the following structure:
{
  "tags": ["tag1", "tag2", ...],
  "description": "Detailed description of the image in ${langConfig.name} (2-3 sentences). ALWAYS start by identifying the precise TYPE OF PLACE.",
  "atmosphere": "The mood and atmosphere of the scene in ${langConfig.name}",
  "dominant_colors": [
    {"hex": "#RRGGBB", "name": "color name in ${langConfig.name}", "percentage": 40},
    {"hex": "#RRGGBB", "name": "color name in ${langConfig.name}", "percentage": 30},
    {"hex": "#RRGGBB", "name": "color name in ${langConfig.name}", "percentage": 20}
  ],
  "quality": {
    "score": 85,
    "sharpness": "excellent|good|average|poor",
    "lighting": "excellent|good|average|poor",
    "composition": "excellent|good|average|poor",
    "overall_rating": "excellent|good|average|poor"
  }
}

For TAGS (ALL IN ${langConfig.name.toUpperCase()}), include ALL these categories:
1. TYPE OF PLACE (PRIORITY): Precisely identify the type of place
2. OBJECTS: Every visible object, element (furniture, tools, appliances, etc.)
3. SUBJECTS: People, animals, main subjects (with details: age, gender, pose, expression, clothing)
4. COLORS: Dominant colors, color palettes, tones (warm/cold), specific shades
5. LIGHTING: Natural/artificial, time of day, light quality (soft/hard), shadows, brightness
6. COMPOSITION: Perspective, framing, depth of field, rule of thirds, symmetry
7. MOOD/ATMOSPHERE: Emotions, feelings, ambiance (peaceful, energetic, mysterious, etc.)
8. ACTIVITIES: Ongoing actions, suggested activities
9. STYLE: Photographic style, artistic style, aesthetic (modern, vintage, minimalist, etc.)
10. TEXTURES: Surface qualities (smooth, rough, soft, metallic, etc.)
11. PATTERNS: Stripes, dots, geometric patterns, organic patterns
12. WEATHER: If outdoor (sunny, cloudy, rainy, foggy, etc.)
13. SEASON: Indicators of spring, summer, autumn, winter
14. TECHNIQUE: Type of photo (portrait, landscape, macro, aerial, etc.)

Generate 50-100+ EXHAUSTIVE tags in ${langConfig.name.toUpperCase()}.

Return ONLY the JSON object, no other text.`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${base64Image}`,
              },
            },
          ],
        },
      ];

      const response = await openrouterVisionCompletion(openrouter, messages);
      const content = response.choices[0].message.content.trim();
      const model = response.model || AI_PROVIDERS_CONFIG.openrouter.model;

      return parseVisionJsonResponse(content, model);
    }

    throw new Error(`Provider "${provider}" indisponible en mode gratuit uniquement`);
  } catch (error) {
    console.error('Error analyzing image:', error);
    throw error;
  }
}

function parseVisionJsonResponse(content, model) {
    let analysisData;
    try {
      const jsonContent = content.trim().replace(/```json\n?/g, '').replace(/```\n?/g, '');
      analysisData = JSON.parse(jsonContent);
    } catch (parseError) {
      console.error('Error parsing JSON response:', parseError);
      console.error('Raw content:', content);
      throw new Error('Failed to parse AI response as JSON');
    }

    // Clean up tags
    const tags = analysisData.tags
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag.length > 0 && tag.length < 50);

    return {
      tags,
      description: analysisData.description || '',
      atmosphere: analysisData.atmosphere || '',
      colors: analysisData.dominant_colors || [],
      quality: analysisData.quality || { score: 75, sharpness: 'good', lighting: 'good', composition: 'good', overall_rating: 'good' },
      aiModel: model
    };
}
