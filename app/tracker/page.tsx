'use client';

import React, { useState, useRef, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';
import { 
  Camera, Plus, ChevronRight, Settings, History, 
  AlertCircle, CheckCircle2, Info, X, Image as ImageIcon,
  Utensils, Activity, Flame, Droplets, Wheat, Loader2
} from 'lucide-react';

type MealItem = {
  id: string;
  name: string;
  portionGrams: number;
  kcalPer100g: number;
  proteinPer100g: number;
  fatPer100g: number;
  carbsPer100g: number;
  confidence: 'low' | 'medium' | 'high';
  included: boolean;
};

type DailySummary = {
  kcal: number;
  protein: number;
  fat: number;
  carbs: number;
};

type SavedMeal = {
  id: string;
  date: string;
  time: string;
  items: MealItem[];
  summary: DailySummary;
  image?: string | null;
};

const CONFIDENCE_COLORS: Record<string, string> = {
  low: '#ef4444',
  medium: '#f59e0b',
  high: '#10b981'
};

const MACRO_COLORS = ['#10b981', '#3b82f6', '#f59e0b'];

export default function TrackerPage() {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedItems, setAnalyzedItems] = useState<MealItem[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [savedMeals, setSavedMeals] = useState<SavedMeal[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load saved meals from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('mamaChef_savedMeals');
      if (saved) setSavedMeals(JSON.parse(saved));
    } catch {}
  }, []);

  // Save meals to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('mamaChef_savedMeals', JSON.stringify(savedMeals));
    } catch {}
  }, [savedMeals]);

  const calculateItemNutrition = (item: MealItem) => {
    const factor = item.portionGrams / 100;
    return {
      kcal: item.kcalPer100g * factor,
      protein: item.proteinPer100g * factor,
      fat: item.fatPer100g * factor,
      carbs: item.carbsPer100g * factor
    };
  };

  const calculateDailySummary = (items: MealItem[]): DailySummary => {
    const includedItems = items.filter(item => item.included);
    return includedItems.reduce(
      (total, item) => {
        const nutrition = calculateItemNutrition(item);
        return {
          kcal: total.kcal + nutrition.kcal,
          protein: total.protein + nutrition.protein,
          fat: total.fat + nutrition.fat,
          carbs: total.carbs + nutrition.carbs
        };
      },
      { kcal: 0, protein: 0, fat: 0, carbs: 0 }
    );
  };

  const handleImageSelect = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSelectedImage(reader.result as string);
        analyzeFood(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const analyzeFood = async (imageBase64: string) => {
    setIsAnalyzing(true);
    try {
      const match = imageBase64.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (!match) throw new Error("Invalid image");

      const r = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemini-2.5-flash',
          contents: [
            {
              role: 'user',
              parts: [
                { inlineData: { mimeType: match[1], data: match[2] } },
                { text: 'Проанализируй эту еду. Верни СТРОГО JSON без markdown и без пояснений: {"items":[{"name":string,"portionGrams":number,"kcalPer100g":number,"proteinPer100g":number,"fatPer100g":number,"carbsPer100g":number,"confidence":"low"|"medium"|"high"}]}. Если не уверен — confidence="low".' }
              ]
            }
          ],
          systemInstruction: 'Ты эксперт по КБЖУ. Отвечай строго JSON как в инструкции. Никаких ``` и никакого текста вне JSON.',
          temperature: 0.2
        })
      });

      const dataRaw = await r.json().catch(() => ({} as any));
      if (!r.ok) throw new Error(dataRaw?.error || dataRaw?.details || 'Gemini request failed');

      const rawText = String(dataRaw?.text ?? '').trim();

      // Remove possible markdown fences just in case
      const jsonText = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      let data: any = { items: [] };
      try {
        data = JSON.parse(jsonText || '{"items":[]}');
      } catch {
        data = { items: [] };
      }

      const items: MealItem[] = (Array.isArray(data?.items) ? data.items : []).map((item: any) => ({
        ...item,
        id: Math.random().toString(36).substr(2, 9),
        included: true
      }));
      
      setAnalyzedItems(items);
      setShowResults(true);
    } catch (error) {
      console.error("Error analyzing food:", error);
      alert("Не удалось распознать еду. Попробуйте еще раз.");
      setSelectedImage(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const updateItemPortion = (id: string, newPortion: number) => {
    setAnalyzedItems(prev => prev.map(item => 
      item.id === id ? { ...item, portionGrams: newPortion } : item
    ));
  };

  const toggleItemIncluded = (id: string) => {
    setAnalyzedItems(prev => prev.map(item => 
      item.id === id ? { ...item, included: !item.included } : item
    ));
  };

  const saveMealToHistory = () => {
    const now = new Date();
    const meal: SavedMeal = {
      id: Math.random().toString(36).substr(2, 9),
      date: now.toLocaleDateString('ru-RU'),
      time: now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }),
      items: analyzedItems,
      summary: calculateDailySummary(analyzedItems),
      image: selectedImage
    };

    setSavedMeals(prev => [meal, ...prev]);
    setShowResults(false);
    setSelectedImage(null);
    setAnalyzedItems([]);
    alert("Прием пищи сохранен в дневник!");
  };

  const deleteMeal = (id: string) => {
    if (confirm("Удалить этот прием пищи?")) {
      setSavedMeals(prev => prev.filter(meal => meal.id !== id));
    }
  };

  const macroData = () => {
    const summary = calculateDailySummary(analyzedItems);
    const totalMacros = summary.protein + summary.fat + summary.carbs;
    if (totalMacros === 0) return [];
    
    return [
      { name: 'Белки', value: summary.protein, color: MACRO_COLORS[0] },
      { name: 'Жиры', value: summary.fat, color: MACRO_COLORS[1] },
      { name: 'Углеводы', value: summary.carbs, color: MACRO_COLORS[2] }
    ];
  };

  const summary = calculateDailySummary(analyzedItems);

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-6xl px-4 py-6">
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/20">
              <Utensils className="h-5 w-5 text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">Трекер питания</h1>
              <p className="text-xs text-white/60">Фото → распознавание → КБЖУ → дневник</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
              onClick={() => setShowHistory(true)}
            >
              <History className="mr-2 inline h-4 w-4" />
              История
            </button>
            <button
              className="rounded-xl bg-white/10 p-2 hover:bg-white/15"
              onClick={() => setShowSettings(true)}
              aria-label="settings"
            >
              <Settings className="h-5 w-5" />
            </button>
            <Link
              href="/"
              className="rounded-xl bg-white/10 px-3 py-2 text-sm hover:bg-white/15"
            >
              Назад
            </Link>
          </div>
        </div>

        {/* Main */}
        <div className="grid gap-6 lg:grid-cols-[1fr_420px]">
          {/* Left */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-semibold">Фото еды</div>
              <button
                className="rounded-xl bg-emerald-600 px-3 py-2 text-sm hover:bg-emerald-700"
                onClick={handleImageSelect}
                disabled={isAnalyzing}
              >
                <Camera className="mr-2 inline h-4 w-4" />
                Загрузить
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileChange}
                className="hidden"
              />
            </div>

            {selectedImage ? (
              <div className="relative overflow-hidden rounded-2xl border border-white/10">
                <img src={selectedImage} alt="food" className="h-[420px] w-full object-cover" />
                <button
                  className="absolute right-3 top-3 rounded-xl bg-black/60 p-2 hover:bg-black/70"
                  onClick={() => {
                    setSelectedImage(null);
                    setShowResults(false);
                    setAnalyzedItems([]);
                  }}
                  aria-label="remove"
                >
                  <X className="h-4 w-4" />
                </button>

                <AnimatePresence>
                  {isAnalyzing && (
                    <motion.div
                      className="absolute inset-0 flex items-center justify-center bg-black/60"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                    >
                      <div className="rounded-2xl bg-white/10 px-4 py-3 text-sm">
                        <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />
                        Анализируем…
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="flex h-[420px] items-center justify-center rounded-2xl border border-dashed border-white/15 bg-black/20">
                <div className="text-center text-white/60">
                  <ImageIcon className="mx-auto mb-3 h-8 w-8" />
                  Нажми “Загрузить” и выбери фото еды
                </div>
              </div>
            )}
          </div>

          {/* Right */}
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="mb-4 flex items-center justify-between">
              <div className="text-sm font-semibold">Результат</div>
              {showResults && (
                <button
                  className="rounded-xl bg-emerald-600 px-3 py-2 text-sm hover:bg-emerald-700"
                  onClick={saveMealToHistory}
                >
                  <Plus className="mr-2 inline h-4 w-4" />
                  Сохранить
                </button>
              )}
            </div>

            {!showResults ? (
              <div className="rounded-2xl bg-black/20 p-4 text-sm text-white/60">
                <Info className="mr-2 inline h-4 w-4" />
                После анализа появится список блюд и КБЖУ.
              </div>
            ) : (
              <div className="space-y-4">
                {/* Summary */}
                <div className="rounded-2xl bg-black/20 p-4">
                  <div className="mb-2 text-xs text-white/60">Сумма (выбранные позиции)</div>
                  <div className="text-2xl font-semibold">{Math.round(summary.kcal)} ккал</div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                    <div className="rounded-xl bg-white/5 p-2">
                      <div className="text-white/60">Белки</div>
                      <div className="font-medium">{summary.protein.toFixed(1)} г</div>
                    </div>
                    <div className="rounded-xl bg-white/5 p-2">
                      <div className="text-white/60">Жиры</div>
                      <div className="font-medium">{summary.fat.toFixed(1)} г</div>
                    </div>
                    <div className="rounded-xl bg-white/5 p-2">
                      <div className="text-white/60">Углеводы</div>
                      <div className="font-medium">{summary.carbs.toFixed(1)} г</div>
                    </div>
                  </div>

                  <div className="mt-4 h-40">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={macroData()}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={35}
                          outerRadius={65}
                          paddingAngle={4}
                        >
                          {macroData().map((entry, idx) => (
                            <Cell key={idx} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Items */}
                <div className="space-y-2">
                  {analyzedItems.map(item => (
                    <div key={item.id} className="rounded-2xl bg-black/20 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <button
                              className="mt-0.5"
                              onClick={() => toggleItemIncluded(item.id)}
                              aria-label="toggle"
                            >
                              {item.included ? (
                                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                              ) : (
                                <AlertCircle className="h-4 w-4 text-white/40" />
                              )}
                            </button>
                            <div className="truncate text-sm font-semibold">{item.name}</div>
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-xs text-white/60">
                            <span
                              className="inline-block h-2 w-2 rounded-full"
                              style={{ background: CONFIDENCE_COLORS[item.confidence] }}
                            />
                            Уверенность: {item.confidence}
                          </div>
                        </div>

                        <div className="text-right text-xs text-white/70">
                          <div>{Math.round(item.kcalPer100g)} ккал / 100г</div>
                          <div className="mt-1">Порция: {Math.round(item.portionGrams)} г</div>
                        </div>
                      </div>

                      <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                        <div className="rounded-xl bg-white/5 p-2">
                          <div className="text-white/60">Б</div>
                          <div className="font-medium">{item.proteinPer100g.toFixed(1)}</div>
                        </div>
                        <div className="rounded-xl bg-white/5 p-2">
                          <div className="text-white/60">Ж</div>
                          <div className="font-medium">{item.fatPer100g.toFixed(1)}</div>
                        </div>
                        <div className="rounded-xl bg-white/5 p-2">
                          <div className="text-white/60">У</div>
                          <div className="font-medium">{item.carbsPer100g.toFixed(1)}</div>
                        </div>
                        <div className="rounded-xl bg-white/5 p-2">
                          <div className="text-white/60">ккал</div>
                          <div className="font-medium">{item.kcalPer100g.toFixed(0)}</div>
                        </div>
                      </div>

                      <div className="mt-3">
                        <div className="mb-1 text-xs text-white/60">Вес порции (г)</div>
                        <input
                          type="range"
                          min={10}
                          max={600}
                          value={item.portionGrams}
                          onChange={(e) => updateItemPortion(item.id, Number(e.target.value))}
                          className="w-full"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="rounded-2xl bg-black/20 p-3 text-xs text-white/60">
                  <Info className="mr-2 inline h-4 w-4" />
                  Оценка по фото приблизительная. Для точности нужны граммовки и состав.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* History Modal */}
        <AnimatePresence>
          {showHistory && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowHistory(false)}
            >
              <motion.div
                className="max-h-[85vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-white/10 bg-black p-4"
                initial={{ scale: 0.98, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.98, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-4 flex items-center justify-between">
                  <div className="text-sm font-semibold">История</div>
                  <button
                    className="rounded-xl bg-white/10 p-2 hover:bg-white/15"
                    onClick={() => setShowHistory(false)}
                    aria-label="close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                {savedMeals.length === 0 ? (
                  <div className="rounded-2xl bg-white/5 p-4 text-sm text-white/60">
                    Пока нет сохранённых приёмов пищи.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {savedMeals.map(meal => (
                      <div key={meal.id} className="rounded-2xl bg-white/5 p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="text-sm font-semibold">
                              {meal.date} • {meal.time}
                            </div>
                            <div className="mt-1 text-xs text-white/60">
                              {Math.round(meal.summary.kcal)} ккал • Б {meal.summary.protein.toFixed(1)} • Ж {meal.summary.fat.toFixed(1)} • У {meal.summary.carbs.toFixed(1)}
                            </div>
                          </div>
                          <button
                            className="rounded-xl bg-white/10 p-2 hover:bg-white/15"
                            onClick={() => deleteMeal(meal.id)}
                            aria-label="delete"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>

                        {meal.image && (
                          <img
                            src={meal.image}
                            alt="meal"
                            className="mt-3 h-48 w-full rounded-2xl object-cover"
                          />
                        )}

                        <div className="mt-3 space-y-1 text-xs text-white/70">
                          {meal.items.filter(i => i.included).map(i => (
                            <div key={i.id} className="flex items-center justify-between">
                              <span className="truncate">{i.name}</span>
                              <span className="ml-2 whitespace-nowrap">{Math.round(i.portionGrams)} г</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Settings Modal (placeholder) */}
        <AnimatePresence>
          {showSettings && (
            <motion.div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowSettings(false)}
            >
              <motion.div
                className="w-full max-w-lg rounded-2xl border border-white/10 bg-black p-4"
                initial={{ scale: 0.98, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.98, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-sm font-semibold">Настройки</div>
                  <button
                    className="rounded-xl bg-white/10 p-2 hover:bg-white/15"
                    onClick={() => setShowSettings(false)}
                    aria-label="close"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="rounded-2xl bg-white/5 p-4 text-sm text-white/60">
                  Здесь можно добавить цели КБЖУ/профиль ребёнка.
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
