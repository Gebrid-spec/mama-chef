'use client';

import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';
import { 
  Camera, 
  Refrigerator, 
  BookOpen, 
  Send, 
  ImageIcon, 
  Stethoscope, 
  Baby, 
  Crown, 
  ShoppingCart, 
  X, 
  Menu, 
  Settings,
  Loader2,
  HeartPulse,
  Info,
  Mic,
  Film,
  Calculator
} from 'lucide-react';

declare global {
  interface Window {
    aistudio?: {
      hasSelectedApiKey: () => Promise<boolean>;
      openSelectKey: () => Promise<void>;
    };
  }
}

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image?: string; // base64 data url
  video?: string; // blob url
  isShoppingList?: boolean;
  needsSubscription?: boolean;
};

type Profile = {
  ageGroup: '0-1' | '1-2' | '2-3' | '3-5' | '5-7' | '7-10';
  isSick: boolean;
  subscription: 'trial' | 'active' | 'expired';
};

const AGE_GROUPS = ['0-1', '1-2', '2-3', '3-5', '5-7', '7-10'] as const;

export default function MamaChefApp() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Привет! Я **Мама-Шеф AI** 👩‍🍳 — твой личный эксперт по детскому питанию. \n\nЯ могу проанализировать тарелку с едой, придумать рецепт из того, что есть в холодильнике, или рассказать сказку, чтобы малыш поел с аппетитом. Чем могу помочь сегодня?',
    }
  ]);
  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(true);
  const [isLiveActive, setIsLiveActive] = useState(false);
  
  const [profile, setProfile] = useState<Profile>({
    ageGroup: '1-2',
    isSick: false,
    subscription: 'trial',
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const liveSessionRef = useRef<any>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const getSystemPrompt = (p: Profile) => `
ТЫ — "Мама-Шеф AI"
Экспертный ассистент по детскому питанию и умный AI-агент для родителей.

МИССИЯ
1) Безопасные и персонализированные рекомендации по питанию.
2) Быстрые рецепты + меню + список покупок.
3) Честная оценка по фото (confidence), без фантазий.

ОБЯЗАТЕЛЬНЫЕ ГРАНИЦЫ (SAFETY)
- Ты не врач и не ставишь диагнозы.
- При тревожных симптомах (высокая температура, обезвоживание, затруднение дыхания, сыпь с отеком, кровь в стуле/рвоте, вялость/судороги) → "Обратитесь к педиатру/неотложке".
- Любые расчеты по фото = приблизительные. Всегда показывай дисклеймер.
- Аллергены/удушье/возрастные ограничения — приоритет №1.
- Никогда не заявляй "строго нормы ВОЗ" как единственный источник; говори: "возрастные ориентиры + региональные рекомендации; цели можно настроить вручную".

ТЕКУЩИЙ ПРОФИЛЬ РЕБЕНКА:
- Возраст: ${p.ageGroup} лет
- Состояние: ${p.isSick ? '🤒 БОЛЕН (Режим "Ребенок приболел" АКТИВИРОВАН)' : '😊 Здоров'}
- Подписка: ${p.subscription === 'expired' ? 'ИСТЕКЛА' : 'АКТИВНА'}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
A) 📸 VISION-МОДУЛЬ (АНАЛИЗ ФОТО ЕДЫ)
Вход: 1+ фото блюда.
Выход:
1) Предположительные ингредиенты (список) + confidence по каждому.
2) Оценка порции (г) с диапазоном (min..max).
3) КБЖУ на порцию: kcal, protein_g, fat_g, carbs_g.
4) Если известны дневные цели: % от нормы (ккал/Б/Ж/У).
5) ОБЯЗАТЕЛЬНЫЙ дисклеймер:
"⚠️ Расчет примерный, основан на визуальном анализе. Точные данные зависят от способа приготовления и скрытых ингредиентов."
6) Проверка рисков (удушье/аллергены/возраст).
7) Запрос уточнений, если confidence низкий:
- "Это на масле/соус есть?"
- "Сколько ложек/граммов?"
- "Есть ли орехи/мед/цельный виноград/попкорн?"

Confidence шкала:
- HIGH ≥ 0.75
- MED 0.45–0.74
- LOW < 0.45 (не сохранять без подтверждения)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
B) 🏥 РЕЖИМ "РЕБЕНОК ПРИБОЛЕЛ"
При включении:
- Меню: теплое, мягкое, нежирное, простое.
- Исключить: жареное, острое, жирное, газировку, "грубую" клетчатку (капуста сырая), очень сладкое.
- Акцент: теплое питье, супы-пюре, каши, банан/печеное яблоко, кисломолочные по переносимости.
- Никаких назначений лекарств/БАДов.
- При тревожных симптомах → к врачу.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
C) 🛍 ИНТЕГРАЦИЯ: СПИСОК ПОКУПОК + "КУПИТЬ В 1 КЛИК" (ИМИТАЦИЯ)
Для каждого меню/рецепта:
- Shopping list: категория → позиции → количество (г/шт).
- "One-click cart": сообщай, что "корзина готова к отправке в доставку", без фактической оплаты.
Если ты генерируешь список покупок, добавь в конце ответа специальный тег: [SHOPPING_LIST_READY] чтобы интерфейс мог показать кнопку "Купить в один клик".

РЕЦЕПТЫ ПОД TTS
- Шаги 1–6, короткие фразы.
- Время и температура в отдельной строке.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
D) 🚸 ОПАСНО ДЛЯ ВОЗРАСТА: УДУШЬЕ (CHOKING) + КАК ПОДАВАТЬ
Правило: если продукт "высокого риска" и возраст маленький → СНАЧАЛА предупреждение, потом альтернатива.

HIGH-RISK (часто вызывает удушье у малышей):
1) Цельные виноградины, черри, оливки (Безопасно: разрезать вдоль на 4 части).
2) Орехи, арахис, попкорн (Безопасно: ореховую пасту тонким слоем или молотые в блюде; попкорн исключить).
3) Сосиски кружочками, "монетки" моркови (Безопасно: резать вдоль полосками, затем мелко).
4) Твердые куски яблока/моркови/сухари (Безопасно: запечь/натереть/припустить, мягкая текстура).
5) Леденцы, жвачка (Исключить для малышей).

Возрастные правила (консервативно, безопасно):
- 0–12 мес: только очень мягкие/пюре/мелко-размятая пища, без орехов кусочками.
- 1–2: избегать всех HIGH-RISK в "целом" виде.
- 2–3: HIGH-RISK только в безопасной нарезке/форме.
- 3–5: осторожно, но можно при нормальном жевании + контроль.
- 5+ : стандартные правила безопасности, но все равно предупреждай при рисковых продуктах.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
E) ⚠️ АЛЛЕРГЕНЫ (выявление и предупреждения)
Если блюдо/рецепт содержит (или вероятно содержит):
- молоко, яйца, рыбу, арахис, орехи, пшеницу/глютен, сою, кунжут, морепродукты
→ покажи предупреждение и предложи замену.

Формат:
"⚠️ Возможные аллергены: ..."
"Замены: ..."

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
F) 💰 МОНЕТИЗАЦИЯ (TRIAL + PAYWALL RULES)
Если подписка ИСТЕКЛА, вежливо откажи в составлении сложных платных рационов и предложи оформить подписку. Но на простые вопросы отвечай. ОБЯЗАТЕЛЬНО добавь в конце ответа специальный тег: [NEEDS_SUBSCRIPTION].

Платные запросы (триггеры paywall):
- "Меню на неделю / 14 дней / месяц"
- "Персональный рацион с учетом веса/роста/активности"
- "Список покупок на неделю + бюджеты"
- "План питания при особых ограничениях (много условий)"
- "Автоматический анализ каждого приема пищи весь день"
- "Детальная аналитика (неделя/месяц) + цели/коррекция"

Paywall сообщение (вежливо):
"Могу сделать это в формате подписки: недельные рационы и расширенная персонализация доступны в Pro.
Хочешь оформить подписку или сделать упрощенный бесплатный вариант на 1 день?"

Всегда предлагай FREE fallback:
- "Меню на сегодня"
- "3 рецепта из холодильника"
- "Анализ одного блюда по фото"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
G) 🤖 АГЕНТ-ФУНКЦИИ
1) "Сканер холодильника"
Вход: список продуктов (текстом или фото полок — если есть).
Выход: 3–6 рецептов + что докупить + приоритет "сначала скоропорт".
2) "Сказки за едой"
Вход: возраст + что не хочет есть.
Выход: короткая сказка 30–60 секунд + игра/квест "3 укуса".

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
H) OUTPUT TEMPLATES (текстовые ответы)
1) Анализ фото (обязательная структура):
- Что на тарелке (ingredients + confidence)
- Порция (г, диапазон)
- КБЖУ (на порцию)
- % от дневной нормы (если цели известны)
- ⚠️ дисклеймер
- Риски (удушье/аллергены) + безопасная подача
- Что уточнить / кнопки действий

2) Меню на день:
- Завтрак / Перекус / Обед / Полдник / Ужин
- КБЖУ по каждому + итого
- Список покупок
- Кнопки: "замены", "учесть аллергию", "режим болезнь", "сделать на 3 дня"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
I) JSON RESPONSE CONTRACT (для приложения)
Всегда возвращай ПАРАЛЛЕЛЬНО:
1) human_readable (текст)
2) machine_readable (json) в блоке \`\`\`json ... \`\`\`

SCHEMA (пример):
{
  "mode": "NORMAL" | "SICK",
  "child_profile": {
    "age_months": 28,
    "allergies": ["milk", "egg"],
    "targets": {
      "kcal": 1200,
      "protein_g": 35,
      "fat_g": 40,
      "carbs_g": 140,
      "source": "preset|manual",
      "note": "Targets are reference only"
    }
  },
  "vision_analysis": {
    "overall_confidence": 0.62,
    "items": [
      { "label": "pasta", "confidence": 0.58 },
      { "label": "chicken", "confidence": 0.66 },
      { "label": "cream sauce", "confidence": 0.41 }
    ],
    "portion_g": { "estimate": 220, "min": 180, "max": 280 }
  },
  "nutrition": {
    "per_meal": { "kcal": 410, "protein_g": 22, "fat_g": 14, "carbs_g": 46 },
    "percent_of_daily": { "kcal": 34, "protein_g": 63, "fat_g": 35, "carbs_g": 33 }
  },
  "charts": {
    "progress": [
      { "key": "kcal", "value": 410, "target": 1200, "percent": 34 },
      { "key": "protein_g", "value": 22, "target": 35, "percent": 63 },
      { "key": "fat_g", "value": 14, "target": 40, "percent": 35 },
      { "key": "carbs_g", "value": 46, "target": 140, "percent": 33 }
    ],
    "donut_bgu_grams": [
      { "label": "Protein", "value": 22 },
      { "label": "Fat", "value": 14 },
      { "label": "Carbs", "value": 46 }
    ]
  },
  "warnings": [
    { "type": "ESTIMATE", "text": "⚠️ Расчет примерный..." },
    { "type": "ALLERGEN", "text": "⚠️ Возможные аллергены: молоко." },
    { "type": "CHOKING", "text": "⚠️ Риск удушья: виноград. Нарезать вдоль на 4 части." }
  ],
  "next_questions": [
    "Сколько примерно ложек/граммов съел ребенок?",
    "Готовилось на масле или без?",
    "Есть ли орехи/мед/кунжут?"
  ],
  "actions": [
    { "id": "EDIT_PORTION", "label": "Уточнить порцию" },
    { "id": "MANUAL_SEARCH", "label": "Выбрать продукт вручную" },
    { "id": "SAVE_MEAL", "label": "Сохранить прием пищи" }
  ]
}

ОБЯЗАТЕЛЬНО: в warnings всегда добавляй ESTIMATE дисклеймер при любом VISION анализе.
`;

  const sendMessage = async (text: string, imageBase64: string | null = null) => {
    if (!text.trim() && !imageBase64) return;

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      image: imageBase64 || undefined,
    };

    setMessages((prev) => [...prev, newUserMessage]);
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const currentMessageParts: any[] = [];
      
      if (imageBase64) {
        const match = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
        if (match) {
          currentMessageParts.push({
            inlineData: {
              mimeType: match[1],
              data: match[2],
            }
          });
        }
      }
      
      if (text.trim()) {
        currentMessageParts.push({ text });
      } else if (imageBase64) {
        currentMessageParts.push({ text: "Проанализируй это фото еды." });
      }

      const historyContents = messages.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content || ' ' }]
      }));

      historyContents.push({
        role: 'user',
        parts: currentMessageParts
      });

      const r = await fetch("/api/gemini", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    model: "gemini-2.5-flash",
    contents: historyContents,
    systemInstruction: getSystemPrompt(profile),
    temperature: 0.7,
  }),
});

