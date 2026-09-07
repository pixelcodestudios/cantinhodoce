import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import {
  LayoutDashboard, Package, CakeSlice, NotebookText, Wheat, Users, Wallet,
  Calendar as CalendarIcon, BarChart3, Settings as SettingsIcon, Plus, Trash2,
  Pencil, X, Search, ChevronLeft, ChevronRight, AlertTriangle, Check,
  TrendingUp, TrendingDown, Clock, PackageCheck, Menu, ChevronDown, Save,
  RotateCcw, CircleDot
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend
} from "recharts";
/* Este ficheiro é carregado pelo index.html (Babel + importmap) — ver esse
   ficheiro para saber como "react", "lucide-react" e "recharts" são resolvidos
   diretamente no browser, sem passo de build. */

/* =========================================================================
   CONSTANTES
========================================================================= */
const MONTHS = ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"];
const MONTHS_FULL = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];

const ORDER_STATUSES = ["Orçamento","Confirmada","Em preparação","Pronta","Entregue","Cancelada"];
const NOT_DONE_STATUSES = ["Orçamento","Confirmada","Em preparação","Pronta"];
const PAYMENT_STATUSES = ["Pendente","Parcialmente pago","Pago"];
const PAYMENT_METHODS = ["Dinheiro","MBWay","Transferência","Cartão","Outro"];

const PRODUCT_CATEGORIES = ["Bolos","Bolos personalizados","Cupcakes","Brigadeiros","Docinhos","Sobremesas","Kits","Salgados","Outros"];
const INGREDIENT_CATEGORIES = ["Farinhas e secos","Laticínios e ovos","Chocolates e coberturas","Frutas","Embalagens e caixas","Decoração","Outros materiais"];
const RECIPE_CATEGORIES = ["Massas","Recheios","Coberturas","Brigadeiros","Docinhos","Cupcakes","Sobremesas","Salgados","Kits","Outros"];
const FIN_EXPENSE_CATS = ["Ingredientes","Embalagens","Entregas","Energia","Equipamentos","Marketing","Outros"];
const FIN_INCOME_CATS = ["Vendas","Encomendas","Outros recebimentos"];
const COMPONENT_TYPES = ["Massa","Recheio","Cobertura","Decoração","Embalagem","Outro"];
const PURCHASE_UNITS = ["kg","g","litro","ml","unidade"];
const YIELD_UNITS = ["kg","g","litro","ml","unidade"];

const STORAGE_KEY = "cantinho-doce-dados-v1";

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "encomendas", label: "Encomendas", icon: Package },
  { id: "produtos", label: "Produtos", icon: CakeSlice },
  { id: "receitas", label: "Receitas e Fichas", icon: NotebookText },
  { id: "ingredientes", label: "Ingredientes", icon: Wheat },
  { id: "clientes", label: "Clientes", icon: Users },
  { id: "financeiro", label: "Financeiro", icon: Wallet },
  { id: "calendario", label: "Calendário", icon: CalendarIcon },
  { id: "relatorios", label: "Relatórios", icon: BarChart3 },
  { id: "config", label: "Configurações", icon: SettingsIcon },
];

const MOBILE_NAV_IDS = ["dashboard", "encomendas", "produtos", "receitas", "financeiro"];

/* =========================================================================
   UTILITÁRIOS
========================================================================= */
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const fmtEUR = (n) => {
  const v = Number(n);
  if (!isFinite(v)) return "€0,00";
  return v.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
};

const fmtPct = (n) => {
  const v = Number(n);
  if (!isFinite(v)) return "0%";
  return v.toLocaleString("pt-PT", { maximumFractionDigits: 1 }) + "%";
};

const fmtDate = (d) => {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit", year: "numeric" });
};

const todayISO = () => new Date().toISOString().slice(0, 10);

function numOr0(v) {
  const n = parseFloat(v);
  return isFinite(n) ? n : 0;
}

// Converte para unidade "base" (g, ml, ou unidade) para permitir comparação de custos
function baseUnitOf(unit) {
  if (unit === "kg" || unit === "g") return "g";
  if (unit === "litro" || unit === "ml") return "ml";
  return "unidade";
}
function toBaseQty(qty, unit) {
  const q = numOr0(qty);
  if (unit === "kg") return q * 1000;
  if (unit === "litro") return q * 1000;
  return q; // g, ml, unidade
}

// Custo por unidade-base de um ingrediente (ex: custo por grama)
function ingredientUnitCost(ing) {
  const baseQty = toBaseQty(ing.quantidadeComprada, ing.unidadeCompra);
  if (!baseQty) return 0;
  return numOr0(ing.valorPago) / baseQty;
}

function findIngredient(ingredients, id) {
  return ingredients.find((i) => i.id === id) || null;
}

// Calcula o custo total de uma receita nos seus valores "padrão" (sem escala)
function computeRecipeCost(recipe, ingredients) {
  let custoIngredientes = 0;
  (recipe.ingredientes || []).forEach((ri) => {
    const ing = findIngredient(ingredients, ri.ingredienteId);
    if (!ing) return;
    if (ri.custoManual != null && ri.custoManual !== "") {
      custoIngredientes += numOr0(ri.custoManual);
      return;
    }
    const unitCost = ingredientUnitCost(ing);
    const baseIngUnit = baseUnitOf(ing.unidadeCompra);
    const baseRiUnit = baseUnitOf(ri.unidade);
    let qtyInIngBase;
    if (baseIngUnit === baseRiUnit) {
      qtyInIngBase = toBaseQty(ri.quantidade, ri.unidade);
    } else {
      // unidades incompatíveis: usa o valor bruto como aproximação
      qtyInIngBase = numOr0(ri.quantidade);
    }
    custoIngredientes += qtyInIngBase * unitCost;
  });
  let custoComponentes = 0;
  (recipe.componentesExtras || []).forEach((c) => {
    custoComponentes += numOr0(c.custo);
  });
  const custoTotal = custoIngredientes + custoComponentes;
  const rendimentoBase = toBaseQty(recipe.rendimentoQtd || 1, recipe.rendimentoUnidade || "unidade");
  const custoPorBase = rendimentoBase > 0 ? custoTotal / rendimentoBase : 0;
  return { custoIngredientes, custoComponentes, custoTotal, custoPorBase, rendimentoBase };
}

// Escala o custo de uma receita para uma quantidade-alvo (ex: bolo de 3kg quando a receita padrão rende 2kg)
function scaledRecipeCost(recipe, ingredients, targetQty, targetUnit) {
  const base = computeRecipeCost(recipe, ingredients);
  const targetBaseUnit = baseUnitOf(targetUnit);
  const recipeBaseUnit = baseUnitOf(recipe.rendimentoUnidade || "unidade");
  let factor;
  if (targetBaseUnit === recipeBaseUnit && base.rendimentoBase > 0) {
    factor = toBaseQty(targetQty, targetUnit) / base.rendimentoBase;
  } else {
    factor = numOr0(targetQty) / numOr0(recipe.rendimentoQtd || 1);
  }
  if (!isFinite(factor) || factor < 0) factor = 0;
  return { ...base, factor, custoEscalado: base.custoTotal * factor };
}

function computeOrderItem(item, products, recipes, ingredients) {
  const product = products.find((p) => p.id === item.produtoId);
  const recipe = product ? recipes.find((r) => r.id === product.receitaId) : null;
  let custoAuto = 0;
  if (recipe) {
    const scaled = scaledRecipeCost(recipe, ingredients, item.quantidade, item.unidade || recipe.rendimentoUnidade || "unidade");
    custoAuto = scaled.custoEscalado;
  } else if (product) {
    custoAuto = numOr0(product.custoProducao) * numOr0(item.quantidade);
  }
  const custoFinal = item.custoManual != null && item.custoManual !== "" ? numOr0(item.custoManual) : custoAuto;
  const valorTotal = numOr0(item.precoUnitario) * numOr0(item.quantidade);
  return { product, recipe, custoAuto, custoFinal, valorTotal };
}

// Calcula todos os totais de uma encomenda, respeitando snapshot (histórico) e overrides manuais
function computeOrder(order, products, recipes, ingredients) {
  const useSnapshot = order.status === "Entregue" && order.snapshot;
  if (useSnapshot) {
    return { ...order.snapshot, isSnapshot: true };
  }
  const items = (order.itens || []).map((it) => {
    const c = computeOrderItem(it, products, recipes, ingredients);
    return { ...it, ...c };
  });
  const valorProdutos = items.reduce((s, it) => s + it.valorTotal, 0);
  const custoItens = items.reduce((s, it) => s + it.custoFinal, 0);
  const custoAdicionais = (order.custosAdicionais || []).reduce((s, c) => s + numOr0(c.valor), 0);
  const custoAutoTotal = custoItens + custoAdicionais;
  const custoTotal = order.custoManualTotal != null && order.custoManualTotal !== "" ? numOr0(order.custoManualTotal) : custoAutoTotal;
  const valorTotal = valorProdutos - numOr0(order.desconto) + numOr0(order.taxaEntrega);
  const lucro = valorTotal - custoTotal;
  const margem = valorTotal > 0 ? (lucro / valorTotal) * 100 : 0;
  const valorRestante = valorTotal - numOr0(order.valorPago);
  return { items, valorProdutos, custoItens, custoAdicionais, custoAutoTotal, custoTotal, valorTotal, lucro, margem, valorRestante, isSnapshot: false };
}

function isManualOrder(order) {
  return order.custoManualTotal != null && order.custoManualTotal !== "";
}

/* =========================================================================
   ARMAZENAMENTO (persistente entre sessões)
========================================================================= */
const EMPTY_DATA = {
  ingredients: [],
  recipes: [],
  products: [],
  orders: [],
  clients: [],
  finance: [],
  settings: {
    empresa: "Cantinho Doce",
    moeda: "EUR",
    formasPagamento: PAYMENT_METHODS,
  },
};

function useAppData() {
  const [data, setData] = useState(EMPTY_DATA);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState("idle"); // idle | saving | saved | error
  const saveTimer = useRef(null);

  // Carrega os dados guardados no navegador (localStorage) ao abrir o sistema
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        setData({ ...EMPTY_DATA, ...parsed, settings: { ...EMPTY_DATA.settings, ...(parsed.settings || {}) } });
      }
    } catch (e) {
      // sem dados guardados ainda, ou dados corrompidos — começa vazio
    } finally {
      setLoaded(true);
    }
  }, []);

  // Guarda automaticamente (com pequeno atraso) sempre que os dados mudam
  useEffect(() => {
    if (!loaded) return;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        setSaveState("saved");
      } catch (e) {
        setSaveState("error");
      }
    }, 400);
    return () => clearTimeout(saveTimer.current);
  }, [data, loaded]);

  return { data, setData, loaded, saveState };
}

