use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { AnimatePresence, motion } from 'motion/react';
import {
  Baby,
  BookOpen,
  Camera,
  Crown,
  Info,
  Loader2,
  Send,
  Settings,
  ShoppingCart,
  Stethoscope,
  X
} from 'lucide-react';

type Role = 'user' | 'assistant';

type Message = {
  id: string;
  role: Role;
  content: string;
  image?: string; // data URL
  isShoppingList?: boolean;
  needsSubscription?: boolean;
};

type Profile = {
  ageGroup: '0-1' | '1-2' | '2-3' | '3-5' | '5-7' | '7-10';
  isSick: boolean;
  subscription: 'trial' | 'active' | 'expired';
};

const AGE_GROUPS: Profile['ageGroup'][] = ['0-1', '1-2', '2-3', '3-5', '5-7', '7-10'];

function uid() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dataUrlToInlineData(dataUrl: string) {
  const m = dataUrl.match(/^data:(.+);base64,(.+)$/);
  if (!m) return null;
  return { mimeType: m[1], data: m[2] };
}

function stripShoppingTag(text: string) {
  const tag = '[SHOPPING_LIST_READY]';
  const has = text.includes(tag);
  return { text: text.replaceAll(tag, '').trim(), has };
}

export default function MamaChefApp() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: uid(),
      role: 'assistant',
      content:
        'Привет! Я **Мама-Шеф AI** 👩‍🍳 — эксперт по детскому питанию.\n\n' +
        'Могу:\n' +
        '• подсказать безопасные рецепты по возрасту\n' +
        '• составить меню и список покупок\n' +
        '• оценить еду по фото (примерно, с дисклеймером)\n\n' +
        'Напиши, что нужно (возраст ребёнка + цель), или прикрепи фото.'
    }
  ]);

  const [input, setInput] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  const [profile, setProfile] = useState<Profile>({
    ageGroup: '1-2',
    isSick: false,
    subscription: 'trial'
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSend = useMemo(() => {
    return !isLoading && (input.trim().length > 0 || !!selectedImage);
  }, [isLoading, input, selectedImage]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  useEffect(() => {
    const timer = setTimeout(() => setShowSplash(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  const getSystemPrompt = (p: Profile) => `
ТЫ — "Мама-Шеф AI": экспертный ассистент по детскому питанию.
Пиши по-русски, коротко и по делу, с шагами.

ПРОФИЛЬ РЕБЕНКА:
- Возраст: ${p.ageGroup} лет
- Состояние: ${p.isSick ? '🤒 Ребенок приболел (щадящее меню)' : '😊 Здоров'}
- Подписка: ${p.subscription}

ВАЖНО (SAFETY):
- Ты не врач и не ставишь диагнозы.
- При тревожных симптомах (высокая температура, обезвоживание, затруднение дыхания, сыпь с отёком, кровь в стуле/рвоте, судороги, выраженная вялость) — совет: обратиться к педиатру/неотложке.
- Любые расчёты по фото — приблизительные. Всегда добавляй дисклеймер.
- Риски удушья и аллергены — приоритет №1.
- Для "списка покупок" в конце добавь тег [SHOPPING_LIST_READY].
`.trim();

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setSelectedImage(String(reader.result));
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsDataURL(file);
  };

  const removeImage = () => setSelectedImage(null);

  async function callGemini(params: {
    contents: any[];
    systemInstruction: string;
    temperature?: number;
    model?: string;
  }) {
    const r = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: params.model ?? 'gemini-2.5-flash',
        contents: params.contents,
        systemInstruction: params.systemInstruction,
        temperature: typeof params.temperature === 'number' ? params.temperature : 0.6
      })
    });

    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      throw new Error(data?.error || data?.details || 'Gemini request failed');
    }
    return String(data?.text ?? '');
  }

  const handleSend = async () => {
    if (!canSend) return;

    const text = input.trim();
    const img = selectedImage;

    const userMsg: Message = {
      id: uid(),
      role: 'user',
      content: text.length ? text : img ? 'Опиши это фото: что это за еда и безопасно ли для ребёнка?' : '',
      image: img ?? undefined
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setSelectedImage(null);
    setIsLoading(true);

    try {
      const history = [...messages, userMsg].slice(-12);
      const contents = history.map((m) => {
        const parts: any[] = [];

        if (m.content?.trim()) parts.push({ text: m.content.trim() });

        if (m.image) {
          const inline = dataUrlToInlineData(m.image);
          if (inline) parts.push({ inlineData: inline });
        }

        return {
          role: m.role === 'assistant' ? 'model' : 'user',
          parts
        };
      });

      const raw = await callGemini({
        contents,
        systemInstruction: getSystemPrompt(profile),
        temperature: 0.6,
        model: 'gemini-2.5-flash'
      });

      const { text: cleaned, has } = stripShoppingTag(raw);

      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          content: cleaned || 'Пустой ответ. Попробуй уточнить запрос.',
          isShoppingList: has
        }
      ]);
    } catch (err: any) {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          content: `Ошибка: ${String(err?.message ?? err)}`
        }
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleSettings = () => setIsSettingsOpen((s) => !s);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="min-h-screen bg-black text-white">
      <AnimatePresence>
        {showSplash && (
          <motion.div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/20">
                <Baby className="h-8 w-8 text-emerald-400" />
              </div>
              <div className="text-2xl font-semibold">Мама-Шеф AI</div>
              <div className="mt-2 text-sm text-white/60">детское питание • рецепты • безопасность</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mx-auto max-w-4xl px-4 py-6">
        <header className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20">
              <Crown className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <div className="text-lg font-semibold">Мама-Шеф AI</div>
              <div className="text-xs text-white/60">
                Профиль: {profile.ageGroup} • {profile.isSick ? 'приболел' : 'здоров'}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSettings}
              className="rounded-xl bg-white/10 p-2 hover:bg-white/15"
              aria-label="settings"
            >
              <Settings className="h-5 w-5" />
            </button>

            <a
              href="#"
              className="hidden rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/15 md:inline-flex"
            >
              <BookOpen className="mr-2 h-4 w-4" />
              Гайды
            </a>
          </div>
        </header>

        <div className="grid gap-4 md:grid-cols-[1fr_320px]">
          <div className="flex min-h-[70vh] flex-col rounded-2xl border border-white/10 bg-white/5">
            <div className="flex-1 overflow-y-auto p-4">
              {messages.map((m) => (
                <div key={m.id} className={`mb-3 flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                      m.role === 'user' ? 'bg-emerald-500/20' : 'bg-white/10'
                    }`}
                  >
                    {m.image && (
                      <img
                        src={m.image}
                        alt="upload"
                        className="mb-2 max-h-64 w-full rounded-xl object-cover"
                      />
                    )}
                    <ReactMarkdown>{m.content}</ReactMarkdown>

                    {m.isShoppingList && (
                      <div className="mt-3 flex items-center gap-2 rounded-xl bg-white/10 px-3 py-2">
                        <ShoppingCart className="h-4 w-4" />
                        <span className="text-xs text-white/80">Список покупок готов</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {isLoading && (
                <div className="mb-3 flex justify-start">
                  <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Думаю…
                    </span>
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            <div className="border-t border-white/10 p-3">
              {selectedImage && (
                <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-white/5 p-2">
                  <div className="flex items-center gap-2">
                    <img src={selectedImage} alt="selected" className="h-12 w-12 rounded-lg object-cover" />
                    <div className="text-xs text-white/70">Фото прикреплено</div>
                  </div>
                  <button
                    type="button"
                    onClick={removeImage}
                    className="rounded-lg bg-white/10 p-2 hover:bg-white/15"
                    aria-label="remove image"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              )}

              <div className="flex items-end gap-2">
                <button
                  type="button"
                  className="rounded-xl bg-white/10 p-3 hover:bg-white/15"
                  onClick={() => fileInputRef.current?.click()}
                  aria-label="upload image"
                  disabled={isLoading}
                >
                  <Camera className="h-5 w-5" />
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageUpload}
                  className="hidden"
                />

                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={onKeyDown}
                  placeholder="Напиши запрос… (Enter — отправить, Shift+Enter — новая строка)"
                  className="min-h-[44px] flex-1 resize-none rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-sm outline-none placeholder:text-white/40"
                  rows={1}
                />

                <button
                  type="button"
                  onClick={() => void handleSend()}
                  disabled={!canSend}
                  className="rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-medium hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <span className="inline-flex items-center gap-2">
                    <Send className="h-4 w-4" />
                    Отправить
                  </span>
                </button>
              </div>

              <div className="mt-2 flex items-center gap-2 text-xs text-white/50">
                <Info className="h-3.5 w-3.5" />
                Ключи не используются в браузере. Запросы идут через <code className="text-white/70">/api/gemini</code>.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="text-sm font-semibold">Настройки</div>
              <button
                type="button"
                className="rounded-xl bg-white/10 p-2 hover:bg-white/15 md:hidden"
                onClick={toggleSettings}
                aria-label="close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <div className="mb-2 text-xs text-white/60">Возраст</div>
                <div className="grid grid-cols-3 gap-2">
                  {AGE_GROUPS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() => setProfile((p) => ({ ...p, ageGroup: g }))}
                      className={`rounded-xl px-3 py-2 text-xs ${
                        profile.ageGroup === g ? 'bg-emerald-600' : 'bg-white/10 hover:bg-white/15'
                      }`}
                    >
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between rounded-xl bg-white/10 px-3 py-3">
                <div className="flex items-center gap-2 text-sm">
                  <Stethoscope className="h-4 w-4 text-emerald-300" />
                  Ребёнок приболел
                </div>
                <input
                  type="checkbox"
                  checked={profile.isSick}
                  onChange={(e) => setProfile((p) => ({ ...p, isSick: e.target.checked }))}
                />
              </div>

              <div className="rounded-xl bg-white/10 p-3 text-xs text-white/70">
                <div className="mb-2 font-medium text-white">Что можно спросить</div>
                <ul className="list-disc space-y-1 pl-4">
                  <li>«Составь меню на 3 дня для 2 лет»</li>
                  <li>«Что приготовить из: курица, брокколи, рис?»</li>
                  <li>«Оцени по фото, безопасно ли это для 1–2 лет»</li>
                  <li>«Список покупок на неделю»</li>
                </ul>
              </div>

              <div className="rounded-xl bg-white/10 p-3 text-xs text-white/70">
                <div className="mb-1 font-medium text-white">Ограничения</div>
                Это не медицинская консультация. При тревожных симптомах — к врачу.
              </div>
            </div>
          </div>
        </div>

        {isSettingsOpen && (
          <div
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm md:hidden"
            onClick={() => setIsSettingsOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