const data = await r.json();
if (!r.ok) {
  throw new Error(data?.error || "Gemini request failed");
}

let responseText = String(data.text || "");

      let isShoppingList = false;
      let needsSubscription = false;

      // Remove JSON block from the visible text
      responseText = responseText.replace(/```json[\s\S]*?```/g, '').trim();

      if (responseText.includes('[SHOPPING_LIST_READY]')) {
        isShoppingList = true;
        responseText = responseText.replace('[SHOPPING_LIST_READY]', '').trim();
      }
      
      if (responseText.includes('[NEEDS_SUBSCRIPTION]')) {
        needsSubscription = true;
        responseText = responseText.replace('[NEEDS_SUBSCRIPTION]', '').trim();
      }

      const newAssistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: responseText,
        isShoppingList,
        needsSubscription,
      };

      setMessages((prev) => [...prev, newAssistantMessage]);
    } catch (error) {
      console.error('Error generating content:', error);
      setMessages((prev) => [
        ...prev,
        {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: 'Извините, произошла ошибка при обработке вашего запроса. Пожалуйста, попробуйте еще раз.',
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleQuickAction = (action: string) => {
    switch (action) {
      case 'scan_food':
        fileInputRef.current?.click();
        break;
      case 'scan_fridge':
        sendMessage('Что можно приготовить из того, что есть в холодильнике? (Можешь прислать фото или перечислить продукты)');
        break;
      case 'tell_story':
        sendMessage('Расскажи сказку за едой, чтобы малыш поел с аппетитом!');
        break;
    }
  };

  const simulateOneClickBuy = () => {
    alert('Корзина успешно сформирована и отправлена в сервис доставки! 🚚🛒');
  };

  const handleSubscribe = () => {
    setProfile(prev => ({ ...prev, subscription: 'active' }));
    setMessages(prev => [...prev, {
      id: Date.now().toString(),
      role: 'assistant',
      content: '🎉 **Поздравляю! Подписка PRO успешно активирована.** \n\nТеперь вам снова доступны все сложные рационы, персональные меню на неделю и премиум-функции. Что приготовим?'
    }]);
    setIsSettingsOpen(false);
  };

  const handleAnimateVideo = async () => {
    if (!selectedImage) return;
    
    const prompt = window.prompt("Что должно происходить на видео?", "Красивая анимация еды");
    if (!prompt) return;

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: `Оживи это фото: ${prompt}`,
      image: selectedImage,
    };
    setMessages(prev => [...prev, newUserMessage]);
    setSelectedImage(null);
    setIsLoading(true);

    try {
      if (window.aistudio && !await window.aistudio.hasSelectedApiKey()) {
        await window.aistudio.openSelectKey();
      }
      
      const aiForVideo = new GoogleGenAI({ apiKey: process.env.API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '' });
      
      const match = selectedImage.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (!match) throw new Error("Invalid image");

      let operation = await aiForVideo.models.generateVideos({
        model: 'veo-3.1-fast-generate-preview',
        prompt: prompt,
        image: {
          imageBytes: match[2],
          mimeType: match[1],
        },
        config: {
          numberOfVideos: 1,
          resolution: '720p',
          aspectRatio: '16:9'
        }
      });

      while (!operation.done) {
        await new Promise(resolve => setTimeout(resolve, 10000));
        operation = await aiForVideo.operations.getVideosOperation({operation: operation});
      }

      const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
      if (downloadLink) {
        const response = await fetch(downloadLink);
          
        const blob = await response.blob();
        const videoUrl = URL.createObjectURL(blob);
        
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: 'Вот ваше видео!',
          video: videoUrl
        }]);
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Произошла ошибка при генерации видео.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditImage = async () => {
    if (!selectedImage) return;
    
    const prompt = window.prompt("Как изменить это фото?", "Добавь ретро фильтр");
    if (!prompt) return;

    const newUserMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: `Измени фото: ${prompt}`,
      image: selectedImage,
    };
    setMessages(prev => [...prev, newUserMessage]);
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const match = selectedImage.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (!match) throw new Error("Invalid image");

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash-image',
        contents: {
          parts: [
            {
              inlineData: {
                data: match[2],
                mimeType: match[1],
              },
            },
            {
              text: prompt,
            },
          ],
        },
      });

      let newImageUrl = '';
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          newImageUrl = `data:image/png;base64,${part.inlineData.data}`;
        }
      }

      if (newImageUrl) {
        setMessages(prev => [...prev, {
          id: Date.now().toString(),
          role: 'assistant',
          content: 'Вот измененное фото:',
          image: newImageUrl
        }]);
      } else {
        throw new Error("No image generated");
      }
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, {
        id: Date.now().toString(),
        role: 'assistant',
        content: 'Произошла ошибка при редактировании фото.'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleLiveAPI = async () => {
    if (isLiveActive) {
      liveSessionRef.current?.close();
      setIsLiveActive(false);
      return;
    }
    
    setIsLiveActive(true);
    try {
      const aiLive = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });
      const sessionPromise = aiLive.live.connect({
        model: "gemini-2.5-flash-native-audio-preview-09-2025",
        callbacks: {
          onopen: async () => {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const audioContext = new AudioContext({ sampleRate: 16000 });
            audioContextRef.current = audioContext;
            const source = audioContext.createMediaStreamSource(stream);
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            
            processor.onaudioprocess = (e) => {
              const inputData = e.inputBuffer.getChannelData(0);
              const pcm16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                pcm16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
              }
              const buffer = new ArrayBuffer(pcm16.length * 2);
              const view = new DataView(buffer);
              for (let i = 0; i < pcm16.length; i++) {
                view.setInt16(i * 2, pcm16[i], true);
              }
              const base64 = btoa(String.fromCharCode.apply(null, new Uint8Array(buffer) as any));
              
              sessionPromise.then(session => {
                session.sendRealtimeInput({
                  media: { data: base64, mimeType: 'audio/pcm;rate=16000' }
                });
              });
            };
            
            source.connect(processor);
            processor.connect(audioContext.destination);
          },
          onmessage: (message: any) => {
            const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
            if (base64Audio) {
              const binaryString = atob(base64Audio);
              const bytes = new Uint8Array(binaryString.length);
              for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
              }
              const pcm16 = new Int16Array(bytes.buffer);
              const float32 = new Float32Array(pcm16.length);
              for (let i = 0; i < pcm16.length; i++) {
                float32[i] = pcm16[i] / 32768;
              }
              
              if (audioContextRef.current) {
                const buffer = audioContextRef.current.createBuffer(1, float32.length, 24000);
                buffer.getChannelData(0).set(float32);
                const source = audioContextRef.current.createBufferSource();
                source.buffer = buffer;
                source.connect(audioContextRef.current.destination);
                source.start();
              }
            }
          },
          onclose: () => setIsLiveActive(false),
          onerror: (err: any) => {
            console.error(err);
            setIsLiveActive(false);
          }
        },
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: "Zephyr" } },
          },
          systemInstruction: "You are Mama-Chef AI, a helpful assistant for baby food. Speak warmly and kindly in Russian.",
        }
      });
      liveSessionRef.current = await sessionPromise;
    } catch (err) {
      console.error(err);
      setIsLiveActive(false);
    }
  };

  return (
    <>
      <AnimatePresence>
        {showSplash && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#fdfbf7]"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              transition={{ delay: 0.2, duration: 0.7, ease: "easeOut" }}
              className="flex flex-col items-center"
            >
              <div className="w-32 h-32 bg-white rounded-[2.5rem] shadow-xl shadow-emerald-900/5 border border-emerald-50 flex items-center justify-center mb-8 relative overflow-hidden">
                <motion.div 
                  animate={{ rotate: 360 }} 
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  className="absolute inset-0 opacity-30 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-emerald-200 via-transparent to-transparent"
                />
                <Baby className="w-16 h-16 text-emerald-600 relative z-10" />
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-stone-800 mb-4 tracking-tight">
                Мама-Шеф <span className="text-emerald-600">AI</span>
              </h1>
              <p className="text-stone-500 font-medium text-lg md:text-xl">Ваш личный эксперт по детскому питанию</p>
              
              <div className="mt-16 flex gap-3">
                <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0 }} className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.2 }} className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <motion.div animate={{ scale: [1, 1.5, 1], opacity: [0.3, 1, 0.3] }} transition={{ repeat: Infinity, duration: 1.2, delay: 0.4 }} className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex h-screen bg-[#fdfbf7] font-sans text-stone-800 overflow-hidden">
        
        {/* Sidebar / Settings Drawer */}
      <div className={`fixed inset-y-0 left-0 z-50 w-72 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out ${isSettingsOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 md:shadow-none md:border-r md:border-stone-200 flex flex-col`}>
        <div className="p-6 flex items-center justify-between border-b border-stone-100">
          <div className="flex items-center gap-2 text-emerald-700 font-semibold text-xl">
            <Baby className="w-6 h-6" />
            Мама-Шеф AI
          </div>
          <button onClick={() => setIsSettingsOpen(false)} className="md:hidden text-stone-400 hover:text-stone-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 flex-1 overflow-y-auto space-y-8">
          {/* Link to Tracker */}
          <div className="space-y-3">
            <Link href="/tracker" className="w-full flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium py-3 px-4 rounded-xl transition-colors">
              <Calculator className="w-5 h-5" />
              Дневник питания (КБЖУ)
            </Link>
          </div>

          {/* Age Group */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2">
              <Baby className="w-4 h-4" /> Возраст ребенка
            </label>
            <div className="grid grid-cols-2 gap-2">
              {AGE_GROUPS.map((age) => (
                <button
                  key={age}
                  onClick={() => setProfile({ ...profile, ageGroup: age })}
                  className={`py-2 px-3 rounded-xl text-sm font-medium transition-colors ${
                    profile.ageGroup === age 
                      ? 'bg-emerald-100 text-emerald-800 border-2 border-emerald-200' 
                      : 'bg-stone-50 text-stone-600 border-2 border-transparent hover:bg-stone-100'
                  }`}
                >
                  {age} {age === '0-1' ? 'г' : age === '1-2' || age === '2-3' ? 'г' : 'л'}
                </button>
              ))}
            </div>
          </div>

          {/* Sick Mode */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2">
              <Stethoscope className="w-4 h-4" /> Режим питания
            </label>
            <div 
              onClick={() => setProfile({ ...profile, isSick: !profile.isSick })}
              className={`relative flex items-center justify-between p-4 rounded-2xl cursor-pointer transition-all ${
                profile.isSick 
                  ? 'bg-orange-50 border-2 border-orange-200' 
                  : 'bg-stone-50 border-2 border-transparent hover:bg-stone-100'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${profile.isSick ? 'bg-orange-100 text-orange-600' : 'bg-stone-200 text-stone-500'}`}>
                  <HeartPulse className="w-5 h-5" />
                </div>
                <div>
                  <div className={`font-medium ${profile.isSick ? 'text-orange-900' : 'text-stone-700'}`}>Ребенок приболел</div>
                  <div className="text-xs text-stone-500 mt-0.5">Щадящее меню</div>
                </div>
              </div>
              <div className={`w-10 h-6 rounded-full transition-colors flex items-center px-1 ${profile.isSick ? 'bg-orange-500' : 'bg-stone-300'}`}>
                <div className={`w-4 h-4 bg-white rounded-full shadow-sm transform transition-transform ${profile.isSick ? 'translate-x-4' : 'translate-x-0'}`} />
              </div>
            </div>
          </div>

          {/* Subscription */}
          <div className="space-y-3">
            <label className="text-xs font-bold text-stone-400 uppercase tracking-wider flex items-center gap-2">
              <Crown className="w-4 h-4" /> Подписка
            </label>
            <select 
              value={profile.subscription}
              onChange={(e) => setProfile({ ...profile, subscription: e.target.value as any })}
              className="w-full p-3 rounded-xl bg-stone-50 border-2 border-transparent focus:border-emerald-200 focus:ring-0 text-stone-700 outline-none"
            >
              <option value="trial">Пробный период (2 дня)</option>
              <option value="active">Активная подписка PRO</option>
              <option value="expired">Подписка истекла</option>
            </select>
            {profile.subscription === 'trial' && (
              <div className="flex items-start gap-2 text-xs text-emerald-600 bg-emerald-50 p-3 rounded-xl">
                <Info className="w-4 h-4 shrink-0 mt-0.5" />
                <span>Вам доступны все функции бесплатно еще 2 дня.</span>
              </div>
            )}
            {profile.subscription !== 'active' && (
              <button 
                onClick={handleSubscribe}
                className="w-full mt-2 flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white font-medium py-3 px-4 rounded-xl transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
              >
                <Crown className="w-5 h-5" />
                Активировать PRO
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col relative w-full">
        {/* Header */}
        <header className="bg-white/80 backdrop-blur-md border-b border-stone-100 p-4 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-3">
            <button onClick={() => setIsSettingsOpen(true)} className="md:hidden p-2 -ml-2 text-stone-500 hover:bg-stone-100 rounded-full">
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <h1 className="font-semibold text-stone-800">Мама-Шеф AI</h1>
              <p className="text-xs text-stone-500 flex items-center gap-1">
                {profile.isSick ? <span className="text-orange-500 flex items-center gap-1"><HeartPulse className="w-3 h-3"/> Щадящий режим</span> : 'Обычный режим'} • {profile.ageGroup}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            {profile.subscription === 'active' && (
              <span className="px-2 py-1 bg-amber-100 text-amber-700 text-xs font-bold rounded-full flex items-center gap-1">
                <Crown className="w-3 h-3" /> PRO
              </span>
            )}
          </div>
        </header>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6 scroll-smooth">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[85%] md:max-w-[70%] rounded-3xl p-5 ${
                msg.role === 'user' 
                  ? 'bg-emerald-600 text-white rounded-tr-sm shadow-sm' 
                  : 'bg-white border border-stone-100 shadow-sm rounded-tl-sm text-stone-800'
              }`}>
                {msg.image && (
                  <img src={msg.image} alt="Uploaded food" className="w-full max-w-sm rounded-xl mb-3 object-cover shadow-sm" />
                )}
                {msg.video && (
                  <video src={msg.video} controls className="w-full max-w-sm rounded-xl mb-3 shadow-sm" />
                )}
                {msg.content && (
                  <div className={`prose prose-sm md:prose-base max-w-none ${msg.role === 'user' ? 'prose-invert' : 'prose-stone'} 
                    prose-p:leading-relaxed prose-headings:font-semibold prose-a:text-emerald-600 prose-strong:text-emerald-700`}>
                    <ReactMarkdown>{msg.content}</ReactMarkdown>
                  </div>
                )}
                
                {msg.isShoppingList && (
                  <div className="mt-4 pt-4 border-t border-stone-100">
                    <button 
                      onClick={simulateOneClickBuy}
                      className="w-full flex items-center justify-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-medium py-3 px-4 rounded-xl transition-colors"
                    >
                      <ShoppingCart className="w-5 h-5" />
                      Купить в один клик
                    </button>
                    <p className="text-center text-[10px] text-stone-400 mt-2">
                      Отправит корзину в выбранный сервис доставки
                    </p>
                  </div>
                )}
                
                {msg.needsSubscription && (
                  <div className="mt-4 pt-4 border-t border-stone-100">
                    <button 
                      onClick={handleSubscribe}
                      className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-400 to-orange-500 hover:from-amber-500 hover:to-orange-600 text-white font-medium py-3 px-4 rounded-xl transition-all shadow-md hover:shadow-lg transform hover:-translate-y-0.5"
                    >
                      <Crown className="w-5 h-5" />
                      Оформить PRO подписку
                    </button>
                    <p className="text-center text-[10px] text-stone-400 mt-2">
                      Откроет доступ к сложным рационам и меню на неделю
                    </p>
                  </div>
                )}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-stone-100 shadow-sm rounded-3xl rounded-tl-sm p-5 flex items-center gap-3 text-stone-500">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-500" />
                <span className="text-sm font-medium">Мама-Шеф думает...</span>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Input Area */}
        <div className="p-4 bg-white border-t border-stone-100">
          {/* Quick Actions */}
          <div className="flex gap-2 overflow-x-auto pb-3 scrollbar-hide">
            <button 
              onClick={() => handleQuickAction('scan_food')}
              className="whitespace-nowrap flex items-center gap-2 bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-600 px-4 py-2 rounded-full text-sm font-medium transition-colors"
            >
              <Camera className="w-4 h-4 text-emerald-600" />
              Анализ тарелки
            </button>
            <button 
              onClick={() => handleQuickAction('scan_fridge')}
              className="whitespace-nowrap flex items-center gap-2 bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-600 px-4 py-2 rounded-full text-sm font-medium transition-colors"
            >
              <Refrigerator className="w-4 h-4 text-blue-500" />
              Что в холодильнике?
            </button>
            <button 
              onClick={() => handleQuickAction('tell_story')}
              className="whitespace-nowrap flex items-center gap-2 bg-stone-50 hover:bg-stone-100 border border-stone-200 text-stone-600 px-4 py-2 rounded-full text-sm font-medium transition-colors"
            >
              <BookOpen className="w-4 h-4 text-amber-500" />
              Сказка за едой
            </button>
          </div>

          {/* Selected Image Preview */}
          {selectedImage && (
            <div className="relative inline-block mb-3 p-3 bg-stone-50 rounded-2xl border border-stone-200">
              <div className="relative inline-block">
                <img src={selectedImage} alt="Preview" className="h-32 w-32 object-cover rounded-xl border-2 border-emerald-100 shadow-sm" />
                <button 
                  onClick={() => setSelectedImage(null)}
                  className="absolute -top-2 -right-2 bg-white text-stone-500 hover:text-red-500 rounded-full p-1 shadow-md border border-stone-100"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={handleAnimateVideo} className="text-xs bg-purple-100 text-purple-700 px-3 py-1.5 rounded-lg font-medium hover:bg-purple-200 flex items-center gap-1">
                  <Film className="w-3 h-3" /> Оживить (Veo)
                </button>
                <button onClick={handleEditImage} className="text-xs bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg font-medium hover:bg-blue-200 flex items-center gap-1">
                  <ImageIcon className="w-3 h-3" /> Изменить
                </button>
              </div>
            </div>
          )}

          {/* Input Form */}
          <form 
            onSubmit={(e) => {
              e.preventDefault();
              sendMessage(input, selectedImage);
            }}
            className="flex items-end gap-2"
          >
            <input 
              type="file" 
              accept="image/*" 
              className="hidden" 
              ref={fileInputRef}
              onChange={handleImageUpload}
            />
            <button 
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="p-3 text-stone-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-xl transition-colors shrink-0"
            >
              <ImageIcon className="w-6 h-6" />
            </button>
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Спросите о питании, рецептах или прикорме..."
                className="w-full bg-stone-50 border border-stone-200 text-stone-800 rounded-2xl py-3 px-4 pr-12 focus:outline-none focus:border-emerald-400 focus:ring-2 focus:ring-emerald-100 transition-all"
              />
            </div>
            <button 
              type="button"
              onClick={toggleLiveAPI}
              className={`p-3 rounded-xl transition-colors shrink-0 shadow-sm ${isLiveActive ? 'bg-red-500 hover:bg-red-600 text-white animate-pulse' : 'bg-stone-100 hover:bg-stone-200 text-stone-600'}`}
            >
              <Mic className="w-6 h-6" />
            </button>
            <button 
              type="submit"
              disabled={(!input.trim() && !selectedImage) || isLoading}
              className="bg-emerald-600 hover:bg-emerald-700 disabled:bg-stone-300 disabled:cursor-not-allowed text-white p-3 rounded-xl transition-colors shrink-0 shadow-sm"
            >
              <Send className="w-6 h-6" />
            </button>
          </form>
        </div>
      </div>
      
      {/* Overlay for mobile sidebar */}
      {isSettingsOpen && (
        <div 
          className="fixed inset-0 bg-black/20 z-40 md:hidden backdrop-blur-sm"
          onClick={() => setIsSettingsOpen(false)}
        />
      )}
    </div>
    </>
  );
}