/* =========================================================================
   COMPONENTES DE UI PARTILHADOS
========================================================================= */
function Modal({ title, onClose, children, footer, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-[#3A2A33]/40 backdrop-blur-[2px] p-0 sm:p-4">
      <div className={`bg-[#FFFDFB] w-full ${wide ? "sm:max-w-2xl" : "sm:max-w-lg"} sm:rounded-2xl rounded-t-2xl shadow-xl max-h-[92vh] flex flex-col`}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#EEE3E0]">
          <h3 className="font-serif text-lg text-[#3A2A33]">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-[#F3E9E7] text-[#8A6B72]">
            <X size={18} />
          </button>
        </div>
        <div className="px-5 py-4 overflow-y-auto flex-1">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-[#EEE3E0] flex justify-end gap-2 bg-[#FBF7F5] sm:rounded-b-2xl">{footer}</div>}
      </div>
    </div>
  );
}

function Field({ label, children, hint }) {
  return (
    <label className="block mb-3">
      <span className="block text-xs font-medium text-[#8A6B72] mb-1">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-[#B6A0A5] mt-0.5">{hint}</span>}
    </label>
  );
}

const inputCls = "w-full rounded-lg border border-[#E4D3D0] bg-white px-3 py-2 text-sm text-[#3A2A33] focus:outline-none focus:ring-2 focus:ring-[#C97B84]/40 focus:border-[#C97B84]";

function TextInput(props) { return <input {...props} className={inputCls + " " + (props.className || "")} />; }
function Select({ children, ...props }) { return <select {...props} className={inputCls + " " + (props.className || "")}>{children}</select>; }
function TextArea(props) { return <textarea {...props} className={inputCls + " " + (props.className || "")} rows={props.rows || 2} />; }

function Btn({ children, variant = "primary", size = "md", className = "", ...props }) {
  const base = "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed";
  const sizes = { md: "px-3.5 py-2 text-sm", sm: "px-2.5 py-1.5 text-xs" };
  const variants = {
    primary: "bg-[#C97B84] text-white hover:bg-[#B96670]",
    secondary: "bg-[#F3E9E7] text-[#3A2A33] hover:bg-[#EAD9D6]",
    ghost: "text-[#8A6B72] hover:bg-[#F3E9E7]",
    danger: "bg-[#FBEAEA] text-[#B4463E] hover:bg-[#F6D6D4]",
  };
  return <button className={`${base} ${sizes[size]} ${variants[variant]} ${className}`} {...props}>{children}</button>;
}

function Badge({ children, tone = "neutral" }) {
  const tones = {
    neutral: "bg-[#F3E9E7] text-[#8A6B72]",
    success: "bg-[#E4F0E5] text-[#3F7A4C]",
    warning: "bg-[#FBF0DC] text-[#9A6B1E]",
    danger: "bg-[#FBEAEA] text-[#B4463E]",
    info: "bg-[#E7EEF7] text-[#3F6392]",
    gold: "bg-[#F6ECD9] text-[#8A6B24]",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap ${tones[tone]}`}>{children}</span>;
}

function orderStatusTone(s) {
  return { "Orçamento": "neutral", "Confirmada": "info", "Em preparação": "warning", "Pronta": "gold", "Entregue": "success", "Cancelada": "danger" }[s] || "neutral";
}
function paymentStatusTone(s) {
  return { "Pendente": "danger", "Parcialmente pago": "warning", "Pago": "success" }[s] || "neutral";
}

function AutoManualTag({ manual }) {
  return manual ? (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#B5741C]"><CircleDot size={10} /> Definido manualmente</span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#3F7A4C]"><CircleDot size={10} /> Calculado automaticamente</span>
  );
}

function EmptyState({ icon: Icon, title, description, actionLabel, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6 border border-dashed border-[#E4D3D0] rounded-2xl bg-[#FFFDFB]">
      <div className="w-12 h-12 rounded-full bg-[#F3E9E7] flex items-center justify-center mb-3 text-[#C97B84]">
        <Icon size={22} />
      </div>
      <h4 className="font-serif text-base text-[#3A2A33] mb-1">{title}</h4>
      <p className="text-sm text-[#8A6B72] max-w-sm mb-4">{description}</p>
      {actionLabel && (
        <Btn onClick={onAction}><Plus size={15} /> {actionLabel}</Btn>
      )}
    </div>
  );
}

function StatCard({ label, value, sub, icon: Icon, tone = "default" }) {
  const toneCls = { default: "text-[#3A2A33]", good: "text-[#3F7A4C]", bad: "text-[#B4463E]" }[tone];
  return (
    <div className="bg-white rounded-2xl border border-[#EEE3E0] p-4">
      <div className="flex items-start justify-between mb-2">
        <span className="text-xs font-medium text-[#8A6B72]">{label}</span>
        {Icon && <Icon size={16} className="text-[#C9A8AC]" />}
      </div>
      <div className={`font-serif text-2xl ${toneCls}`}>{value}</div>
      {sub && <div className="text-[11px] text-[#B6A0A5] mt-1">{sub}</div>}
    </div>
  );
}

function confirmDelete(msg = "Tem a certeza que quer eliminar este item? Esta ação não pode ser desfeita.") {
  return window.confirm(msg);
}

/* ---- Seletor de período (multi-mês) reutilizado em várias páginas ---- */
function usePeriodFilter() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [months, setMonths] = useState(new Set([now.getMonth()]));
  const [allTime, setAllTime] = useState(false);

  const matches = useCallback((dateStr) => {
    if (allTime) return true;
    if (!dateStr) return false;
    const d = new Date(dateStr + "T00:00:00");
    if (isNaN(d)) return false;
    return d.getFullYear() === year && months.has(d.getMonth());
  }, [allTime, year, months]);

  const setPreset = (preset) => {
    const n = new Date();
    setAllTime(false);
    if (preset === "mes") { setYear(n.getFullYear()); setMonths(new Set([n.getMonth()])); }
    if (preset === "mesAnterior") {
      const m = n.getMonth() - 1, y = m < 0 ? n.getFullYear() - 1 : n.getFullYear();
      setYear(y); setMonths(new Set([(m + 12) % 12]));
    }
    if (preset === "ano") { setYear(n.getFullYear()); setMonths(new Set(MONTHS.map((_, i) => i))); }
    if (preset === "todos") { setAllTime(true); }
  };

  return { year, setYear, months, setMonths, allTime, setAllTime, matches, setPreset };
}

function PeriodFilterBar({ pf }) {
  const toggleMonth = (i) => {
    pf.setAllTime(false);
    const next = new Set(pf.months);
    if (next.has(i)) next.delete(i); else next.add(i);
    pf.setMonths(next);
  };
  const allSelected = pf.months.size === 12;
  return (
    <div className="bg-white border border-[#EEE3E0] rounded-2xl p-3.5">
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-xs font-medium text-[#8A6B72] mr-1">Período rápido:</span>
        {[["mes","Este mês"],["mesAnterior","Mês anterior"],["ano","Este ano"],["todos","Todo o histórico"]].map(([k,l]) => (
          <button key={k} onClick={() => pf.setPreset(k)} className="px-2.5 py-1 rounded-full text-xs font-medium bg-[#F3E9E7] text-[#3A2A33] hover:bg-[#EAD9D6]">{l}</button>
        ))}
        {!pf.allTime && (
          <select value={pf.year} onChange={(e) => pf.setYear(parseInt(e.target.value))} className="ml-auto rounded-lg border border-[#E4D3D0] bg-white px-2 py-1 text-xs">
            {[pf.year - 1, pf.year, pf.year + 1].map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        )}
      </div>
      {!pf.allTime && (
        <div className="flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-[#8A6B72] mr-1">Meses (selecione vários):</span>
          {MONTHS.map((m, i) => (
            <button
              key={m}
              onClick={() => toggleMonth(i)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${pf.months.has(i) ? "bg-[#C97B84] border-[#C97B84] text-white" : "bg-white border-[#E4D3D0] text-[#8A6B72]"}`}
            >{m}</button>
          ))}
          <button
            onClick={() => pf.setMonths(allSelected ? new Set() : new Set(MONTHS.map((_, i) => i)))}
            className="px-2.5 py-1 rounded-full text-xs font-medium text-[#C97B84] underline underline-offset-2"
          >{allSelected ? "Limpar" : "Selecionar todos"}</button>
        </div>
      )}
      {pf.allTime && <div className="text-xs text-[#B6A0A5]">A mostrar todos os períodos.</div>}
    </div>
  );
}

