'use client';

import React, { useState, useRef, useEffect } from 'react';
import { GoogleGenAI, Type } from '@google/genai';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { motion, AnimatePresence } from 'motion/react';
import Link from 'next/link';
import { 
  Camera, Plus, ChevronRight, Settings, History, 
  AlertCircle, CheckCircle2, Info, X, Image as ImageIcon,
  Utensils, Activity, Flame, Droplets, Wheat, Loader2
} from 'lucide-react';

const ai = new GoogleGenAI({ apiKey: process.env.NEXT_PUBLIC_GEMINI_API_KEY });

type Profile = {
  name: string;
  age: number;
  targets: {
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
  };
};

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

type Meal = {
  id: string;
  timestamp: Date;
  image?: string;
  items: MealItem[];
  totals: {
    kcal: number;
    protein: number;
    fat: number;
    carbs: number;
  };
};

const DEFAULT_PROFILE: Profile = {
  name: 'Малыш',
  age: 5,
  targets: {
    kcal: 1400,
    protein: 40,
    fat: 50,
    carbs: 190,
  }
};

export default function KidsMenuApp() {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE);
  const [meals, setMeals] = useState<Meal[]>([]);
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzedItems, setAnalyzedItems] = useState<MealItem[]>([]);
  const [showResults, setShowResults] = useState(false);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Calculate daily totals
  const todayTotals = meals.reduce((acc, meal) => {
    acc.kcal += meal.totals.kcal;
    acc.protein += meal.totals.protein;
    acc.fat += meal.totals.fat;
    acc.carbs += meal.totals.carbs;
    return acc;
  }, { kcal: 0, protein: 0, fat: 0, carbs: 0 });

  const getPercent = (current: number, target: number) => Math.min(Math.round((current / target) * 100), 100);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
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

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { mimeType: match[1], data: match[2] } },
              { text: "Проанализируй эту еду. Определи блюда/ингредиенты, оцени примерный вес порции в граммах и КБЖУ на 100г. Оцени свою уверенность (low, medium, high)." }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING, description: "Название блюда на русском" },
                    portionGrams: { type: Type.NUMBER, description: "Примерный вес порции в граммах" },
                    kcalPer100g: { type: Type.NUMBER },
                    proteinPer100g: { type: Type.NUMBER },
                    fatPer100g: { type: Type.NUMBER },
                    carbsPer100g: { type: Type.NUMBER },
                    confidence: { type: Type.STRING, description: "low, medium, or high" }
                  },
                  required: ["name", "portionGrams", "kcalPer100g", "proteinPer100g", "fatPer100g", "carbsPer100g", "confidence"]
                }
              }
            },
            required: ["items"]
          }
        }
      });

      const data = JSON.parse(response.text || '{"items":[]}');
      const items: MealItem[] = data.items.map((item: any) => ({
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

  const saveMeal = () => {
    const activeItems = analyzedItems.filter(i => i.included);
    if (activeItems.length === 0) return;

    const totals = activeItems.reduce((acc, item) => {
      const factor = item.portionGrams / 100;
      acc.kcal += item.kcalPer100g * factor;
      acc.protein += item.proteinPer100g * factor;
      acc.fat += item.fatPer100g * factor;
      acc.carbs += item.carbsPer100g * factor;
      return acc;
    }, { kcal: 0, protein: 0, fat: 0, carbs: 0 });

    const newMeal: Meal = {
      id: Date.now().toString(),
      timestamp: new Date(),
      image: selectedImage || undefined,
      items: activeItems,
      totals: {
        kcal: Math.round(totals.kcal),
        protein: Math.round(totals.protein),
        fat: Math.round(totals.fat),
        carbs: Math.round(totals.carbs),
      }
    };

    setMeals(prev => [newMeal, ...prev]);
    setIsCaptureModalOpen(false);
    setSelectedImage(null);
    setShowResults(false);
    setAnalyzedItems([]);
  };

  const donutData = [
    { name: 'Белки', value: todayTotals.protein * 4, color: '#3b82f6' }, // 4 kcal per g
    { name: 'Жиры', value: todayTotals.fat * 9, color: '#f59e0b' },      // 9 kcal per g
    { name: 'Углеводы', value: todayTotals.carbs * 4, color: '#10b981' }, // 4 kcal per g
  ].filter(d => d.value > 0);

  // If no data, show empty gray donut
  if (donutData.length === 0) {
    donutData.push({ name: 'Пусто', value: 1, color: '#e5e7eb' });
  }

  return (
    <div className="min-h-screen bg-stone-50 font-sans text-stone-800 pb-24">
      {/* Header */}
      <header className="bg-white px-6 py-5 rounded-b-[2rem] shadow-sm mb-6 sticky top-0 z-10">
        <div className="flex justify-between items-center mb-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Link href="/" className="text-stone-400 hover:text-stone-600 bg-stone-100 p-1 rounded-full">
                <ChevronRight className="w-5 h-5 rotate-180" />
              </Link>
              <h1 className="text-2xl font-bold text-stone-800 tracking-tight">Kids Menu</h1>
            </div>
            <p className="text-sm text-stone-500 font-medium">Сегодня • {new Date().toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</p>
          </div>
          <button className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center text-stone-600 hover:bg-stone-200 transition-colors">
            <Settings className="w-5 h-5" />
          </button>
        </div>
        
        {/* Main Kcal Progress */}
        <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
          <div className="flex justify-between items-end mb-2">
            <div>
              <div className="text-xs font-bold text-emerald-600 uppercase tracking-wider mb-1 flex items-center gap-1">
                <Flame className="w-3 h-3" /> Калории
              </div>
              <div className="text-3xl font-black text-emerald-900 leading-none">
                {Math.round(todayTotals.kcal)} <span className="text-lg text-emerald-600 font-semibold">/ {profile.targets.kcal}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-2xl font-bold text-emerald-700">{getPercent(todayTotals.kcal, profile.targets.kcal)}%</div>
            </div>
          </div>
          <div className="h-3 bg-emerald-200/50 rounded-full overflow-hidden">
            <motion.div 
              initial={{ width: 0 }}
              animate={{ width: `${getPercent(todayTotals.kcal, profile.targets.kcal)}%` }}
              className="h-full bg-emerald-500 rounded-full"
            />
          </div>
        </div>
      </header>

      <main className="px-6 space-y-6">
        {/* Macros Dashboard */}
        <section className="bg-white rounded-3xl p-6 shadow-sm border border-stone-100">
          <h2 className="text-lg font-bold text-stone-800 mb-6 flex items-center gap-2">
            <Activity className="w-5 h-5 text-stone-400" />
            Баланс БЖУ
          </h2>
          
          <div className="flex items-center gap-6">
            <div className="w-32 h-32 shrink-0 relative">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={donutData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={60}
                    paddingAngle={2}
                    dataKey="value"
                    stroke="none"
                  >
                    {donutData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value: any) => Math.round(Number(value)) + ' ккал'} />
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex items-center justify-center flex-col">
                <span className="text-xs text-stone-400 font-medium uppercase tracking-wider">Ккал</span>
              </div>
            </div>
            
            <div className="flex-1 space-y-4">
              {/* Protein */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-semibold text-stone-700 flex items-center gap-1"><Droplets className="w-3 h-3 text-blue-500"/> Белки</span>
                  <span className="text-stone-500 font-medium">{Math.round(todayTotals.protein)} / {profile.targets.protein}г</span>
                </div>
                <div className="h-2 bg-blue-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${getPercent(todayTotals.protein, profile.targets.protein)}%` }}
                    className="h-full bg-blue-500 rounded-full"
                  />
                </div>
              </div>
              {/* Fat */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-semibold text-stone-700 flex items-center gap-1"><Droplets className="w-3 h-3 text-amber-500"/> Жиры</span>
                  <span className="text-stone-500 font-medium">{Math.round(todayTotals.fat)} / {profile.targets.fat}г</span>
                </div>
                <div className="h-2 bg-amber-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${getPercent(todayTotals.fat, profile.targets.fat)}%` }}
                    className="h-full bg-amber-500 rounded-full"
                  />
                </div>
              </div>
              {/* Carbs */}
              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span className="font-semibold text-stone-700 flex items-center gap-1"><Wheat className="w-3 h-3 text-emerald-500"/> Углеводы</span>
                  <span className="text-stone-500 font-medium">{Math.round(todayTotals.carbs)} / {profile.targets.carbs}г</span>
                </div>
                <div className="h-2 bg-emerald-100 rounded-full overflow-hidden">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${getPercent(todayTotals.carbs, profile.targets.carbs)}%` }}
                    className="h-full bg-emerald-500 rounded-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Timeline */}
        <section>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-bold text-stone-800 flex items-center gap-2">
              <History className="w-5 h-5 text-stone-400" />
              Дневник питания
            </h2>
            <span className="text-sm text-stone-500 font-medium">{meals.length} приемов</span>
          </div>
          
          {meals.length === 0 ? (
            <div className="bg-white rounded-3xl p-8 text-center border border-stone-100 border-dashed">
              <div className="w-16 h-16 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-4">
                <Utensils className="w-8 h-8 text-stone-300" />
              </div>
              <p className="text-stone-500 font-medium">Пока ничего не добавлено</p>
              <p className="text-sm text-stone-400 mt-1">Сфотографируйте еду, чтобы начать</p>
            </div>
          ) : (
            <div className="space-y-4">
              {meals.map(meal => (
                <div key={meal.id} className="bg-white rounded-3xl p-4 shadow-sm border border-stone-100 flex gap-4 items-center">
                  {meal.image ? (
                    <img src={meal.image} alt="Meal" className="w-16 h-16 rounded-2xl object-cover shrink-0 bg-stone-100" />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-stone-100 flex items-center justify-center shrink-0">
                      <Utensils className="w-6 h-6 text-stone-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-stone-400 font-medium mb-1">
                      {meal.timestamp.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div className="font-semibold text-stone-800 truncate">
                      {meal.items.map(i => i.name).join(', ')}
                    </div>
                    <div className="text-sm text-stone-500 mt-1 flex gap-3">
                      <span className="font-medium text-emerald-600">{meal.totals.kcal} ккал</span>
                      <span>Б:{meal.totals.protein} Ж:{meal.totals.fat} У:{meal.totals.carbs}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {/* FAB */}
      <div className="fixed bottom-6 left-0 right-0 px-6 flex justify-center z-20">
        <button 
          onClick={() => setIsCaptureModalOpen(true)}
          className="bg-stone-900 text-white rounded-full py-4 px-8 font-bold text-lg shadow-xl shadow-stone-900/20 flex items-center gap-3 hover:scale-105 active:scale-95 transition-all"
        >
          <Camera className="w-6 h-6" />
          Сфоткать еду
        </button>
      </div>

      {/* Capture Modal */}
      <AnimatePresence>
        {isCaptureModalOpen && (
          <motion.div 
            initial={{ opacity: 0, y: '100%' }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed inset-0 z-50 bg-white flex flex-col"
          >
            <div className="p-4 flex justify-between items-center border-b border-stone-100">
              <h2 className="text-xl font-bold text-stone-800">Добавить прием пищи</h2>
              <button onClick={() => {
                setIsCaptureModalOpen(false);
                setSelectedImage(null);
                setShowResults(false);
              }} className="p-2 bg-stone-100 rounded-full text-stone-500 hover:bg-stone-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-stone-50">
              {!selectedImage ? (
                <div className="h-full flex flex-col items-center justify-center space-y-6">
                  <div className="w-24 h-24 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-4">
                    <Camera className="w-10 h-10" />
                  </div>
                  <div className="text-center space-y-2 max-w-xs">
                    <h3 className="text-xl font-bold text-stone-800">Сфотографируйте тарелку</h3>
                    <p className="text-stone-500 text-sm">Положите рядом вилку или ложку для масштаба. ИИ определит размер порции.</p>
                  </div>
                  
                  <input 
                    type="file" 
                    accept="image/*" 
                    capture="environment"
                    className="hidden" 
                    ref={fileInputRef}
                    onChange={handleImageUpload}
                  />
                  
                  <div className="flex flex-col gap-3 w-full max-w-xs mt-8">
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold text-lg shadow-sm hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <Camera className="w-5 h-5" />
                      Камера
                    </button>
                    <button 
                      onClick={() => {
                        if (fileInputRef.current) {
                          fileInputRef.current.removeAttribute('capture');
                          fileInputRef.current.click();
                        }
                      }}
                      className="w-full bg-white border-2 border-stone-200 text-stone-700 py-4 rounded-2xl font-bold text-lg hover:bg-stone-50 transition-colors flex items-center justify-center gap-2"
                    >
                      <ImageIcon className="w-5 h-5" />
                      Галерея
                    </button>
                  </div>
                  
                  <div className="flex items-start gap-2 text-xs text-stone-400 bg-stone-100 p-4 rounded-2xl mt-auto">
                    <Info className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>Фотографии не сохраняются на сервере и обрабатываются приватно.</span>
                  </div>
                </div>
              ) : isAnalyzing ? (
                <div className="h-full flex flex-col items-center justify-center space-y-6">
                  <img src={selectedImage} alt="Analyzing" className="w-48 h-48 object-cover rounded-3xl shadow-lg opacity-50" />
                  <div className="flex items-center gap-3 text-emerald-600 font-bold text-xl">
                    <Loader2 className="w-6 h-6 animate-spin" />
                    Анализируем КБЖУ...
                  </div>
                  <p className="text-stone-500 text-sm text-center max-w-xs">Распознаем ингредиенты и оцениваем размер порции</p>
                </div>
              ) : showResults ? (
                <div className="space-y-6 pb-24">
                  <img src={selectedImage} alt="Result" className="w-full h-48 object-cover rounded-3xl shadow-sm" />
                  
                  <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex gap-3 text-amber-800 text-sm">
                    <AlertCircle className="w-5 h-5 shrink-0 text-amber-500" />
                    <div>
                      <p className="font-bold mb-1">Оценка приблизительная</p>
                      <p className="text-amber-700/80">Проверьте распознанные продукты и скорректируйте вес порции при необходимости.</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <h3 className="font-bold text-stone-800 text-lg">Распознано на фото:</h3>
                    {analyzedItems.map(item => (
                      <div key={item.id} className={`bg-white rounded-2xl p-4 border-2 transition-colors ${item.included ? 'border-emerald-500 shadow-sm' : 'border-stone-200 opacity-60'}`}>
                        <div className="flex items-start gap-3">
                          <button 
                            onClick={() => toggleItemIncluded(item.id)}
                            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 mt-0.5 transition-colors ${item.included ? 'bg-emerald-500 text-white' : 'bg-stone-200 text-transparent'}`}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-start mb-1">
                              <h4 className="font-bold text-stone-800 text-lg truncate pr-2">{item.name}</h4>
                              <span className={`text-[10px] font-bold px-2 py-1 rounded-full uppercase tracking-wider shrink-0 ${
                                item.confidence === 'high' ? 'bg-emerald-100 text-emerald-700' :
                                item.confidence === 'medium' ? 'bg-amber-100 text-amber-700' :
                                'bg-red-100 text-red-700'
                              }`}>
                                {item.confidence === 'high' ? 'Точно' : item.confidence === 'medium' ? 'Средне' : 'Неточно'}
                              </span>
                            </div>
                            
                            <div className="text-sm text-stone-500 mb-3">
                              {Math.round((item.kcalPer100g * item.portionGrams) / 100)} ккал • Б:{Math.round((item.proteinPer100g * item.portionGrams) / 100)} Ж:{Math.round((item.fatPer100g * item.portionGrams) / 100)} У:{Math.round((item.carbsPer100g * item.portionGrams) / 100)}
                            </div>
                            
                            {item.included && (
                              <div className="flex items-center gap-3 bg-stone-50 p-2 rounded-xl">
                                <span className="text-sm font-medium text-stone-600 pl-2">Порция:</span>
                                <input 
                                  type="number" 
                                  value={item.portionGrams}
                                  onChange={(e) => updateItemPortion(item.id, Number(e.target.value))}
                                  className="w-20 bg-white border border-stone-200 rounded-lg px-3 py-1.5 text-center font-bold text-stone-800 focus:outline-none focus:border-emerald-500"
                                />
                                <span className="text-sm font-medium text-stone-500">грамм</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  
                  <button className="w-full py-4 border-2 border-dashed border-stone-300 text-stone-500 font-bold rounded-2xl hover:bg-stone-100 transition-colors flex items-center justify-center gap-2">
                    <Plus className="w-5 h-5" />
                    Добавить продукт вручную
                  </button>
                </div>
              ) : null}
            </div>

            {showResults && (
              <div className="p-4 bg-white border-t border-stone-100">
                <button 
                  onClick={saveMeal}
                  disabled={!analyzedItems.some(i => i.included)}
                  className="w-full bg-stone-900 disabled:bg-stone-300 text-white py-4 rounded-2xl font-bold text-lg shadow-sm hover:bg-stone-800 transition-colors"
                >
                  Сохранить в дневник
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