/* =========================================================================
   APP RAIZ
========================================================================= */
export default function CantinhoDoce() {
  const { data, setData, loaded, saveState } = useAppData();
  const [view, setView] = useState("dashboard");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState(null);

  const notify = useCallback((msg, tone = "success") => {
    setToast({ msg, tone, id: uid() });
    setTimeout(() => setToast((t) => (t && t.msg === msg ? null : t)), 2600);
  }, []);

  // Helpers CRUD genéricos
  const add = (key, item) => setData((d) => ({ ...d, [key]: [...d[key], { id: uid(), ...item }] }));
  const update = (key, id, patch) => setData((d) => ({ ...d, [key]: d[key].map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const remove = (key, id) => setData((d) => ({ ...d, [key]: d[key].filter((x) => x.id !== id) }));

  const ctx = { data, add, update, remove, notify, setData };

  if (!loaded) {
    return (
      <div className="min-h-[500px] flex items-center justify-center bg-[#FBF7F5] font-sans">
        <div className="text-[#8A6B72] text-sm">A carregar o Cantinho Doce…</div>
      </div>
    );
  }

  const pages = {
    dashboard: <DashboardPage ctx={ctx} />,
    encomendas: <OrdersPage ctx={ctx} />,
    produtos: <ProductsPage ctx={ctx} />,
    receitas: <RecipesPage ctx={ctx} />,
    ingredientes: <IngredientsPage ctx={ctx} />,
    clientes: <ClientsPage ctx={ctx} />,
    financeiro: <FinancePage ctx={ctx} />,
    calendario: <CalendarPage ctx={ctx} setView={setView} />,
    relatorios: <ReportsPage ctx={ctx} />,
    config: <SettingsPage ctx={ctx} />,
  };

  const currentNav = NAV.find((n) => n.id === view);

  return (
    <div className="min-h-[700px] bg-[#FBF7F5] font-sans text-[#3A2A33] flex" style={{ fontFamily: "'Inter', ui-sans-serif, system-ui" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap');
        .font-serif { font-family: 'Fraunces', serif; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-thumb { background: #E4D3D0; border-radius: 8px; }
      `}</style>

      {/* Sidebar desktop */}
      <aside className="hidden md:flex flex-col w-60 shrink-0 bg-[#3A2A33] text-[#F3E9E7] min-h-full">
        <div className="px-5 py-6">
          <div className="font-serif text-xl text-white">Cantinho Doce</div>
          <div className="text-[11px] text-[#C9A8AC] mt-0.5">Gestão de confeitaria</div>
        </div>
        <nav className="flex-1 px-3 space-y-0.5">
          {NAV.map((n) => {
            const Icon = n.icon;
            const active = view === n.id;
            return (
              <button
                key={n.id}
                onClick={() => setView(n.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${active ? "bg-[#C97B84] text-white" : "text-[#D9C3C7] hover:bg-white/5"}`}
              >
                <Icon size={17} /> {n.label}
              </button>
            );
          })}
        </nav>
        <div className="px-5 py-4 text-[11px] text-[#C9A8AC] border-t border-white/10">
          {saveState === "saving" ? "A guardar…" : saveState === "error" ? "Erro ao guardar dados" : "Dados guardados"}
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 bg-[#3A2A33] text-white flex items-center justify-between px-4 py-3">
        <button onClick={() => setMobileMenu(true)} className="p-1"><Menu size={20} /></button>
        <div className="font-serif text-base">{currentNav?.label || "Cantinho Doce"}</div>
        <div className="w-7" />
      </div>

      {/* Mobile full menu */}
      {mobileMenu && (
        <div className="fixed inset-0 z-50 bg-[#3A2A33] text-white flex flex-col">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div className="font-serif text-lg">Cantinho Doce</div>
            <button onClick={() => setMobileMenu(false)}><X size={20} /></button>
          </div>
          <nav className="flex-1 px-3 py-2 space-y-1 overflow-y-auto">
            {NAV.map((n) => {
              const Icon = n.icon;
              return (
                <button key={n.id} onClick={() => { setView(n.id); setMobileMenu(false); }}
                  className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-medium ${view === n.id ? "bg-[#C97B84] text-white" : "text-[#D9C3C7]"}`}>
                  <Icon size={18} /> {n.label}
                </button>
              );
            })}
          </nav>
        </div>
      )}

      {/* Conteúdo */}
      <main className="flex-1 min-w-0 pt-14 md:pt-0 pb-16 md:pb-0">
        <div className="max-w-6xl mx-auto p-4 md:p-8">{pages[view]}</div>
      </main>

      {/* Bottom nav mobile */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-[#EEE3E0] flex justify-around py-1.5">
        {MOBILE_NAV_IDS.map((id) => {
          const n = NAV.find((x) => x.id === id);
          const Icon = n.icon;
          const active = view === id;
          return (
            <button key={id} onClick={() => setView(id)} className={`flex flex-col items-center gap-0.5 px-2 py-1 text-[10px] font-medium ${active ? "text-[#C97B84]" : "text-[#B6A0A5]"}`}>
              <Icon size={19} /> {n.label.split(" ")[0]}
            </button>
          );
        })}
      </nav>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 z-[60] bg-[#3A2A33] text-white text-sm px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2">
          <Check size={15} className="text-[#B7E0BE]" /> {toast.msg}
        </div>
      )}
    </div>
  );
}

/* =========================================================================
   DASHBOARD
========================================================================= */
function DashboardPage({ ctx }) {
  const { data } = ctx;
  const pf = usePeriodFilter();

  const ordersInPeriod = useMemo(() => data.orders.filter((o) => pf.matches(o.dataEntrega)), [data.orders, pf]);
  const computedOrders = useMemo(
    () => ordersInPeriod.map((o) => ({ o, c: computeOrder(o, data.products, data.recipes, data.ingredients) })),
    [ordersInPeriod, data.products, data.recipes, data.ingredients]
  );
  const delivered = computedOrders.filter(({ o }) => o.status === "Entregue");
  const notCancelled = computedOrders.filter(({ o }) => o.status !== "Cancelada");

  const financeInPeriod = useMemo(() => data.finance.filter((f) => pf.matches(f.data)), [data.finance, pf]);
  const ingredientPurchasesInPeriod = useMemo(() => data.ingredients.filter((i) => pf.matches(i.dataCompra)), [data.ingredients, pf]);

  const faturamento = delivered.reduce((s, { c }) => s + c.valorTotal, 0);
  const custoProducao = delivered.reduce((s, { c }) => s + c.custoTotal, 0);
  const outrasDespesas = financeInPeriod.filter((f) => f.tipo === "despesa").reduce((s, f) => s + numOr0(f.valor), 0);
  const comprasIngredientes = ingredientPurchasesInPeriod.reduce((s, i) => s + numOr0(i.valorPago), 0);
  const outrasReceitas = financeInPeriod.filter((f) => f.tipo === "receita").reduce((s, f) => s + numOr0(f.valor), 0);
  const despesasTotais = outrasDespesas + comprasIngredientes;
  const lucro = faturamento + outrasReceitas - custoProducao - outrasDespesas;
  const margem = faturamento > 0 ? (lucro / faturamento) * 100 : 0;
  const pendentes = notCancelled.filter(({ o }) => NOT_DONE_STATUSES.includes(o.status));
  const concluidas = notCancelled.filter(({ o }) => o.status === "Entregue");
  const aReceber = notCancelled.reduce((s, { c }) => s + Math.max(c.valorRestante, 0), 0);
  const ticketMedio = notCancelled.length > 0 ? notCancelled.reduce((s, { c }) => s + c.valorTotal, 0) / notCancelled.length : 0;

  // gráficos: faturamento e lucro por mês (dentro do(s) ano(s) selecionados, ignora filtro de mês para ver evolução)
  const monthlyData = useMemo(() => {
    const year = pf.year;
    return MONTHS.map((m, i) => {
      const inMonth = data.orders.filter((o) => {
        if (o.status !== "Entregue" || !o.dataEntrega) return false;
        const d = new Date(o.dataEntrega + "T00:00:00");
        return d.getFullYear() === year && d.getMonth() === i;
      });
      let fat = 0, lucroM = 0;
      inMonth.forEach((o) => {
        const c = computeOrder(o, data.products, data.recipes, data.ingredients);
        fat += c.valorTotal; lucroM += c.lucro;
      });
      return { mes: m, Faturamento: Math.round(fat * 100) / 100, Lucro: Math.round(lucroM * 100) / 100 };
    });
  }, [data.orders, data.products, data.recipes, data.ingredients, pf.year]);

  const byCategory = useMemo(() => {
    const map = {};
    notCancelled.forEach(({ o, c }) => {
      (o.itens || []).forEach((it) => {
        const prod = data.products.find((p) => p.id === it.produtoId);
        const cat = prod?.categoria || "Outros";
        map[cat] = (map[cat] || 0) + numOr0(it.precoUnitario) * numOr0(it.quantidade);
      });
    });
    return Object.entries(map).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  }, [notCancelled, data.products]);

  const topProducts = useMemo(() => {
    const map = {};
    notCancelled.forEach(({ o }) => {
      (o.itens || []).forEach((it) => {
        const prod = data.products.find((p) => p.id === it.produtoId);
        const name = prod?.nome || "Produto removido";
        map[name] = (map[name] || 0) + numOr0(it.quantidade);
      });
    });
    return Object.entries(map).map(([name, qtd]) => ({ name, qtd })).sort((a, b) => b.qtd - a.qtd).slice(0, 5);
  }, [notCancelled, data.products]);

  const despesasByCat = useMemo(() => {
    const map = {};
    financeInPeriod.filter((f) => f.tipo === "despesa").forEach((f) => { map[f.categoria] = (map[f.categoria] || 0) + numOr0(f.valor); });
    if (comprasIngredientes > 0) map["Ingredientes (compras)"] = (map["Ingredientes (compras)"] || 0) + comprasIngredientes;
    return Object.entries(map).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }));
  }, [financeInPeriod, comprasIngredientes]);

  const PIE_COLORS = ["#C97B84","#B8935A","#8FA98C","#7C9BB5","#C9A8AC","#D9C08A"];

  const upcoming = useMemo(() => {
    const t = todayISO();
    return data.orders
      .filter((o) => o.status !== "Cancelada" && o.status !== "Entregue" && o.dataEntrega)
      .sort((a, b) => a.dataEntrega.localeCompare(b.dataEntrega))
      .slice(0, 6)
      .map((o) => ({ o, c: computeOrder(o, data.products, data.recipes, data.ingredients), atrasada: o.dataEntrega < t }));
  }, [data.orders, data.products, data.recipes, data.ingredients]);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="font-serif text-2xl text-[#3A2A33]">Dashboard</h1>
        <p className="text-sm text-[#8A6B72]">Visão geral do {data.settings.empresa}</p>
      </header>

      <PeriodFilterBar pf={pf} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Faturamento" value={fmtEUR(faturamento)} icon={TrendingUp} />
        <StatCard label="Encomendas" value={notCancelled.length} sub={`${pendentes.length} pendentes · ${concluidas.length} concluídas`} icon={Package} />
        <StatCard label="A receber" value={fmtEUR(aReceber)} icon={Wallet} />
        <StatCard label="Despesas" value={fmtEUR(despesasTotais)} icon={TrendingDown} />
        <StatCard label="Custo de produção" value={fmtEUR(custoProducao)} icon={Wheat} />
        <StatCard label="Lucro estimado" value={fmtEUR(lucro)} tone={lucro >= 0 ? "good" : "bad"} icon={TrendingUp} />
        <StatCard label="Margem de lucro" value={fmtPct(margem)} tone={margem >= 0 ? "good" : "bad"} />
        <StatCard label="Ticket médio" value={fmtEUR(ticketMedio)} />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-[#EEE3E0] p-4">
          <h3 className="text-sm font-semibold text-[#3A2A33] mb-3">Faturamento e lucro por mês ({pf.year})</h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#EEE3E0" />
              <XAxis dataKey="mes" tick={{ fontSize: 11 }} stroke="#8A6B72" />
              <YAxis tick={{ fontSize: 11 }} stroke="#8A6B72" />
              <Tooltip formatter={(v) => fmtEUR(v)} contentStyle={{ fontSize: 12, borderRadius: 10, borderColor: "#EEE3E0" }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="Faturamento" stroke="#C97B84" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="Lucro" stroke="#8FA98C" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white rounded-2xl border border-[#EEE3E0] p-4">
          <h3 className="text-sm font-semibold text-[#3A2A33] mb-3">Vendas por categoria (período selecionado)</h3>
          {byCategory.length === 0 ? <div className="text-sm text-[#B6A0A5] h-[220px] flex items-center justify-center">Sem dados no período</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={(e) => e.name}>
                  {byCategory.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => fmtEUR(v)} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-[#EEE3E0] p-4">
          <h3 className="text-sm font-semibold text-[#3A2A33] mb-3">Despesas por categoria (período selecionado)</h3>
          {despesasByCat.length === 0 ? <div className="text-sm text-[#B6A0A5] h-[220px] flex items-center justify-center">Sem despesas no período</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={despesasByCat}>
                <CartesianGrid strokeDasharray="3 3" stroke="#EEE3E0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} stroke="#8A6B72" interval={0} angle={-15} textAnchor="end" height={50} />
                <YAxis tick={{ fontSize: 11 }} stroke="#8A6B72" />
                <Tooltip formatter={(v) => fmtEUR(v)} />
                <Bar dataKey="value" fill="#C97B84" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="bg-white rounded-2xl border border-[#EEE3E0] p-4">
          <h3 className="text-sm font-semibold text-[#3A2A33] mb-3">Produtos mais vendidos (período selecionado)</h3>
          {topProducts.length === 0 ? <div className="text-sm text-[#B6A0A5] h-[220px] flex items-center justify-center">Sem dados no período</div> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topProducts} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#EEE3E0" />
                <XAxis type="number" tick={{ fontSize: 11 }} stroke="#8A6B72" />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} stroke="#8A6B72" />
                <Tooltip />
                <Bar dataKey="qtd" fill="#B8935A" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-[#EEE3E0] p-4">
        <h3 className="text-sm font-semibold text-[#3A2A33] mb-3">Próximas encomendas</h3>
        {upcoming.length === 0 ? <div className="text-sm text-[#B6A0A5] py-6 text-center">Sem encomendas por concluir.</div> : (
          <div className="space-y-2">
            {upcoming.map(({ o, c, atrasada }) => {
              const client = data.clients.find((cl) => cl.id === o.clienteId);
              return (
                <div key={o.id} className={`flex flex-wrap items-center gap-2 justify-between rounded-xl px-3 py-2.5 ${atrasada ? "bg-[#FBEAEA]" : "bg-[#FBF7F5]"}`}>
                  <div>
                    <div className="text-sm font-medium text-[#3A2A33]">{client?.nome || "Cliente"} {atrasada && <Badge tone="danger">Atrasada</Badge>}</div>
                    <div className="text-xs text-[#8A6B72]">{fmtDate(o.dataEntrega)} {o.horario && `· ${o.horario}`} · {(o.itens || []).length} produto(s)</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{fmtEUR(c.valorTotal)}</span>
                    <Badge tone={orderStatusTone(o.status)}>{o.status}</Badge>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
   ENCOMENDAS
========================================================================= */
function emptyOrder() {
  return {
    numero: "", clienteId: "", telefone: "", dataPedido: todayISO(), dataEntrega: "", horario: "",
    itens: [], observacoes: "", desconto: 0, taxaEntrega: 0, valorPago: 0, formaPagamento: "Dinheiro",
    statusPagamento: "Pendente", status: "Orçamento", custosAdicionais: [], custoManualTotal: null, snapshot: null,
  };
}

function OrdersPage({ ctx }) {
  const { data, add, update, remove, notify } = ctx;
  const [quickFilter, setQuickFilter] = useState("todas");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // {mode:'new'|'edit', order}
  const pf = usePeriodFilter();
  useEffect(() => { pf.setAllTime(true); }, []); // eslint-disable-line

  const [advFilters, setAdvFilters] = useState({ cliente: "", categoria: "", statusPagamento: "", formaPagamento: "" });

  const filtered = useMemo(() => {
    let list = [...data.orders];
    if (quickFilter === "nao-concluidas") list = list.filter((o) => NOT_DONE_STATUSES.includes(o.status));
    if (quickFilter === "concluidas") list = list.filter((o) => o.status === "Entregue");
    if (quickFilter === "canceladas") list = list.filter((o) => o.status === "Cancelada");
    if (!pf.allTime) list = list.filter((o) => pf.matches(o.dataEntrega));
    if (advFilters.cliente) list = list.filter((o) => o.clienteId === advFilters.cliente);
    if (advFilters.statusPagamento) list = list.filter((o) => o.statusPagamento === advFilters.statusPagamento);
    if (advFilters.formaPagamento) list = list.filter((o) => o.formaPagamento === advFilters.formaPagamento);
    if (advFilters.categoria) list = list.filter((o) => (o.itens || []).some((it) => data.products.find((p) => p.id === it.produtoId)?.categoria === advFilters.categoria));
    if (search.trim()) {
      const s = search.toLowerCase();
      list = list.filter((o) => {
        const client = data.clients.find((c) => c.id === o.clienteId);
        return (client?.nome || "").toLowerCase().includes(s) || (o.numero || "").toLowerCase().includes(s);
      });
    }
    return list.sort((a, b) => (b.dataEntrega || "").localeCompare(a.dataEntrega || ""));
  }, [data.orders, data.products, data.clients, quickFilter, pf, advFilters, search]);

  const totals = useMemo(() => {
    let fat = 0, lucro = 0;
    filtered.forEach((o) => { const c = computeOrder(o, data.products, data.recipes, data.ingredients); fat += c.valorTotal; lucro += c.lucro; });
    return { fat, lucro, n: filtered.length };
  }, [filtered, data.products, data.recipes, data.ingredients]);

  const saveOrder = (order) => {
    let toSave = { ...order };
    // snapshot ao marcar como entregue
    if (toSave.status === "Entregue" && !toSave.snapshot) {
      const computed = computeOrder({ ...toSave, snapshot: null }, data.products, data.recipes, data.ingredients);
      toSave.snapshot = { ...computed, congeladoEm: new Date().toISOString() };
    }
    if (toSave.status !== "Entregue") toSave.snapshot = null;
    if (modal.mode === "new") { add("orders", toSave); notify("Encomenda criada."); }
    else { update("orders", toSave.id, toSave); notify("Encomenda atualizada."); }
    setModal(null);
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="font-serif text-2xl text-[#3A2A33]">Encomendas</h1>
          <p className="text-sm text-[#8A6B72]">{totals.n} encomenda(s) · {fmtEUR(totals.fat)} · lucro {fmtEUR(totals.lucro)}</p>
        </div>
        <Btn onClick={() => setModal({ mode: "new", order: emptyOrder() })}><Plus size={16} /> Nova encomenda</Btn>
      </header>

      <div className="flex flex-wrap gap-2">
        {[["todas","Todas"],["nao-concluidas","Não concluídas"],["concluidas","Concluídas"],["canceladas","Canceladas"]].map(([k, l]) => (
          <button key={k} onClick={() => setQuickFilter(k)} className={`px-3 py-1.5 rounded-full text-sm font-medium ${quickFilter === k ? "bg-[#C97B84] text-white" : "bg-white border border-[#E4D3D0] text-[#8A6B72]"}`}>{l}</button>
        ))}
        <button onClick={() => setShowAdvanced((v) => !v)} className="ml-auto px-3 py-1.5 rounded-full text-sm font-medium bg-[#F3E9E7] text-[#3A2A33] flex items-center gap-1">Filtros avançados <ChevronDown size={14} className={showAdvanced ? "rotate-180" : ""} /></button>
      </div>

      {showAdvanced && (
        <div className="bg-white border border-[#EEE3E0] rounded-2xl p-4 space-y-3">
          <PeriodFilterBar pf={pf} />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <TextInput placeholder="Pesquisar cliente ou nº" value={search} onChange={(e) => setSearch(e.target.value)} />
            <Select value={advFilters.cliente} onChange={(e) => setAdvFilters((f) => ({ ...f, cliente: e.target.value }))}>
              <option value="">Todos os clientes</option>
              {data.clients.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
            <Select value={advFilters.categoria} onChange={(e) => setAdvFilters((f) => ({ ...f, categoria: e.target.value }))}>
              <option value="">Todas as categorias</option>
              {PRODUCT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}
            </Select>
            <Select value={advFilters.statusPagamento} onChange={(e) => setAdvFilters((f) => ({ ...f, statusPagamento: e.target.value }))}>
              <option value="">Qualquer pagamento</option>
              {PAYMENT_STATUSES.map((s) => <option key={s}>{s}</option>)}
            </Select>
          </div>
        </div>
      )}

      {filtered.length === 0 ? (
        <EmptyState icon={Package} title="Nenhuma encomenda encontrada" description="Crie a primeira encomenda ou ajuste os filtros." actionLabel="Nova encomenda" onAction={() => setModal({ mode: "new", order: emptyOrder() })} />
      ) : (
        <div className="space-y-2">
          {filtered.map((o) => {
            const c = computeOrder(o, data.products, data.recipes, data.ingredients);
            const client = data.clients.find((cl) => cl.id === o.clienteId);
            return (
              <div key={o.id} className="bg-white border border-[#EEE3E0] rounded-2xl p-4 flex flex-wrap items-center gap-3 justify-between">
                <div className="min-w-[180px]">
                  <div className="text-sm font-semibold text-[#3A2A33]">{client?.nome || "Sem cliente"} {o.numero && <span className="text-[#B6A0A5] font-normal">#{o.numero}</span>}</div>
                  <div className="text-xs text-[#8A6B72]">{fmtDate(o.dataEntrega)} {o.horario && `· ${o.horario}`}</div>
                </div>
                <div className="flex flex-col text-xs text-[#8A6B72]">
                  <span>Total: <b className="text-[#3A2A33]">{fmtEUR(c.valorTotal)}</b></span>
                  <span>Lucro: <b className={c.lucro >= 0 ? "text-[#3F7A4C]" : "text-[#B4463E]"}>{fmtEUR(c.lucro)}</b> ({fmtPct(c.margem)})</span>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  <Badge tone={orderStatusTone(o.status)}>{o.status}</Badge>
                  <Badge tone={paymentStatusTone(o.statusPagamento)}>{o.statusPagamento}</Badge>
                  {isManualOrder(o) && <Badge tone="warning">Custo manual</Badge>}
                </div>
                <div className="flex items-center gap-1">
                  <Btn size="sm" variant="ghost" onClick={() => setModal({ mode: "edit", order: JSON.parse(JSON.stringify(o)) })}><Pencil size={14} /></Btn>
                  <Btn size="sm" variant="danger" onClick={() => { if (confirmDelete()) { remove("orders", o.id); notify("Encomenda eliminada."); } }}><Trash2 size={14} /></Btn>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && <OrderModal ctx={ctx} order={modal.order} onClose={() => setModal(null)} onSave={saveOrder} />}
    </div>
  );
}

function OrderModal({ ctx, order, onClose, onSave }) {
  const { data } = ctx;
  const [o, setO] = useState(order);
  const patch = (p) => setO((x) => ({ ...x, ...p }));

  const addItem = () => patch({ itens: [...(o.itens || []), { id: uid(), produtoId: "", quantidade: 1, unidade: "unidade", precoUnitario: 0, custoManual: null }] });
  const updateItem = (id, p) => patch({ itens: o.itens.map((it) => (it.id === id ? { ...it, ...p } : it)) });
  const removeItem = (id) => patch({ itens: o.itens.filter((it) => it.id !== id) });

  const onSelectProduct = (id, produtoId) => {
    const prod = data.products.find((p) => p.id === produtoId);
    const recipe = prod ? data.recipes.find((r) => r.id === prod.receitaId) : null;
    updateItem(id, {
      produtoId,
      precoUnitario: prod ? numOr0(prod.preco) : 0,
      unidade: recipe?.rendimentoUnidade || "unidade",
      quantidade: recipe?.rendimentoQtd || 1,
    });
  };

  const addCusto = () => patch({ custosAdicionais: [...(o.custosAdicionais || []), { id: uid(), nome: "", valor: 0 }] });
  const updateCusto = (id, p) => patch({ custosAdicionais: o.custosAdicionais.map((c) => (c.id === id ? { ...c, ...p } : c)) });
  const removeCusto = (id) => patch({ custosAdicionais: o.custosAdicionais.filter((c) => c.id !== id) });

  const computed = computeOrder({ ...o, status: "Confirmada" }, data.products, data.recipes, data.ingredients); // sempre live no modal
  const valorRestante = computed.valorTotal - numOr0(o.valorPago);

  return (
    <Modal title={order.numero || o.clienteId ? "Editar encomenda" : "Nova encomenda"} onClose={onClose} wide
      footer={<>
        <Btn variant="secondary" onClick={onClose}>Cancelar</Btn>
        <Btn onClick={() => onSave(o)}><Save size={15} /> Guardar</Btn>
      </>}>
      <div className="grid md:grid-cols-2 gap-3">
        <Field label="Nº da encomenda (opcional)"><TextInput value={o.numero} onChange={(e) => patch({ numero: e.target.value })} placeholder="Automático se vazio" /></Field>
        <Field label="Cliente">
          <Select value={o.clienteId} onChange={(e) => patch({ clienteId: e.target.value })}>
            <option value="">Selecionar cliente…</option>
            {data.clients.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </Field>
        <Field label="Telefone"><TextInput value={o.telefone} onChange={(e) => patch({ telefone: e.target.value })} /></Field>
        <Field label="Data do pedido"><TextInput type="date" value={o.dataPedido} onChange={(e) => patch({ dataPedido: e.target.value })} /></Field>
        <Field label="Data de entrega/retirada"><TextInput type="date" value={o.dataEntrega} onChange={(e) => patch({ dataEntrega: e.target.value })} /></Field>
        <Field label="Horário"><TextInput type="time" value={o.horario} onChange={(e) => patch({ horario: e.target.value })} /></Field>
      </div>

      <div className="mt-2 mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-[#3A2A33]">Produtos</span>
        <Btn size="sm" variant="secondary" onClick={addItem}><Plus size={13} /> Adicionar produto</Btn>
      </div>
      <div className="space-y-2 mb-3">
        {(o.itens || []).length === 0 && <div className="text-xs text-[#B6A0A5] py-3 text-center border border-dashed border-[#E4D3D0] rounded-xl">Nenhum produto adicionado.</div>}
        {(o.itens || []).map((it) => {
          const c = computeOrderItem(it, data.products, data.recipes, data.ingredients);
          return (
            <div key={it.id} className="border border-[#EEE3E0] rounded-xl p-3 space-y-2">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Select value={it.produtoId} onChange={(e) => onSelectProduct(it.id, e.target.value)} className="col-span-2">
                  <option value="">Selecionar produto…</option>
                  {data.products.map((p) => <option key={p.id} value={p.id}>{p.nome}</option>)}
                </Select>
                <TextInput type="number" step="0.01" placeholder="Qtd" value={it.quantidade} onChange={(e) => updateItem(it.id, { quantidade: e.target.value })} />
                <Select value={it.unidade} onChange={(e) => updateItem(it.id, { unidade: e.target.value })}>
                  {YIELD_UNITS.map((u) => <option key={u}>{u}</option>)}
                </Select>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 items-center">
                <TextInput type="number" step="0.01" placeholder="Preço unitário €" value={it.precoUnitario} onChange={(e) => updateItem(it.id, { precoUnitario: e.target.value })} />
                <TextInput type="number" step="0.01" placeholder="Custo manual (opcional)" value={it.custoManual ?? ""} onChange={(e) => updateItem(it.id, { custoManual: e.target.value === "" ? null : e.target.value })} />
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs">
                    <div>Custo: <b>{fmtEUR(c.custoFinal)}</b></div>
                    <AutoManualTag manual={it.custoManual != null && it.custoManual !== ""} />
                  </div>
                  <button onClick={() => removeItem(it.id)} className="text-[#B4463E] p-1"><Trash2 size={15} /></button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-semibold text-[#3A2A33]">Custos adicionais (embalagem, entrega, mão de obra…)</span>
        <Btn size="sm" variant="secondary" onClick={addCusto}><Plus size={13} /> Adicionar</Btn>
      </div>
      <div className="space-y-2 mb-3">
        {(o.custosAdicionais || []).map((c) => (
          <div key={c.id} className="flex gap-2">
            <TextInput placeholder="Nome" value={c.nome} onChange={(e) => updateCusto(c.id, { nome: e.target.value })} />
            <TextInput type="number" step="0.01" placeholder="Valor €" value={c.valor} onChange={(e) => updateCusto(c.id, { valor: e.target.value })} className="w-32" />
            <button onClick={() => removeCusto(c.id)} className="text-[#B4463E] p-2"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Field label="Desconto (€)"><TextInput type="number" step="0.01" value={o.desconto} onChange={(e) => patch({ desconto: e.target.value })} /></Field>
        <Field label="Taxa de entrega (€)"><TextInput type="number" step="0.01" value={o.taxaEntrega} onChange={(e) => patch({ taxaEntrega: e.target.value })} /></Field>
        <Field label="Valor já pago (€)"><TextInput type="number" step="0.01" value={o.valorPago} onChange={(e) => patch({ valorPago: e.target.value })} /></Field>
        <Field label="Forma de pagamento">
          <Select value={o.formaPagamento} onChange={(e) => patch({ formaPagamento: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select>
        </Field>
        <Field label="Status do pagamento">
          <Select value={o.statusPagamento} onChange={(e) => patch({ statusPagamento: e.target.value })}>{PAYMENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
        </Field>
        <Field label="Status da encomenda">
          <Select value={o.status} onChange={(e) => patch({ status: e.target.value })}>{ORDER_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
        </Field>
      </div>
      <Field label="Observações"><TextArea value={o.observacoes} onChange={(e) => patch({ observacoes: e.target.value })} /></Field>

      <div className="mt-3">
        <Field label="Custo total manual (substitui o cálculo automático da encomenda inteira)">
          <TextInput type="number" step="0.01" placeholder="Deixe vazio para cálculo automático" value={o.custoManualTotal ?? ""} onChange={(e) => patch({ custoManualTotal: e.target.value === "" ? null : e.target.value })} />
        </Field>
        {o.custoManualTotal != null && o.custoManualTotal !== "" && (
          <button onClick={() => patch({ custoManualTotal: null })} className="text-xs text-[#C97B84] flex items-center gap-1 mb-2"><RotateCcw size={12} /> Restaurar cálculo automático</button>
        )}
      </div>

      <div className="bg-[#FBF7F5] rounded-xl p-3 text-sm space-y-1 mt-2">
        <div className="flex justify-between"><span>Valor dos produtos</span><b>{fmtEUR(computed.valorProdutos)}</b></div>
        <div className="flex justify-between"><span>Desconto</span><b>-{fmtEUR(o.desconto)}</b></div>
        <div className="flex justify-between"><span>Taxa de entrega</span><b>+{fmtEUR(o.taxaEntrega)}</b></div>
        <div className="flex justify-between border-t border-[#EEE3E0] pt-1"><span>Valor total</span><b>{fmtEUR(computed.valorTotal)}</b></div>
        <div className="flex justify-between"><span>Custo dos itens</span><b>{fmtEUR(computed.custoItens)}</b></div>
        <div className="flex justify-between"><span>Custos adicionais</span><b>{fmtEUR(computed.custoAdicionais)}</b></div>
        <div className="flex justify-between"><span>Custo total</span><b>{fmtEUR(computed.custoTotal)}</b></div>
        <AutoManualTag manual={isManualOrder(o)} />
        <div className="flex justify-between font-semibold text-[#3F7A4C]"><span>Lucro</span><span>{fmtEUR(computed.lucro)}</span></div>
        <div className="flex justify-between"><span>Margem de lucro</span><b>{fmtPct(computed.margem)}</b></div>
        <div className="flex justify-between border-t border-[#EEE3E0] pt-1"><span>Valor restante a receber</span><b>{fmtEUR(valorRestante)}</b></div>
      </div>
    </Modal>
  );
}

/* =========================================================================
   PRODUTOS
========================================================================= */
function emptyProduct() {
  return { nome: "", categoria: PRODUCT_CATEGORIES[0], descricao: "", preco: 0, receitaId: "", custoManual: null, disponivel: true, observacoes: "" };
}

function ProductsPage({ ctx }) {
  const { data, add, update, remove, notify } = ctx;
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const [cat, setCat] = useState("");

  const filtered = data.products.filter((p) => (!cat || p.categoria === cat) && p.nome.toLowerCase().includes(search.toLowerCase()));

  const save = (p) => {
    if (modal.mode === "new") { add("products", p); notify("Produto criado."); } else { update("products", p.id, p); notify("Produto atualizado."); }
    setModal(null);
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="font-serif text-2xl text-[#3A2A33]">Produtos</h1><p className="text-sm text-[#8A6B72]">{data.products.length} produto(s) no catálogo</p></div>
        <Btn onClick={() => setModal({ mode: "new", product: emptyProduct() })}><Plus size={16} /> Novo produto</Btn>
      </header>
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[180px]">
          <Search size={15} className="absolute left-3 top-2.5 text-[#B6A0A5]" />
          <TextInput className="pl-8" placeholder="Pesquisar produto…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
        <Select value={cat} onChange={(e) => setCat(e.target.value)} className="max-w-[200px]"><option value="">Todas as categorias</option>{PRODUCT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={CakeSlice} title="Nenhum produto" description="Adicione produtos ao catálogo e vincule fichas técnicas." actionLabel="Novo produto" onAction={() => setModal({ mode: "new", product: emptyProduct() })} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((p) => {
            const recipe = data.recipes.find((r) => r.id === p.receitaId);
            const cost = p.custoManual != null && p.custoManual !== "" ? numOr0(p.custoManual) : recipe ? computeRecipeCost(recipe, data.ingredients).custoTotal : 0;
            const margem = numOr0(p.preco) > 0 ? ((numOr0(p.preco) - cost) / numOr0(p.preco)) * 100 : 0;
            return (
              <div key={p.id} className="bg-white border border-[#EEE3E0] rounded-2xl p-4">
                <div className="flex items-start justify-between mb-1">
                  <div>
                    <div className="font-medium text-[#3A2A33]">{p.nome}</div>
                    <Badge>{p.categoria}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <Btn size="sm" variant="ghost" onClick={() => setModal({ mode: "edit", product: p })}><Pencil size={14} /></Btn>
                    <Btn size="sm" variant="danger" onClick={() => { if (confirmDelete()) { remove("products", p.id); notify("Produto eliminado."); } }}><Trash2 size={14} /></Btn>
                  </div>
                </div>
                {p.descricao && <p className="text-xs text-[#8A6B72] mb-2">{p.descricao}</p>}
                <div className="text-sm space-y-0.5">
                  <div className="flex justify-between"><span className="text-[#8A6B72]">Preço de venda</span><b>{fmtEUR(p.preco)}</b></div>
                  <div className="flex justify-between"><span className="text-[#8A6B72]">Custo</span><b>{fmtEUR(cost)}</b></div>
                  <div className="flex justify-between"><span className="text-[#8A6B72]">Margem</span><b className={margem >= 0 ? "text-[#3F7A4C]" : "text-[#B4463E]"}>{fmtPct(margem)}</b></div>
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-xs text-[#8A6B72]">{recipe ? `Ficha: ${recipe.nome}` : "Sem ficha técnica"}</span>
                  {!p.disponivel && <Badge tone="danger">Indisponível</Badge>}
                </div>
              </div>
            );
          })}
        </div>
      )}
      {modal && <ProductModal ctx={ctx} product={modal.product} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}

function ProductModal({ ctx, product, onClose, onSave }) {
  const { data } = ctx;
  const [p, setP] = useState(product);
  const patch = (x) => setP((v) => ({ ...v, ...x }));
  const recipe = data.recipes.find((r) => r.id === p.receitaId);
  const autoCost = recipe ? computeRecipeCost(recipe, data.ingredients).custoTotal : 0;

  return (
    <Modal title={product.nome ? "Editar produto" : "Novo produto"} onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancelar</Btn><Btn onClick={() => onSave(p)}><Save size={15}/> Guardar</Btn></>}>
      <Field label="Nome"><TextInput value={p.nome} onChange={(e) => patch({ nome: e.target.value })} /></Field>
      <Field label="Categoria"><Select value={p.categoria} onChange={(e) => patch({ categoria: e.target.value })}>{PRODUCT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
      <Field label="Descrição"><TextArea value={p.descricao} onChange={(e) => patch({ descricao: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Preço de venda (€)"><TextInput type="number" step="0.01" value={p.preco} onChange={(e) => patch({ preco: e.target.value })} /></Field>
        <Field label="Ficha técnica vinculada">
          <Select value={p.receitaId} onChange={(e) => patch({ receitaId: e.target.value })}>
            <option value="">Nenhuma</option>
            {data.recipes.map((r) => <option key={r.id} value={r.id}>{r.nome}</option>)}
          </Select>
        </Field>
      </div>
      <Field label={`Custo de produção (automático: ${fmtEUR(autoCost)})`}>
        <TextInput type="number" step="0.01" placeholder="Deixe vazio para usar o custo da ficha técnica" value={p.custoManual ?? ""} onChange={(e) => patch({ custoManual: e.target.value === "" ? null : e.target.value })} />
      </Field>
      <AutoManualTag manual={p.custoManual != null && p.custoManual !== ""} />
      <label className="flex items-center gap-2 mt-3 text-sm"><input type="checkbox" checked={p.disponivel} onChange={(e) => patch({ disponivel: e.target.checked })} /> Disponível</label>
      <Field label="Observações"><TextArea value={p.observacoes} onChange={(e) => patch({ observacoes: e.target.value })} /></Field>
    </Modal>
  );
}

/* =========================================================================
   INGREDIENTES
========================================================================= */
function emptyIngredient() {
  return { nome: "", categoria: INGREDIENT_CATEGORIES[0], unidadeCompra: "kg", quantidadeComprada: 1, valorPago: 0, fornecedor: "", dataCompra: todayISO(), observacoes: "" };
}

function IngredientsPage({ ctx }) {
  const { data, add, update, remove, notify } = ctx;
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");

  const filtered = data.ingredients.filter((i) => i.nome.toLowerCase().includes(search.toLowerCase()));
  const save = (i) => { if (modal.mode === "new") { add("ingredients", i); notify("Ingrediente criado."); } else { update("ingredients", i.id, i); notify("Ingrediente atualizado."); } setModal(null); };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="font-serif text-2xl text-[#3A2A33]">Ingredientes e materiais</h1><p className="text-sm text-[#8A6B72]">{data.ingredients.length} item(ns) cadastrados</p></div>
        <Btn onClick={() => setModal({ mode: "new", ingredient: emptyIngredient() })}><Plus size={16}/> Novo item</Btn>
      </header>
      <TextInput placeholder="Pesquisar…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {filtered.length === 0 ? (
        <EmptyState icon={Wheat} title="Nenhum ingrediente" description="Cadastre ingredientes e materiais para usar nas receitas." actionLabel="Novo item" onAction={() => setModal({ mode: "new", ingredient: emptyIngredient() })} />
      ) : (
        <div className="bg-white border border-[#EEE3E0] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#FBF7F5] text-[#8A6B72] text-xs">
              <tr><th className="text-left px-3 py-2">Nome</th><th className="text-left px-3 py-2">Categoria</th><th className="text-left px-3 py-2">Compra</th><th className="text-left px-3 py-2">Custo unitário</th><th className="text-right px-3 py-2">Ações</th></tr>
            </thead>
            <tbody>
              {filtered.map((i) => (
                <tr key={i.id} className="border-t border-[#F3E9E7]">
                  <td className="px-3 py-2 font-medium text-[#3A2A33]">{i.nome}</td>
                  <td className="px-3 py-2"><Badge>{i.categoria}</Badge></td>
                  <td className="px-3 py-2 text-[#8A6B72]">{i.quantidadeComprada} {i.unidadeCompra} · {fmtEUR(i.valorPago)}</td>
                  <td className="px-3 py-2 text-[#8A6B72]">{fmtEUR(ingredientUnitCost(i))} / {baseUnitOf(i.unidadeCompra)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Btn size="sm" variant="ghost" onClick={() => setModal({ mode: "edit", ingredient: i })}><Pencil size={14}/></Btn>
                    <Btn size="sm" variant="danger" onClick={() => { if (confirmDelete()) { remove("ingredients", i.id); notify("Ingrediente eliminado."); } }}><Trash2 size={14}/></Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <IngredientModal ingredient={modal.ingredient} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}

function IngredientModal({ ingredient, onClose, onSave }) {
  const [i, setI] = useState(ingredient);
  const patch = (x) => setI((v) => ({ ...v, ...x }));
  const unitCost = ingredientUnitCost(i);
  return (
    <Modal title={ingredient.nome ? "Editar item" : "Novo item"} onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancelar</Btn><Btn onClick={() => onSave(i)}><Save size={15}/> Guardar</Btn></>}>
      <Field label="Nome"><TextInput value={i.nome} onChange={(e) => patch({ nome: e.target.value })} /></Field>
      <Field label="Categoria"><Select value={i.categoria} onChange={(e) => patch({ categoria: e.target.value })}>{INGREDIENT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
      <div className="grid grid-cols-3 gap-2">
        <Field label="Qtd comprada"><TextInput type="number" step="0.01" value={i.quantidadeComprada} onChange={(e) => patch({ quantidadeComprada: e.target.value })} /></Field>
        <Field label="Unidade"><Select value={i.unidadeCompra} onChange={(e) => patch({ unidadeCompra: e.target.value })}>{PURCHASE_UNITS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
        <Field label="Valor pago (€)"><TextInput type="number" step="0.01" value={i.valorPago} onChange={(e) => patch({ valorPago: e.target.value })} /></Field>
      </div>
      <div className="text-xs text-[#8A6B72] bg-[#FBF7F5] rounded-lg px-3 py-2 mb-3">Custo calculado: <b>{fmtEUR(unitCost)}</b> por {baseUnitOf(i.unidadeCompra)}</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Fornecedor"><TextInput value={i.fornecedor} onChange={(e) => patch({ fornecedor: e.target.value })} /></Field>
        <Field label="Data da compra"><TextInput type="date" value={i.dataCompra} onChange={(e) => patch({ dataCompra: e.target.value })} /></Field>
      </div>
      <Field label="Observações"><TextArea value={i.observacoes} onChange={(e) => patch({ observacoes: e.target.value })} /></Field>
    </Modal>
  );
}

/* =========================================================================
   RECEITAS E FICHAS TÉCNICAS
========================================================================= */
function emptyRecipe() {
  return { nome: "", categoria: RECIPE_CATEGORIES[0], descricao: "", ingredientes: [], componentesExtras: [], rendimentoQtd: 1, rendimentoUnidade: "unidade", observacoes: "" };
}

function RecipesPage({ ctx }) {
  const { data, add, update, remove, notify } = ctx;
  const [modal, setModal] = useState(null);
  const [search, setSearch] = useState("");
  const filtered = data.recipes.filter((r) => r.nome.toLowerCase().includes(search.toLowerCase()));
  const save = (r) => { if (modal.mode === "new") { add("recipes", r); notify("Receita criada."); } else { update("recipes", r.id, r); notify("Receita atualizada."); } setModal(null); };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="font-serif text-2xl text-[#3A2A33]">Receitas e fichas técnicas</h1><p className="text-sm text-[#8A6B72]">{data.recipes.length} receita(s)</p></div>
        <Btn onClick={() => setModal({ mode: "new", recipe: emptyRecipe() })}><Plus size={16}/> Nova receita</Btn>
      </header>
      <TextInput placeholder="Pesquisar…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {filtered.length === 0 ? (
        <EmptyState icon={NotebookText} title="Nenhuma receita" description="Crie fichas técnicas com ingredientes, componentes e rendimento." actionLabel="Nova receita" onAction={() => setModal({ mode: "new", recipe: emptyRecipe() })} />
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {filtered.map((r) => {
            const c = computeRecipeCost(r, data.ingredients);
            return (
              <div key={r.id} className="bg-white border border-[#EEE3E0] rounded-2xl p-4">
                <div className="flex justify-between items-start mb-1">
                  <div><div className="font-medium text-[#3A2A33]">{r.nome}</div><Badge>{r.categoria}</Badge></div>
                  <div className="flex gap-1">
                    <Btn size="sm" variant="ghost" onClick={() => setModal({ mode: "edit", recipe: r })}><Pencil size={14}/></Btn>
                    <Btn size="sm" variant="danger" onClick={() => { if (confirmDelete()) { remove("recipes", r.id); notify("Receita eliminada."); } }}><Trash2 size={14}/></Btn>
                  </div>
                </div>
                <div className="text-sm text-[#8A6B72] space-y-0.5 mt-2">
                  <div className="flex justify-between"><span>Rendimento</span><b className="text-[#3A2A33]">{r.rendimentoQtd} {r.rendimentoUnidade}</b></div>
                  <div className="flex justify-between"><span>Custo ingredientes</span><b className="text-[#3A2A33]">{fmtEUR(c.custoIngredientes)}</b></div>
                  <div className="flex justify-between"><span>Custo componentes</span><b className="text-[#3A2A33]">{fmtEUR(c.custoComponentes)}</b></div>
                  <div className="flex justify-between border-t border-[#F3E9E7] pt-1"><span>Custo total</span><b className="text-[#3A2A33]">{fmtEUR(c.custoTotal)}</b></div>
                  <div className="flex justify-between"><span>Custo por {baseUnitOf(r.rendimentoUnidade)}</span><b className="text-[#3A2A33]">{fmtEUR(c.custoPorBase)}</b></div>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {modal && <RecipeModal ctx={ctx} recipe={modal.recipe} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}

function RecipeModal({ ctx, recipe, onClose, onSave }) {
  const { data } = ctx;
  const [r, setR] = useState(recipe);
  const patch = (x) => setR((v) => ({ ...v, ...x }));
  const [simQtd, setSimQtd] = useState(recipe.rendimentoQtd || 1);
  const [simUnidade, setSimUnidade] = useState(recipe.rendimentoUnidade || "unidade");

  const addIng = () => patch({ ingredientes: [...(r.ingredientes || []), { id: uid(), ingredienteId: "", quantidade: 0, unidade: "g", custoManual: null }] });
  const updIng = (id, p) => patch({ ingredientes: r.ingredientes.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const rmIng = (id) => patch({ ingredientes: r.ingredientes.filter((x) => x.id !== id) });

  const addComp = () => patch({ componentesExtras: [...(r.componentesExtras || []), { id: uid(), tipo: COMPONENT_TYPES[0], nome: "", custo: 0 }] });
  const updComp = (id, p) => patch({ componentesExtras: r.componentesExtras.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  const rmComp = (id) => patch({ componentesExtras: r.componentesExtras.filter((x) => x.id !== id) });

  const cost = computeRecipeCost(r, data.ingredients);
  const sim = scaledRecipeCost(r, data.ingredients, simQtd, simUnidade);

  return (
    <Modal title={recipe.nome ? "Editar receita" : "Nova receita"} onClose={onClose} wide
      footer={<><Btn variant="secondary" onClick={onClose}>Cancelar</Btn><Btn onClick={() => onSave(r)}><Save size={15}/> Guardar</Btn></>}>
      <div className="grid md:grid-cols-2 gap-3">
        <Field label="Nome"><TextInput value={r.nome} onChange={(e) => patch({ nome: e.target.value })} /></Field>
        <Field label="Categoria"><Select value={r.categoria} onChange={(e) => patch({ categoria: e.target.value })}>{RECIPE_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select></Field>
      </div>
      <Field label="Descrição"><TextArea value={r.descricao} onChange={(e) => patch({ descricao: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Rendimento (quantidade)"><TextInput type="number" step="0.01" value={r.rendimentoQtd} onChange={(e) => patch({ rendimentoQtd: e.target.value })} /></Field>
        <Field label="Unidade do rendimento"><Select value={r.rendimentoUnidade} onChange={(e) => patch({ rendimentoUnidade: e.target.value })}>{YIELD_UNITS.map((u) => <option key={u}>{u}</option>)}</Select></Field>
      </div>

      <div className="flex items-center justify-between mb-1 mt-2">
        <span className="text-xs font-semibold text-[#3A2A33]">Ingredientes</span>
        <Btn size="sm" variant="secondary" onClick={addIng}><Plus size={13}/> Adicionar ingrediente</Btn>
      </div>
      <div className="space-y-2 mb-3">
        {(r.ingredientes || []).map((it) => {
          const ing = data.ingredients.find((x) => x.id === it.ingredienteId);
          const custoLinha = it.custoManual != null && it.custoManual !== "" ? numOr0(it.custoManual) : (ing ? toBaseQty(it.quantidade, it.unidade) * ingredientUnitCost(ing) : 0);
          return (
            <div key={it.id} className="grid grid-cols-2 md:grid-cols-6 gap-2 items-center border border-[#EEE3E0] rounded-xl p-2">
              <Select className="col-span-2" value={it.ingredienteId} onChange={(e) => updIng(it.id, { ingredienteId: e.target.value })}>
                <option value="">Selecionar ingrediente…</option>
                {data.ingredients.map((ig) => <option key={ig.id} value={ig.id}>{ig.nome}</option>)}
              </Select>
              <TextInput type="number" step="0.01" placeholder="Qtd" value={it.quantidade} onChange={(e) => updIng(it.id, { quantidade: e.target.value })} />
              <Select value={it.unidade} onChange={(e) => updIng(it.id, { unidade: e.target.value })}>{PURCHASE_UNITS.map((u) => <option key={u}>{u}</option>)}</Select>
              <div className="text-xs text-[#8A6B72]">{fmtEUR(custoLinha)}</div>
              <button onClick={() => rmIng(it.id)} className="text-[#B4463E] justify-self-end p-1"><Trash2 size={14}/></button>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-semibold text-[#3A2A33]">Componentes (massa, recheio, cobertura, embalagem…)</span>
        <Btn size="sm" variant="secondary" onClick={addComp}><Plus size={13}/> Adicionar componente</Btn>
      </div>
      <div className="space-y-2 mb-3">
        {(r.componentesExtras || []).map((c) => (
          <div key={c.id} className="grid grid-cols-2 md:grid-cols-4 gap-2 items-center border border-[#EEE3E0] rounded-xl p-2">
            <Select value={c.tipo} onChange={(e) => updComp(c.id, { tipo: e.target.value })}>{COMPONENT_TYPES.map((t) => <option key={t}>{t}</option>)}</Select>
            <TextInput placeholder="Nome (ex: Ganache)" value={c.nome} onChange={(e) => updComp(c.id, { nome: e.target.value })} />
            <TextInput type="number" step="0.01" placeholder="Custo €" value={c.custo} onChange={(e) => updComp(c.id, { custo: e.target.value })} />
            <button onClick={() => rmComp(c.id)} className="text-[#B4463E] justify-self-end p-1"><Trash2 size={14}/></button>
          </div>
        ))}
      </div>

      <div className="bg-[#FBF7F5] rounded-xl p-3 text-sm space-y-1 mb-3">
        <div className="flex justify-between"><span>Custo dos ingredientes</span><b>{fmtEUR(cost.custoIngredientes)}</b></div>
        <div className="flex justify-between"><span>Custo dos componentes</span><b>{fmtEUR(cost.custoComponentes)}</b></div>
        <div className="flex justify-between border-t border-[#EEE3E0] pt-1"><span>Custo total (rendimento padrão)</span><b>{fmtEUR(cost.custoTotal)}</b></div>
        <div className="flex justify-between"><span>Custo por {baseUnitOf(r.rendimentoUnidade)}</span><b>{fmtEUR(cost.custoPorBase)}</b></div>
      </div>

      <div className="border border-dashed border-[#E4D3D0] rounded-xl p-3">
        <div className="text-xs font-semibold text-[#3A2A33] mb-2">Simular quantidade diferente (ex: bolo de 3kg em vez do rendimento padrão)</div>
        <div className="flex gap-2 items-center">
          <TextInput type="number" step="0.01" value={simQtd} onChange={(e) => setSimQtd(e.target.value)} className="w-24" />
          <Select value={simUnidade} onChange={(e) => setSimUnidade(e.target.value)} className="w-28">{YIELD_UNITS.map((u) => <option key={u}>{u}</option>)}</Select>
          <span className="text-sm text-[#8A6B72]">→ custo estimado: <b className="text-[#3A2A33]">{fmtEUR(sim.custoEscalado)}</b></span>
        </div>
      </div>
      <Field label="Observações"><TextArea value={r.observacoes} onChange={(e) => patch({ observacoes: e.target.value })} /></Field>
    </Modal>
  );
}

/* =========================================================================
   CLIENTES
========================================================================= */
function emptyClient() { return { nome: "", telefone: "", email: "", nascimento: "", morada: "", observacoes: "" }; }

function ClientsPage({ ctx }) {
  const { data, add, update, remove, notify } = ctx;
  const [modal, setModal] = useState(null);
  const [detail, setDetail] = useState(null);
  const [search, setSearch] = useState("");
  const filtered = data.clients.filter((c) => c.nome.toLowerCase().includes(search.toLowerCase()));
  const save = (c) => { if (modal.mode === "new") { add("clients", c); notify("Cliente criado."); } else { update("clients", c.id, c); notify("Cliente atualizado."); } setModal(null); };

  const clientStats = (clientId) => {
    const orders = data.orders.filter((o) => o.clienteId === clientId && o.status !== "Cancelada");
    let total = 0;
    orders.forEach((o) => { total += computeOrder(o, data.products, data.recipes, data.ingredients).valorTotal; });
    return { n: orders.length, total, orders };
  };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="font-serif text-2xl text-[#3A2A33]">Clientes</h1><p className="text-sm text-[#8A6B72]">{data.clients.length} cliente(s)</p></div>
        <Btn onClick={() => setModal({ mode: "new", client: emptyClient() })}><Plus size={16}/> Novo cliente</Btn>
      </header>
      <TextInput placeholder="Pesquisar cliente…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {filtered.length === 0 ? (
        <EmptyState icon={Users} title="Nenhum cliente" description="Cadastre clientes para acompanhar o histórico de encomendas." actionLabel="Novo cliente" onAction={() => setModal({ mode: "new", client: emptyClient() })} />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((c) => {
            const s = clientStats(c.id);
            return (
              <div key={c.id} className="bg-white border border-[#EEE3E0] rounded-2xl p-4 cursor-pointer" onClick={() => setDetail(c)}>
                <div className="flex justify-between items-start">
                  <div className="font-medium text-[#3A2A33]">{c.nome}</div>
                  <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                    <Btn size="sm" variant="ghost" onClick={() => setModal({ mode: "edit", client: c })}><Pencil size={14}/></Btn>
                    <Btn size="sm" variant="danger" onClick={() => { if (confirmDelete()) { remove("clients", c.id); notify("Cliente eliminado."); } }}><Trash2 size={14}/></Btn>
                  </div>
                </div>
                <div className="text-xs text-[#8A6B72] mt-1">{c.telefone}</div>
                <div className="flex justify-between text-sm mt-2 pt-2 border-t border-[#F3E9E7]">
                  <span className="text-[#8A6B72]">{s.n} encomenda(s)</span>
                  <b>{fmtEUR(s.total)}</b>
                </div>
              </div>
            );
          })}
        </div>
      )}
      {modal && <ClientModal client={modal.client} onClose={() => setModal(null)} onSave={save} />}
      {detail && (() => {
        const s = clientStats(detail.id);
        return (
          <Modal title={detail.nome} onClose={() => setDetail(null)}>
            <div className="text-sm text-[#8A6B72] space-y-1 mb-3">
              <div>{detail.telefone} {detail.email && `· ${detail.email}`}</div>
              {detail.morada && <div>{detail.morada}</div>}
              {detail.observacoes && <div className="italic">{detail.observacoes}</div>}
            </div>
            <div className="grid grid-cols-2 gap-2 mb-3">
              <StatCard label="Total gasto" value={fmtEUR(s.total)} />
              <StatCard label="Encomendas" value={s.n} />
            </div>
            <div className="text-xs font-semibold text-[#3A2A33] mb-1">Histórico</div>
            <div className="space-y-1.5 max-h-56 overflow-y-auto">
              {s.orders.length === 0 && <div className="text-xs text-[#B6A0A5]">Sem encomendas.</div>}
              {s.orders.map((o) => {
                const c = computeOrder(o, data.products, data.recipes, data.ingredients);
                return <div key={o.id} className="flex justify-between text-sm bg-[#FBF7F5] rounded-lg px-2.5 py-1.5"><span>{fmtDate(o.dataEntrega)}</span><Badge tone={orderStatusTone(o.status)}>{o.status}</Badge><b>{fmtEUR(c.valorTotal)}</b></div>;
              })}
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

function ClientModal({ client, onClose, onSave }) {
  const [c, setC] = useState(client);
  const patch = (x) => setC((v) => ({ ...v, ...x }));
  return (
    <Modal title={client.nome ? "Editar cliente" : "Novo cliente"} onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancelar</Btn><Btn onClick={() => onSave(c)}><Save size={15}/> Guardar</Btn></>}>
      <Field label="Nome"><TextInput value={c.nome} onChange={(e) => patch({ nome: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Telefone"><TextInput value={c.telefone} onChange={(e) => patch({ telefone: e.target.value })} /></Field>
        <Field label="E-mail"><TextInput value={c.email} onChange={(e) => patch({ email: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Data de nascimento (opcional)"><TextInput type="date" value={c.nascimento} onChange={(e) => patch({ nascimento: e.target.value })} /></Field>
        <Field label="Morada (opcional)"><TextInput value={c.morada} onChange={(e) => patch({ morada: e.target.value })} /></Field>
      </div>
      <Field label="Observações"><TextArea value={c.observacoes} onChange={(e) => patch({ observacoes: e.target.value })} /></Field>
    </Modal>
  );
}

/* =========================================================================
   FINANCEIRO
========================================================================= */
function emptyFinance() { return { tipo: "despesa", descricao: "", categoria: FIN_EXPENSE_CATS[0], valor: 0, data: todayISO(), formaPagamento: "Dinheiro", observacoes: "" }; }

function FinancePage({ ctx }) {
  const { data, add, update, remove, notify } = ctx;
  const [modal, setModal] = useState(null);
  const [tab, setTab] = useState("todos");
  const pf = usePeriodFilter();
  useEffect(() => { pf.setAllTime(true); }, []); // eslint-disable-line

  const entries = data.finance.filter((f) => (tab === "todos" || f.tipo === tab) && pf.matches(f.data)).sort((a, b) => b.data.localeCompare(a.data));

  const ingredientPurchases = data.ingredients.filter((i) => pf.matches(i.dataCompra));
  const deliveredOrders = data.orders.filter((o) => o.status === "Entregue" && pf.matches(o.dataEntrega));

  const receitaVendas = deliveredOrders.reduce((s, o) => s + computeOrder(o, data.products, data.recipes, data.ingredients).valorTotal, 0);
  const outrasReceitas = data.finance.filter((f) => f.tipo === "receita" && pf.matches(f.data)).reduce((s, f) => s + numOr0(f.valor), 0);
  const despesasManuais = data.finance.filter((f) => f.tipo === "despesa" && pf.matches(f.data)).reduce((s, f) => s + numOr0(f.valor), 0);
  const comprasIngredientes = ingredientPurchases.reduce((s, i) => s + numOr0(i.valorPago), 0);
  const custoProducao = deliveredOrders.reduce((s, o) => s + computeOrder(o, data.products, data.recipes, data.ingredients).custoTotal, 0);
  const receitaBruta = receitaVendas + outrasReceitas;
  const despesasTotais = despesasManuais + comprasIngredientes;
  const lucro = receitaBruta - custoProducao - despesasManuais; // custo de produção já cobre ingredientes usados; despesas manuais cobrem o resto
  const margem = receitaBruta > 0 ? (lucro / receitaBruta) * 100 : 0;
  const pendente = data.orders.filter((o) => o.status !== "Cancelada" && pf.matches(o.dataEntrega)).reduce((s, o) => s + Math.max(computeOrder(o, data.products, data.recipes, data.ingredients).valorRestante, 0), 0);

  const save = (f) => { if (modal.mode === "new") { add("finance", f); notify("Lançamento criado."); } else { update("finance", f.id, f); notify("Lançamento atualizado."); } setModal(null); };

  return (
    <div className="space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-2">
        <div><h1 className="font-serif text-2xl text-[#3A2A33]">Financeiro</h1><p className="text-sm text-[#8A6B72]">Receitas, despesas e lucro</p></div>
        <Btn onClick={() => setModal({ mode: "new", entry: emptyFinance() })}><Plus size={16}/> Novo lançamento</Btn>
      </header>

      <PeriodFilterBar pf={pf} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Receita bruta" value={fmtEUR(receitaBruta)} icon={TrendingUp} />
        <StatCard label="Custos de produção" value={fmtEUR(custoProducao)} icon={Wheat} />
        <StatCard label="Despesas" value={fmtEUR(despesasTotais)} icon={TrendingDown} />
        <StatCard label="Lucro" value={fmtEUR(lucro)} tone={lucro >= 0 ? "good" : "bad"} />
        <StatCard label="Margem de lucro" value={fmtPct(margem)} tone={margem >= 0 ? "good" : "bad"} />
        <StatCard label="Valores pendentes" value={fmtEUR(pendente)} />
        <StatCard label="Compras de ingredientes" value={fmtEUR(comprasIngredientes)} />
        <StatCard label="Outros recebimentos" value={fmtEUR(outrasReceitas)} />
      </div>

      <div className="flex gap-2">
        {[["todos","Todos"],["receita","Receitas"],["despesa","Despesas"]].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded-full text-sm font-medium ${tab === k ? "bg-[#C97B84] text-white" : "bg-white border border-[#E4D3D0] text-[#8A6B72]"}`}>{l}</button>
        ))}
      </div>

      {entries.length === 0 ? (
        <EmptyState icon={Wallet} title="Nenhum lançamento" description="Registe receitas e despesas manuais. Compras de ingredientes contam automaticamente como despesa." actionLabel="Novo lançamento" onAction={() => setModal({ mode: "new", entry: emptyFinance() })} />
      ) : (
        <div className="bg-white border border-[#EEE3E0] rounded-2xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-[#FBF7F5] text-[#8A6B72] text-xs"><tr><th className="text-left px-3 py-2">Data</th><th className="text-left px-3 py-2">Descrição</th><th className="text-left px-3 py-2">Categoria</th><th className="text-right px-3 py-2">Valor</th><th className="text-right px-3 py-2">Ações</th></tr></thead>
            <tbody>
              {entries.map((f) => (
                <tr key={f.id} className="border-t border-[#F3E9E7]">
                  <td className="px-3 py-2">{fmtDate(f.data)}</td>
                  <td className="px-3 py-2">{f.descricao}</td>
                  <td className="px-3 py-2"><Badge tone={f.tipo === "receita" ? "success" : "danger"}>{f.categoria}</Badge></td>
                  <td className={`px-3 py-2 text-right font-medium ${f.tipo === "receita" ? "text-[#3F7A4C]" : "text-[#B4463E]"}`}>{f.tipo === "receita" ? "+" : "-"}{fmtEUR(f.valor)}</td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    <Btn size="sm" variant="ghost" onClick={() => setModal({ mode: "edit", entry: f })}><Pencil size={14}/></Btn>
                    <Btn size="sm" variant="danger" onClick={() => { if (confirmDelete()) { remove("finance", f.id); notify("Lançamento eliminado."); } }}><Trash2 size={14}/></Btn>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {modal && <FinanceModal entry={modal.entry} onClose={() => setModal(null)} onSave={save} />}
    </div>
  );
}

function FinanceModal({ entry, onClose, onSave }) {
  const [f, setF] = useState(entry);
  const patch = (x) => setF((v) => ({ ...v, ...x }));
  const cats = f.tipo === "receita" ? FIN_INCOME_CATS : FIN_EXPENSE_CATS;
  return (
    <Modal title={entry.descricao ? "Editar lançamento" : "Novo lançamento"} onClose={onClose}
      footer={<><Btn variant="secondary" onClick={onClose}>Cancelar</Btn><Btn onClick={() => onSave(f)}><Save size={15}/> Guardar</Btn></>}>
      <div className="flex gap-2 mb-3">
        {["despesa","receita"].map((t) => (
          <button key={t} onClick={() => patch({ tipo: t, categoria: t === "receita" ? FIN_INCOME_CATS[0] : FIN_EXPENSE_CATS[0] })}
            className={`flex-1 py-2 rounded-lg text-sm font-medium ${f.tipo === t ? (t === "receita" ? "bg-[#E4F0E5] text-[#3F7A4C]" : "bg-[#FBEAEA] text-[#B4463E]") : "bg-[#F3E9E7] text-[#8A6B72]"}`}>
            {t === "receita" ? "Receita" : "Despesa"}
          </button>
        ))}
      </div>
      <Field label="Descrição"><TextInput value={f.descricao} onChange={(e) => patch({ descricao: e.target.value })} /></Field>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Categoria"><Select value={f.categoria} onChange={(e) => patch({ categoria: e.target.value })}>{cats.map((c) => <option key={c}>{c}</option>)}</Select></Field>
        <Field label="Valor (€)"><TextInput type="number" step="0.01" value={f.valor} onChange={(e) => patch({ valor: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Data"><TextInput type="date" value={f.data} onChange={(e) => patch({ data: e.target.value })} /></Field>
        <Field label="Forma de pagamento"><Select value={f.formaPagamento} onChange={(e) => patch({ formaPagamento: e.target.value })}>{PAYMENT_METHODS.map((m) => <option key={m}>{m}</option>)}</Select></Field>
      </div>
      <Field label="Observações"><TextArea value={f.observacoes} onChange={(e) => patch({ observacoes: e.target.value })} /></Field>
    </Modal>
  );
}

/* =========================================================================
   CALENDÁRIO
========================================================================= */
function CalendarPage({ ctx }) {
  const { data } = ctx;
  const [cursor, setCursor] = useState(new Date());
  const [detail, setDetail] = useState(null);
  const year = cursor.getFullYear(), month = cursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = firstDay.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const ordersByDay = (d) => {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    return data.orders.filter((o) => o.dataEntrega === iso);
  };
  const todayIso = todayISO();

  return (
    <div className="space-y-4">
      <header><h1 className="font-serif text-2xl text-[#3A2A33]">Calendário</h1><p className="text-sm text-[#8A6B72]">Visão mensal das encomendas</p></header>
      <div className="bg-white border border-[#EEE3E0] rounded-2xl p-4">
        <div className="flex items-center justify-between mb-3">
          <button onClick={() => setCursor(new Date(year, month - 1, 1))} className="p-1.5 rounded-full hover:bg-[#F3E9E7]"><ChevronLeft size={18}/></button>
          <div className="font-serif text-lg">{MONTHS_FULL[month]} {year}</div>
          <button onClick={() => setCursor(new Date(year, month + 1, 1))} className="p-1.5 rounded-full hover:bg-[#F3E9E7]"><ChevronRight size={18}/></button>
        </div>
        <div className="grid grid-cols-7 text-center text-[11px] text-[#8A6B72] mb-1">
          {["D","S","T","Q","Q","S","S"].map((d, i) => <div key={i}>{d}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
            const orders = ordersByDay(d);
            const isToday = iso === todayIso;
            return (
              <div key={i} className={`min-h-[64px] rounded-lg p-1 border ${isToday ? "border-[#C97B84] bg-[#FBF0F1]" : "border-[#F3E9E7]"}`}>
                <div className={`text-[11px] mb-1 ${isToday ? "text-[#C97B84] font-semibold" : "text-[#8A6B72]"}`}>{d}</div>
                <div className="space-y-0.5">
                  {orders.slice(0, 2).map((o) => (
                    <button key={o.id} onClick={() => setDetail(o)} className="w-full text-left text-[10px] px-1 py-0.5 rounded bg-[#F3E9E7] truncate hover:bg-[#EAD9D6]">
                      {data.clients.find((c) => c.id === o.clienteId)?.nome || "Encomenda"}
                    </button>
                  ))}
                  {orders.length > 2 && <div className="text-[10px] text-[#B6A0A5]">+{orders.length - 2} mais</div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {detail && (() => {
        const c = computeOrder(detail, data.products, data.recipes, data.ingredients);
        const client = data.clients.find((cl) => cl.id === detail.clienteId);
        return (
          <Modal title={client?.nome || "Encomenda"} onClose={() => setDetail(null)}>
            <div className="space-y-1.5 text-sm">
              <div className="flex justify-between"><span className="text-[#8A6B72]">Data / hora</span><b>{fmtDate(detail.dataEntrega)} {detail.horario}</b></div>
              <div className="flex justify-between"><span className="text-[#8A6B72]">Status</span><Badge tone={orderStatusTone(detail.status)}>{detail.status}</Badge></div>
              <div className="flex justify-between"><span className="text-[#8A6B72]">Pagamento</span><Badge tone={paymentStatusTone(detail.statusPagamento)}>{detail.statusPagamento}</Badge></div>
              <div className="flex justify-between"><span className="text-[#8A6B72]">Valor total</span><b>{fmtEUR(c.valorTotal)}</b></div>
              <div className="text-xs text-[#8A6B72] pt-2">{(detail.itens || []).map((it) => data.products.find((p) => p.id === it.produtoId)?.nome).filter(Boolean).join(", ")}</div>
            </div>
          </Modal>
        );
      })()}
    </div>
  );
}

/* =========================================================================
   RELATÓRIOS
========================================================================= */
function ReportsPage({ ctx }) {
  const { data } = ctx;
  const pf = usePeriodFilter();
  const [filtCliente, setFiltCliente] = useState("");
  const [filtCategoria, setFiltCategoria] = useState("");
  const [filtStatus, setFiltStatus] = useState("");
  const [filtPagamento, setFiltPagamento] = useState("");

  const filtered = useMemo(() => {
    return data.orders.filter((o) => {
      if (!pf.matches(o.dataEntrega)) return false;
      if (filtCliente && o.clienteId !== filtCliente) return false;
      if (filtStatus && o.status !== filtStatus) return false;
      if (filtPagamento && o.statusPagamento !== filtPagamento) return false;
      if (filtCategoria && !(o.itens || []).some((it) => data.products.find((p) => p.id === it.produtoId)?.categoria === filtCategoria)) return false;
      return true;
    });
  }, [data.orders, data.products, pf, filtCliente, filtCategoria, filtStatus, filtPagamento]);

  const nonCancelled = filtered.filter((o) => o.status !== "Cancelada");
  const computed = nonCancelled.map((o) => computeOrder(o, data.products, data.recipes, data.ingredients));
  const faturamento = computed.reduce((s, c) => s + c.valorTotal, 0);
  const custo = computed.reduce((s, c) => s + c.custoTotal, 0);
  const lucro = faturamento - custo;
  const margem = faturamento > 0 ? (lucro / faturamento) * 100 : 0;
  const recebido = computed.reduce((s, c) => s + Math.min(numOr0(c.valorPago ?? 0), c.valorTotal), 0);
  const pendente = computed.reduce((s, c) => s + Math.max(c.valorRestante, 0), 0);
  const ticket = nonCancelled.length ? faturamento / nonCancelled.length : 0;

  const productCount = {}, categoryCount = {};
  nonCancelled.forEach((o) => (o.itens || []).forEach((it) => {
    const prod = data.products.find((p) => p.id === it.produtoId);
    if (!prod) return;
    productCount[prod.nome] = (productCount[prod.nome] || 0) + numOr0(it.quantidade);
    categoryCount[prod.categoria] = (categoryCount[prod.categoria] || 0) + numOr0(it.quantidade);
  }));
  const topProduct = Object.entries(productCount).sort((a, b) => b[1] - a[1])[0];
  const topCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0];

  const financeInPeriod = data.finance.filter((f) => pf.matches(f.data));
  const despesasFin = financeInPeriod.filter((f) => f.tipo === "despesa").reduce((s, f) => s + numOr0(f.valor), 0);

  return (
    <div className="space-y-4">
      <header><h1 className="font-serif text-2xl text-[#3A2A33]">Relatórios</h1><p className="text-sm text-[#8A6B72]">Filtre por período, cliente, produto e status</p></header>
      <PeriodFilterBar pf={pf} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Select value={filtCliente} onChange={(e) => setFiltCliente(e.target.value)}><option value="">Todos os clientes</option>{data.clients.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}</Select>
        <Select value={filtCategoria} onChange={(e) => setFiltCategoria(e.target.value)}><option value="">Todas as categorias</option>{PRODUCT_CATEGORIES.map((c) => <option key={c}>{c}</option>)}</Select>
        <Select value={filtStatus} onChange={(e) => setFiltStatus(e.target.value)}><option value="">Qualquer status</option>{ORDER_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
        <Select value={filtPagamento} onChange={(e) => setFiltPagamento(e.target.value)}><option value="">Qualquer pagamento</option>{PAYMENT_STATUSES.map((s) => <option key={s}>{s}</option>)}</Select>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard label="Faturamento" value={fmtEUR(faturamento)} />
        <StatCard label="Nº de encomendas" value={nonCancelled.length} />
        <StatCard label="Produto mais vendido" value={topProduct ? topProduct[0] : "—"} sub={topProduct ? `${topProduct[1]} unid.` : ""} />
        <StatCard label="Categoria mais vendida" value={topCategory ? topCategory[0] : "—"} />
        <StatCard label="Ticket médio" value={fmtEUR(ticket)} />
        <StatCard label="Despesas (financeiro)" value={fmtEUR(despesasFin)} />
        <StatCard label="Custo de produção" value={fmtEUR(custo)} />
        <StatCard label="Lucro" value={fmtEUR(lucro)} tone={lucro >= 0 ? "good" : "bad"} />
        <StatCard label="Margem de lucro" value={fmtPct(margem)} tone={margem >= 0 ? "good" : "bad"} />
        <StatCard label="Valores recebidos" value={fmtEUR(recebido)} />
        <StatCard label="Valores pendentes" value={fmtEUR(pendente)} />
      </div>

      <div className="bg-white border border-[#EEE3E0] rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-[#FBF7F5] text-[#8A6B72] text-xs"><tr><th className="text-left px-3 py-2">Data</th><th className="text-left px-3 py-2">Cliente</th><th className="text-left px-3 py-2">Status</th><th className="text-right px-3 py-2">Total</th><th className="text-right px-3 py-2">Lucro</th></tr></thead>
          <tbody>
            {filtered.map((o) => {
              const c = computeOrder(o, data.products, data.recipes, data.ingredients);
              const client = data.clients.find((cl) => cl.id === o.clienteId);
              return (
                <tr key={o.id} className="border-t border-[#F3E9E7]">
                  <td className="px-3 py-2">{fmtDate(o.dataEntrega)}</td>
                  <td className="px-3 py-2">{client?.nome || "—"}</td>
                  <td className="px-3 py-2"><Badge tone={orderStatusTone(o.status)}>{o.status}</Badge></td>
                  <td className="px-3 py-2 text-right">{fmtEUR(c.valorTotal)}</td>
                  <td className="px-3 py-2 text-right">{fmtEUR(c.lucro)}</td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={5} className="text-center py-6 text-[#B6A0A5]">Sem resultados para os filtros selecionados.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* =========================================================================
   CONFIGURAÇÕES
========================================================================= */
function SettingsPage({ ctx }) {
  const { data, setData, notify } = ctx;
  const [empresa, setEmpresa] = useState(data.settings.empresa);

  const saveEmpresa = () => { setData((d) => ({ ...d, settings: { ...d.settings, empresa } })); notify("Configurações guardadas."); };

  return (
    <div className="space-y-5 max-w-xl">
      <header><h1 className="font-serif text-2xl text-[#3A2A33]">Configurações</h1><p className="text-sm text-[#8A6B72]">Preferências gerais do sistema</p></header>

      <div className="bg-white border border-[#EEE3E0] rounded-2xl p-4 space-y-3">
        <Field label="Nome da empresa"><TextInput value={empresa} onChange={(e) => setEmpresa(e.target.value)} /></Field>
        <Field label="Moeda"><TextInput value="Euro (€)" disabled /></Field>
        <Btn onClick={saveEmpresa}><Save size={15}/> Guardar</Btn>
      </div>

      <div className="bg-white border border-[#EEE3E0] rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-[#3A2A33] mb-2">Categorias de produtos</h3>
        <div className="flex flex-wrap gap-1.5">{PRODUCT_CATEGORIES.map((c) => <Badge key={c}>{c}</Badge>)}</div>
      </div>
      <div className="bg-white border border-[#EEE3E0] rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-[#3A2A33] mb-2">Categorias de ingredientes</h3>
        <div className="flex flex-wrap gap-1.5">{INGREDIENT_CATEGORIES.map((c) => <Badge key={c}>{c}</Badge>)}</div>
      </div>
      <div className="bg-white border border-[#EEE3E0] rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-[#3A2A33] mb-2">Categorias financeiras</h3>
        <div className="flex flex-wrap gap-1.5">{[...FIN_INCOME_CATS, ...FIN_EXPENSE_CATS].map((c) => <Badge key={c}>{c}</Badge>)}</div>
      </div>
      <div className="bg-white border border-[#EEE3E0] rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-[#3A2A33] mb-2">Formas de pagamento</h3>
        <div className="flex flex-wrap gap-1.5">{PAYMENT_METHODS.map((c) => <Badge key={c}>{c}</Badge>)}</div>
      </div>
      <div className="bg-white border border-[#EEE3E0] rounded-2xl p-4">
        <h3 className="text-sm font-semibold text-[#3A2A33] mb-2">Status de encomendas e pagamentos</h3>
        <div className="flex flex-wrap gap-1.5 mb-2">{ORDER_STATUSES.map((c) => <Badge key={c} tone={orderStatusTone(c)}>{c}</Badge>)}</div>
        <div className="flex flex-wrap gap-1.5">{PAYMENT_STATUSES.map((c) => <Badge key={c} tone={paymentStatusTone(c)}>{c}</Badge>)}</div>
      </div>
      <p className="text-xs text-[#B6A0A5]">Os dados deste sistema ficam guardados automaticamente e continuam disponíveis da próxima vez que abrir o Cantinho Doce.</p>
    </div>
  );
}
