"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle, BadgeCheck, Bell, CalendarDays, Camera, Check, ChevronDown, CircleDollarSign,
  FileCheck2, Gauge, History, Home, ImageIcon, LockKeyhole, LogOut, Mail,
  Menu, Pencil, Plus, Power, RefreshCw, Search, Send, Settings, ShieldCheck, Sparkles, UploadCloud,
  UserCog, WalletCards, X, Zap,
} from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { DashboardData } from "@/lib/server-data";
import { formatDate, money, number } from "@/lib/format";

type Tab = "summary" | "readings" | "statements" | "payments" | "bills" | "audit" | "security" | "admin";
const roleLabels: Record<string, string> = { admin: "Administrador", reader: "Carga de información", treasurer: "Tesorero", auditor: "Auditor", resident: "Residente" };

export function Dashboard({ data, user, signOutPath }: { data: DashboardData; user: { displayName: string; email: string }; signOutPath: string }) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("summary");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [parcelOpen, setParcelOpen] = useState(false);
  const [periodOpen, setPeriodOpen] = useState(false);
  const [chargesOpen, setChargesOpen] = useState(false);
  const [ownerOpen, setOwnerOpen] = useState<NonNullable<DashboardData["admin"]>["properties"][number] | null>(null);
  const [billOpen, setBillOpen] = useState(false);
  const [adjustmentOpen, setAdjustmentOpen] = useState<DashboardData["rows"][number] | null>(null);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const canManage = ["admin", "reader"].includes(data.membership.role);
  const canCalculate = ["admin", "treasurer"].includes(data.membership.role);

  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    if (!query) return data.rows;
    return data.rows.filter((row) => row.parcelNumber.toLocaleLowerCase("es").includes(query) || row.ownerLabel.toLocaleLowerCase("es").includes(query) || row.meters.some((meter) => meter.serialNumber.toLocaleLowerCase("es").includes(query)));
  }, [data.rows, search]);

  async function recalculate() {
    setBusy(true); setNotice(null);
    try {
      const response = await fetch(`/api/periods/${data.period.id}/calculate`, { method: "POST" });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error ?? "No se pudo recalcular");
      }
      setNotice("Liquidaciones recalculadas y conciliadas correctamente."); router.refresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "No se pudo recalcular"); }
    finally { setBusy(false); }
  }

  function navigate(next: Tab) { setTab(next); setMobileMenu(false); }

  return (
    <div className="app-shell !bg-gradient-to-br !from-slate-50 !via-emerald-50/60 !to-amber-50/70">
      <aside className={`sidebar !bg-gradient-to-b !from-emerald-950 !via-emerald-900 !to-teal-950 ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="brand-block"><div className="brand-mark"><Zap size={20} fill="currentColor" /></div><div><strong>Luz Clara</strong><span>Rincón de Zapata</span></div><button className="mobile-close" onClick={() => setMobileMenu(false)} aria-label="Cerrar menú"><X /></button></div>
        <nav className="main-nav" aria-label="Navegación principal">
          <NavButton active={tab === "summary"} icon={<Home />} label="Resumen" onClick={() => navigate("summary")} />
          <NavButton active={tab === "readings"} icon={<Gauge />} label="Lecturas" badge={String(data.summary.photoCount)} onClick={() => navigate("readings")} />
          <NavButton active={tab === "statements"} icon={<WalletCards />} label="Liquidaciones" onClick={() => navigate("statements")} />
          <NavButton active={tab === "payments"} icon={<BadgeCheck />} label="Pagos" badge={String(data.summary.unpaidCount)} onClick={() => navigate("payments")} />
          {["admin", "treasurer", "auditor"].includes(data.membership.role) && <NavButton active={tab === "bills"} icon={<FileCheck2 />} label="Boletas CGE" onClick={() => navigate("bills")} />}
          {["admin", "treasurer", "auditor"].includes(data.membership.role) && <NavButton active={tab === "audit"} icon={<History />} label="Historial" onClick={() => navigate("audit")} />}
          <NavButton active={tab === "security"} icon={<ShieldCheck />} label="Seguridad" onClick={() => navigate("security")} />
          {data.membership.role === "admin" && <NavButton active={tab === "admin"} icon={<Settings />} label="Administración" onClick={() => navigate("admin")} />}
        </nav>
        <div className="sidebar-spacer" />
        <div className="sidebar-status"><span className="status-dot" /><div><strong>Sistema operativo</strong><span>Base y archivos protegidos</span></div></div>
        <a className="signout-link" href={signOutPath} target="_top"><LogOut size={17} /> Cerrar sesión</a>
      </aside>
      {mobileMenu && <button className="sidebar-backdrop" aria-label="Cerrar menú" onClick={() => setMobileMenu(false)} />}
      <main className="main-area">
        <header className="topbar !border-emerald-100 !bg-white/90 shadow-sm"><button className="menu-button" onClick={() => setMobileMenu(true)} aria-label="Abrir menú"><Menu /></button><div className="topbar-community"><span>Comunidad</span><strong>{data.community.name}</strong></div><div className="topbar-actions"><button className="icon-button !border-sky-100 !bg-sky-50 text-sky-700" aria-label="Notificaciones"><Bell size={19} /><span className="notification-dot" /></button><div className="user-chip"><span className="avatar !bg-gradient-to-br !from-emerald-100 !to-cyan-100">{user.displayName.slice(0, 2).toUpperCase()}</span><div><strong>{user.displayName}</strong><span>{roleLabels[data.membership.role] ?? data.membership.role}</span></div><ChevronDown size={16} /></div></div></header>
        <div className="content-wrap">
          {notice && <div className="toast-inline"><Check size={17} />{notice}<button onClick={() => setNotice(null)}><X size={15} /></button></div>}
          {tab === "summary" && <SummaryView data={data} rows={filteredRows} search={search} setSearch={setSearch} canManage={canManage} canCalculate={canCalculate} busy={busy} onUpload={() => setUploadOpen(true)} onCalculate={recalculate} onEditRange={() => setPeriodOpen(true)} onEditCharges={() => setChargesOpen(true)} />}
          {tab === "readings" && <ReadingsView data={data} canManage={canManage} onUpload={() => setUploadOpen(true)} />}
          {tab === "statements" && <StatementsView data={data} />}
          {tab === "payments" && <PaymentsView data={data} onAdjust={setAdjustmentOpen} onNotice={setNotice} />}
          {tab === "bills" && <BillsView data={data} onUpload={() => setBillOpen(true)} onNotice={setNotice} />}
          {tab === "audit" && <AuditView data={data} />}
          {tab === "security" && <SecurityView />}
          {tab === "admin" && data.admin && <AdminView data={data} onAddParcel={() => setParcelOpen(true)} onEditOwner={setOwnerOpen} onNotice={setNotice} />}
        </div>
      </main>
      {uploadOpen && <UploadModal data={data} onClose={() => setUploadOpen(false)} onSaved={(message) => { setUploadOpen(false); setNotice(message); router.refresh(); }} />}
      {parcelOpen && <ParcelModal data={data} onClose={() => setParcelOpen(false)} onSaved={(message) => { setParcelOpen(false); setNotice(message); router.refresh(); }} />}
      {periodOpen && <PeriodModal data={data} onClose={() => setPeriodOpen(false)} onSaved={(message) => { setPeriodOpen(false); setNotice(message); router.refresh(); }} />}
      {chargesOpen && <ChargesModal data={data} onClose={() => setChargesOpen(false)} onSaved={(message) => { setChargesOpen(false); setNotice(message); router.refresh(); }} />}
      {ownerOpen && <OwnerModal property={ownerOpen} onClose={() => setOwnerOpen(null)} onSaved={(message) => { setOwnerOpen(null); setNotice(message); router.refresh(); }} />}
      {billOpen && <BillModal data={data} onClose={() => setBillOpen(false)} onSaved={(message) => { setBillOpen(false); setNotice(message); router.refresh(); }} />}
      {adjustmentOpen && <AdjustmentModal row={adjustmentOpen} onClose={() => setAdjustmentOpen(null)} onSaved={(message) => { setAdjustmentOpen(null); setNotice(message); router.refresh(); }} />}
    </div>
  );
}

function NavButton({ active, icon, label, badge, onClick }: { active: boolean; icon: React.ReactNode; label: string; badge?: string; onClick: () => void }) {
  return <button className={active ? "nav-item active" : "nav-item"} onClick={onClick}><span>{icon}</span>{label}{badge && <em>{badge}</em>}</button>;
}

function PageHeading({ eyebrow, title, description, actions }: { eyebrow: string; title: string; description: string; actions?: React.ReactNode }) {
  return <div className="page-heading"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{description}</p></div>{actions && <div className="heading-actions">{actions}</div>}</div>;
}

function SummaryView({ data, rows, search, setSearch, canManage, canCalculate, busy, onUpload, onCalculate, onEditRange, onEditCharges }: { data: DashboardData; rows: DashboardData["rows"]; search: string; setSearch: (value: string) => void; canManage: boolean; canCalculate: boolean; busy: boolean; onUpload: () => void; onCalculate: () => void; onEditRange: () => void; onEditCharges: () => void }) {
  return <>
    <PageHeading eyebrow="Panel de electricidad" title={`Cobro ${data.period.name}`} description={`Consumo del ${formatDate(data.period.startDate)} al ${formatDate(data.period.endDate)} · vence ${formatDate(data.period.dueDate)}`} actions={<>{canCalculate && <button className="button secondary !border-amber-200 !bg-amber-50 text-amber-800" onClick={onEditCharges}><CircleDollarSign size={17} /> Valores comunes</button>}{canCalculate && <button className="button secondary !border-violet-200 !bg-violet-50 text-violet-800" onClick={onEditRange}><CalendarDays size={17} /> Rango de fechas</button>}{canCalculate && <button className="button secondary !border-sky-200 !bg-sky-50 text-sky-800" onClick={onCalculate} disabled={busy}><RefreshCw size={17} className={busy ? "spin" : ""} /> Recalcular</button>}{canManage && <button className="button primary !bg-gradient-to-r !from-emerald-600 !to-teal-600" onClick={onUpload}><Camera size={17} /> Nueva lectura</button>}</>} />
    <section className="kpi-grid">
      <KpiCard icon={<Gauge />} label="Consumo medido" value={`${number.format(data.summary.measuredKwh)} kWh`} detail={`${data.summary.readingCount} lecturas registradas`} tone="emerald" />
      <KpiCard icon={<Zap />} label="Medidor general" value={`${number.format(data.period.masterKwh)} kWh`} detail={`Diferencia: ${number.format(data.summary.differenceKwh)} kWh`} tone="navy" />
      <KpiCard icon={<CircleDollarSign />} label="Total a recaudar" value={money.format(data.summary.totalToCollect)} detail={`Boleta ${data.period.invoiceNumber}`} tone="gold" />
      <KpiCard icon={<ImageIcon />} label="Evidencias" value={`${data.summary.photoCount} fotos`} detail={data.summary.photoCount ? "Archivos privados y auditados" : "Aún faltan fotografías"} tone="violet" />
    </section>
    <div className="reconciliation-banner warning !border-orange-200 !bg-gradient-to-r !from-amber-50 !via-orange-50 !to-rose-50"><div className="banner-icon !bg-orange-100 text-orange-700"><AlertTriangle /></div><div><strong>Diferencia de conciliación: {data.summary.differencePercentage.toFixed(1).replace(".", ",")}%</strong><p>El medidor general registra {number.format(data.summary.differenceKwh)} kWh más que la suma de los remarcadores. Revisa fechas, consumos comunes y medidores sin evidencia.</p></div><span>Revisión requerida</span></div>
    <section className="dashboard-grid">
      <div className="panel chart-panel !border-cyan-200/70 !bg-gradient-to-br !from-white !via-cyan-50/40 !to-emerald-50/70"><div className="panel-heading"><div><span>Distribución mensual</span><h2>Consumo por vivienda</h2></div><span className="period-pill !bg-cyan-100 text-cyan-800">{data.period.name}</span></div><div className="chart-box"><ResponsiveContainer width="100%" height="100%" minWidth={0}><BarChart data={data.rows.filter((row) => row.consumptionKwh > 0)} margin={{ top: 10, right: 4, left: -24, bottom: 0 }}><CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#d8ebe6" /><XAxis dataKey="parcelNumber" axisLine={false} tickLine={false} tick={{ fill: "#4f6f64", fontSize: 11 }} /><YAxis axisLine={false} tickLine={false} tick={{ fill: "#4f6f64", fontSize: 11 }} /><Tooltip cursor={{ fill: "#dff5ed" }} contentStyle={{ border: "1px solid #a7d8c8", borderRadius: 12, boxShadow: "0 10px 30px rgba(28,45,37,.08)" }} formatter={(value) => [`${number.format(Number(value))} kWh`, "Consumo"]} labelFormatter={(value) => `Parcela ${value}`} /><Bar dataKey="consumptionKwh" fill="#0d9488" radius={[5, 5, 0, 0]} maxBarSize={28} /></BarChart></ResponsiveContainer></div></div>
      <div className="panel composition-panel !border-amber-200/80 !bg-gradient-to-br !from-white !via-amber-50/50 !to-orange-50/80"><div className="panel-heading"><div><span>Composición</span><h2>Total distribuido</h2></div></div><div className="total-ring"><span>{money.format(data.period.energyPool + data.period.peakPool + data.period.sharedPool)}</span><small>base eléctrica</small></div><div className="composition-list"><CompositionRow color="#059669" label="Consumo energía" value={data.period.energyPool} total={data.period.energyPool + data.period.peakPool + data.period.sharedPool} /><CompositionRow color="#f59e0b" label="Variable punta" value={data.period.peakPool} total={data.period.energyPool + data.period.peakPool + data.period.sharedPool} /><CompositionRow color="#6366f1" label="Cargo compartido" value={data.period.sharedPool} total={data.period.energyPool + data.period.peakPool + data.period.sharedPool} /></div></div>
    </section>
    <section className="panel table-panel !border-violet-200/60 !bg-gradient-to-br !from-white !to-violet-50/30"><div className="table-toolbar"><div><span>Detalle por vivienda</span><h2>Liquidaciones del período</h2></div><label className="search-box !border-violet-200 !bg-white/80"><Search size={17} /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar parcela o medidor" /></label></div><StatementTable rows={rows} /></section>
  </>;
}

const kpiTailwind: Record<string, string> = {
  emerald: "!border-emerald-200 !bg-gradient-to-br !from-white !to-emerald-100/80 shadow-emerald-900/5",
  navy: "!border-sky-200 !bg-gradient-to-br !from-white !to-sky-100/80 shadow-sky-900/5",
  gold: "!border-amber-200 !bg-gradient-to-br !from-white !to-amber-100/90 shadow-amber-900/5",
  violet: "!border-violet-200 !bg-gradient-to-br !from-white !to-violet-100/80 shadow-violet-900/5",
};
function KpiCard({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone: string }) { return <article className={`kpi-card ${kpiTailwind[tone] ?? ""}`}><span className={`kpi-icon ${tone}`}>{icon}</span><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></article>; }
function CompositionRow({ color, label, value, total }: { color: string; label: string; value: number; total: number }) { const percentage = total > 0 ? (value / total) * 100 : 0; return <div className="composition-row"><div><span className="legend-dot" style={{ background: color }} /><span>{label}</span><strong>{money.format(value)}</strong></div><div className="progress-track"><span style={{ width: `${percentage}%`, background: color }} /></div></div>; }

function StatementTable({ rows }: { rows: DashboardData["rows"] }) {
  return <div className="table-scroll"><table><thead><tr><th>Vivienda</th><th>Consumo</th><th>Energía</th><th>Punta</th><th>Común</th><th>Fondo</th><th>Saldo</th><th>Total</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><div className="property-cell"><span>{row.parcelNumber}</span><div><strong>Parcela {row.parcelNumber}</strong><small>{row.meters.length} medidor{row.meters.length === 1 ? "" : "es"}</small></div></div></td><td><strong>{number.format(row.consumptionKwh)} kWh</strong></td><td>{money.format(row.energyCharge)}</td><td>{money.format(row.peakCharge)}</td><td>{money.format(row.sharedCharge)}</td><td>{money.format(row.maintenanceFund)}</td><td className={row.previousBalance < 0 ? "credit" : ""}>{money.format(row.previousBalance)}</td><td><strong className="total-cell">{money.format(row.total)}</strong></td></tr>)}</tbody></table></div>;
}

function ReadingsView({ data, canManage, onUpload }: { data: DashboardData; canManage: boolean; onUpload: () => void }) {
  const meterRows = data.rows.flatMap((row) => row.meters.map((meter) => ({ ...meter, parcel: row.parcelNumber })));
  return <><PageHeading eyebrow="Evidencia de terreno" title="Lecturas y fotografías" description="Compara las lecturas por medidor y conserva evidencia privada para cada período." actions={canManage && <button className="button primary" onClick={onUpload}><Camera size={17} /> Agregar foto</button>} /><div className="reading-summary-strip"><div><FileCheck2 /><span><strong>{data.summary.readingCount}</strong> lecturas registradas</span></div><div><ImageIcon /><span><strong>{data.summary.photoCount}</strong> fotografías protegidas</span></div><div><History /><span><strong>{data.period.name}</strong> período activo</span></div></div><section className="reading-grid">{meterRows.map((meter) => <article className="meter-card" key={meter.id}><div className="meter-photo">{meter.photoId ? <img src={`/api/photos/${meter.photoId}`} alt={`Lectura del medidor ${meter.serialNumber}`} /> : <div><Camera /><span>Sin evidencia</span></div>}<span className={`reading-status ${meter.photoId ? "complete" : "pending"}`}>{meter.photoId ? "Con foto" : "Pendiente"}</span></div><div className="meter-body"><div className="meter-title"><div><span>Parcela {meter.parcel} · {meter.label}</span><strong>{meter.serialNumber}</strong></div><Gauge /></div><div className="reading-values"><div><span>Anterior</span><strong>{number.format(meter.previousValue)}</strong></div><div className="reading-arrow">→</div><div><span>Actual</span><strong>{number.format(meter.currentValue)}</strong></div></div><div className="consumption-line"><span>Consumo del período</span><strong>{number.format(meter.consumptionKwh)} kWh</strong></div></div></article>)}</section></>;
}

function StatementsView({ data }: { data: DashboardData }) {
  return <><PageHeading eyebrow="Contabilidad transparente" title="Liquidaciones" description="Todos los cargos se calculan en el servidor y los redondeos se concilian contra el total general." /><section className="period-card"><div><span className="period-icon"><WalletCards /></span><div><span>Período vigente</span><h2>{data.period.name}</h2><p>{formatDate(data.period.startDate)} — {formatDate(data.period.endDate)}</p></div></div><div className="period-stats"><div><span>Factura CGE</span><strong>{money.format(data.period.utilityTotal)}</strong></div><div><span>Lectura remarcadores</span><strong>{money.format(data.period.readingServiceTotal)}</strong></div><div><span>Vencimiento</span><strong>{formatDate(data.period.dueDate)}</strong></div></div></section><section className="panel table-panel"><div className="table-toolbar"><div><span>Detalle conciliado</span><h2>Montos por vivienda</h2></div><span className="security-pill"><LockKeyhole size={14} /> Cálculo protegido</span></div><StatementTable rows={data.rows} /></section></>;
}

function PaymentsView({ data, onAdjust, onNotice }: { data: DashboardData; onAdjust: (row: DashboardData["rows"][number]) => void; onNotice: (message: string) => void }) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const canVerify = ["admin", "treasurer"].includes(data.membership.role);
  async function setPaid(statementId: string, paid: boolean) {
    setWorking(statementId);
    try {
      const response = await fetch(`/api/statements/${statementId}/payment`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paid }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar el pago");
      onNotice(paid ? "Pago verificado y registrado en auditoría." : "Pago devuelto a pendiente."); router.refresh();
    } catch (error) { onNotice(error instanceof Error ? error.message : "No se pudo actualizar el pago"); }
    finally { setWorking(null); }
  }
  async function sendAll() {
    setSending(true);
    try {
      const statementIds = data.rows.filter((row) => row.statementId && row.ownerEmail).map((row) => row.statementId!);
      const response = await fetch(`/api/periods/${data.period.id}/emails`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statementIds }) });
      const result = await response.json() as { error?: string; sent?: number; failed?: number };
      if (!response.ok) throw new Error(result.error ?? "No se pudieron enviar los correos");
      onNotice(`Correos enviados: ${result.sent ?? 0}${result.failed ? ` · fallidos: ${result.failed}` : ""}.`);
    } catch (error) { onNotice(error instanceof Error ? error.message : "No se pudieron enviar los correos"); }
    finally { setSending(false); }
  }
  return <>
    <PageHeading eyebrow="Recaudación y seguimiento" title="Estado de pagos" description="Verifica transferencias, identifica pendientes y prepara o envía el consolidado de cada parcela." actions={canVerify ? <button className="button primary !bg-gradient-to-r !from-sky-600 !to-violet-600" disabled={sending} onClick={sendAll}><Send size={16} />{sending ? "Enviando…" : "Enviar consolidados"}</button> : undefined} />
    <section className="payment-kpis"><article><span>Pagados</span><strong>{data.summary.paidCount}</strong><small>{money.format(data.summary.paidAmount)} verificados</small></article><article><span>Pendientes</span><strong>{data.summary.unpaidCount}</strong><small>{money.format(data.summary.outstandingAmount)} por recaudar</small></article><article><span>Alertas de cobro</span><strong>{data.summary.anomalyCount}</strong><small>requieren revisión humana</small></article></section>
    <section className="panel payment-panel"><div className="table-toolbar"><div><span>Control por parcela</span><h2>Pagados y pendientes</h2></div><span className="security-pill"><ShieldCheck size={14} /> Cambios auditados</span></div><div className="payment-list">{data.rows.map((row) => { const paid = row.payment?.status === "verified"; return <article key={row.id} className={paid ? "payment-row paid" : "payment-row pending"}><span className="property-number">{row.parcelNumber}</span><div className="payment-owner"><strong>{row.ownerLabel}</strong><small>{row.ownerEmail ?? "Sin correo registrado"}</small>{row.anomaly && <em><AlertTriangle size={12} /> {row.anomaly}</em>}</div><div className="payment-total"><span>Total</span><strong>{money.format(row.total)}</strong></div><span className={paid ? "payment-badge paid" : "payment-badge pending"}>{paid ? "Pagado" : "Pendiente"}</span><div className="payment-actions">{row.ownerEmail && <a className="row-action" href={mailtoFor(row, data)}><Mail size={14} /> Preparar correo</a>}{canVerify && row.statementId && <button className="row-action" onClick={() => onAdjust(row)}><CircleDollarSign size={14} /> Compensar</button>}{canVerify && row.statementId && <button className="row-action" disabled={working === row.statementId} onClick={() => setPaid(row.statementId!, !paid)}>{paid ? <RefreshCw size={14} /> : <BadgeCheck size={14} />}{paid ? "Marcar pendiente" : "Verificar pago"}</button>}</div></article>; })}</div></section>
  </>;
}

function mailtoFor(row: DashboardData["rows"][number], data: DashboardData) {
  if (!row.ownerEmail) return "#";
  const subject = `Cobro de electricidad ${data.period.name} · Parcela ${row.parcelNumber}`;
  const body = [`Estimado/a ${row.ownerLabel},`, "", `Consolidado parcela ${row.parcelNumber}`, `Período: ${formatDate(data.period.startDate)} al ${formatDate(data.period.endDate)}`, `Consumo: ${number.format(row.consumptionKwh)} kWh`, `Energía: ${money.format(row.energyCharge)}`, `Punta: ${money.format(row.peakCharge)}`, `Cargo común: ${money.format(row.sharedCharge)}`, `Fondo común: ${money.format(row.maintenanceFund)}`, `Saldo anterior: ${money.format(row.previousBalance)}`, `TOTAL: ${money.format(row.total)}`, `Vencimiento: ${formatDate(data.period.dueDate)}`].join("\n");
  return `mailto:${encodeURIComponent(row.ownerEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function BillsView({ data, onUpload, onNotice }: { data: DashboardData; onUpload: () => void; onNotice: (message: string) => void }) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  const canManage = ["admin", "treasurer"].includes(data.membership.role);
  async function setPaid(id: string, paid: boolean) {
    setWorking(id);
    try {
      const response = await fetch(`/api/bills/${id}/payment`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ paid }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar la boleta");
      onNotice(paid ? "Pago de la boleta CGE verificado." : "Boleta CGE devuelta a pendiente."); router.refresh();
    } catch (error) { onNotice(error instanceof Error ? error.message : "No se pudo actualizar la boleta"); }
    finally { setWorking(null); }
  }
  return <><PageHeading eyebrow="Documentos y tesorería" title="Histórico de boletas CGE" description="Conserva el PDF original, los montos, consumos y pagos del suministro general." actions={canManage ? <button className="button primary !bg-gradient-to-r !from-orange-500 !to-amber-600" onClick={onUpload}><UploadCloud size={16} /> Subir boleta CGE</button> : undefined} />
    <section className="panel bill-history"><div className="table-toolbar"><div><span>Archivo privado</span><h2>Boletas registradas</h2></div><span className="security-pill"><LockKeyhole size={14} /> PDF en R2 privado</span></div>{data.billHistory.length ? <div className="bill-list">{data.billHistory.map((bill) => <article key={bill.id}><span className="bill-icon"><FileCheck2 /></span><div><strong>{bill.periodName} · Factura {bill.invoiceNumber}</strong><small>Emitida {formatDate(bill.issuedAt)} · vence {formatDate(bill.dueDate)} · {number.format(bill.consumptionKwh)} kWh</small>{bill.previousPaymentAmount != null && <small>Pago anterior informado: {money.format(bill.previousPaymentAmount)}{bill.previousPaymentAt ? ` · ${formatDate(bill.previousPaymentAt)}` : ""}</small>}</div><div className="bill-total"><span>Total</span><strong>{money.format(bill.total)}</strong></div><span className={bill.status === "paid" ? "payment-badge paid" : "payment-badge pending"}>{bill.status === "paid" ? "Pagada" : "Pendiente"}</span><div className="payment-actions"><a className="row-action" href={`/api/bills/${bill.id}`} target="_blank" rel="noreferrer"><FileCheck2 size={14} /> Ver PDF</a>{canManage && <button className="row-action" disabled={working === bill.id} onClick={() => setPaid(bill.id, bill.status !== "paid")}><BadgeCheck size={14} />{bill.status === "paid" ? "Reabrir" : "Marcar pagada"}</button>}</div></article>)}</div> : <div className="empty-history"><FileCheck2 /><strong>Aún no hay boletas cargadas</strong><span>Sube el PDF de CGE para comenzar el histórico.</span></div>}</section>
  </>;
}

function AuditView({ data }: { data: DashboardData }) {
  const labels: Record<string, string> = { "property.owner_updated": "Propietario actualizado", "property.created": "Parcela creada", "property.activated": "Parcela reactivada", "property.deactivated": "Parcela desactivada", "period.dates_updated": "Fechas del período modificadas", "period.common_charges_updated": "Valores comunes modificados", "reading.photo_uploaded": "Lectura y fotografía guardadas", "payment.verified": "Pago verificado", "payment.reverted": "Pago devuelto a pendiente", "adjustment.credit_applied": "Compensación aplicada", "utility_bill.uploaded": "Boleta CGE cargada", "utility_bill.replaced": "Boleta CGE reemplazada", "utility_bill.payment_verified": "Pago CGE verificado", "utility_bill.payment_reverted": "Pago CGE revertido", "member.role_changed": "Perfil de acceso modificado", "statements.email_batch_completed": "Envío de correos finalizado", "period.calculated": "Liquidaciones recalculadas" };
  return <><PageHeading eyebrow="Trazabilidad antifraude" title="Historial de cambios" description="Cada modificación conserva usuario, fecha, valores y una firma criptográfica verificable." /><section className="security-hero"><div className="shield-orbit"><ShieldCheck /></div><div><span>Integridad del historial</span><h2>Registro firmado y encadenado</h2><p>Una alteración directa en los eventos firmados se mostrará como integridad inválida.</p></div><span className="healthy-pill"><span /> Firmas activas</span></section><section className="panel audit-panel"><div className="audit-list">{data.auditHistory.map((event) => <article key={event.id}><span className={event.integrity === false ? "audit-state invalid" : event.integrity === true ? "audit-state valid" : "audit-state legacy"}>{event.integrity === false ? <AlertTriangle /> : <ShieldCheck />}</span><div><strong>{labels[event.action] ?? event.action}</strong><small>{event.displayName} · {new Date(event.createdAt).toLocaleString("es-CL")}</small><details><summary>Ver valores registrados</summary><pre>{JSON.stringify(event.payload, null, 2)}</pre></details></div><span className={event.integrity === false ? "integrity-badge invalid" : "integrity-badge"}>{event.integrity === false ? "Alterado" : event.integrity === true ? "Verificado" : "Evento anterior"}</span></article>)}</div></section></>;
}

function SecurityView() {
  const controls = [["Acceso por vivienda", "Cada residente consulta únicamente las parcelas asociadas a su cuenta."], ["Archivos privados", "Las fotografías nunca tienen una dirección pública y se entregan después de autorizar al usuario."], ["Validación de imágenes", "Se comprueban tamaño, tipo declarado, firma binaria, duplicados y límite de carga."], ["Cálculo en servidor", "El navegador no puede modificar tarifas, cargos compartidos ni totales."], ["Trazabilidad", "Cargas y recálculos crean eventos de auditoría con usuario y fecha."], ["Períodos bloqueables", "Las lecturas solamente pueden cambiar mientras el período está abierto o en revisión."]];
  return <><PageHeading eyebrow="Protección incorporada" title="Seguridad y control" description="El acceso, los archivos y los cálculos aplican validaciones en el servidor, además de controles visuales en el navegador." /><section className="security-hero"><div className="shield-orbit"><ShieldCheck /></div><div><span>Estado de protección</span><h2>Controles principales activos</h2><p>Autenticación administrada por la plataforma, permisos por rol y autorización por cada objeto solicitado.</p></div><span className="healthy-pill"><span /> Saludable</span></section><section className="security-grid">{controls.map(([title, text], index) => <article key={title}><span>{index + 1}</span><div><h3>{title}</h3><p>{text}</p></div><Check /></article>)}</section></>;
}

function AdminView({ data, onAddParcel, onEditOwner, onNotice }: { data: DashboardData; onAddParcel: () => void; onEditOwner: (property: NonNullable<DashboardData["admin"]>["properties"][number]) => void; onNotice: (message: string) => void }) {
  const router = useRouter();
  const [working, setWorking] = useState<string | null>(null);
  if (!data.admin) return null;

  async function toggleProperty(id: string, active: boolean) {
    setWorking(id);
    try {
      const response = await fetch(`/api/properties/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo modificar la parcela");
      onNotice(active ? "Parcela reactivada y reincorporada al cálculo." : "Parcela desactivada sin eliminar su historial.");
      router.refresh();
    } catch (error) { onNotice(error instanceof Error ? error.message : "No se pudo modificar la parcela"); }
    finally { setWorking(null); }
  }

  async function updateRole(id: string, role: string) {
    setWorking(id);
    try {
      const response = await fetch(`/api/members/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar el perfil");
      onNotice("Perfil de acceso actualizado."); router.refresh();
    } catch (error) { onNotice(error instanceof Error ? error.message : "No se pudo actualizar el perfil"); }
    finally { setWorking(null); }
  }

  return <>
    <PageHeading eyebrow="Gestión de la comunidad" title="Administración" description="Agrega o desactiva parcelas y define quién puede cargar lecturas, administrar cobros o auditar información." actions={<button className="button primary" onClick={onAddParcel}><Plus size={17} /> Nueva parcela</button>} />
    <section className="admin-grid">
      <div className="panel admin-panel">
        <div className="table-toolbar"><div><span>Inventario persistente</span><h2>Parcelas y medidores</h2></div><span className="period-pill">{data.admin.properties.filter((property) => property.active).length} activas</span></div>
        <div className="admin-list">{data.admin.properties.map((property) => <div className={`admin-row ${property.active ? "" : "inactive"}`} key={property.id}><span className="property-number">{property.parcelNumber}</span><div><strong>Parcela {property.parcelNumber}</strong><small>{property.ownerLabel} · {property.ownerEmail ?? "sin correo"} · {property.meterCount} medidor{property.meterCount === 1 ? "" : "es"}</small></div><span className={property.active ? "active-badge" : "inactive-badge"}>{property.active ? "Activa" : "Retirada"}</span><div className="admin-actions"><button onClick={() => onEditOwner(property)} className="row-action"><Pencil size={14} /> Editar</button><button disabled={working === property.id} onClick={() => toggleProperty(property.id, !property.active)} className="row-action"><Power size={14} /> {property.active ? "Desactivar" : "Reactivar"}</button></div></div>)}</div>
      </div>
      <div className="panel profile-panel">
        <div className="table-toolbar"><div><span>Perfiles de acceso</span><h2>Usuarios y funciones</h2></div><UserCog size={19} /></div>
        <div className="profile-intro"><ShieldCheck size={18} /><p>El perfil <strong>Carga de información</strong> puede registrar lecturas y fotos, pero no modificar parcelas ni reglas de cobro.</p></div>
        <div className="profile-list">{data.admin.members.map((member) => <div className="profile-row" key={member.id}><span className="avatar">{member.displayName.slice(0, 2).toUpperCase()}</span><div><strong>{member.displayName}</strong><small>{member.email}</small></div><select value={member.role} disabled={working === member.id} onChange={(event) => updateRole(member.id, event.target.value)} aria-label={`Perfil de ${member.displayName}`}><option value="admin">Administrador</option><option value="reader">Carga de información</option><option value="treasurer">Tesorero</option><option value="auditor">Auditor</option><option value="resident">Residente</option></select></div>)}</div>
      </div>
    </section>
    <section className="storage-card"><div className="storage-icon"><ImageIcon /></div><div><span>Almacenamiento de fotografías</span><h2>R2 privado, separado de la base de datos</h2><p>La imagen se guarda como objeto privado. D1 conserva solamente la ruta interna, tipo, tamaño, hash SHA-256 y vínculo con la lectura. No existen direcciones públicas permanentes.</p></div><span className="security-pill"><LockKeyhole size={14} /> Acceso autorizado</span></section>
  </>;
}

function ChargesModal({ data, onClose, onSaved }: { data: DashboardData; onClose: () => void; onSaved: (message: string) => void }) {
  const [sharedPool, setSharedPool] = useState(String(data.period.sharedPool));
  const [maintenanceFund, setMaintenanceFund] = useState(String(data.period.maintenanceFundPerProperty));
  const [readingService, setReadingService] = useState(String(data.period.readingServiceTotal));
  const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(null); setSaving(true); try { const values = [sharedPool, maintenanceFund, readingService]; if (values.some((value) => !/^\d+$/.test(value))) throw new Error("Los montos deben ser números enteros positivos"); const response = await fetch(`/api/periods/${data.period.id}/charges`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sharedPool: Number(sharedPool), maintenanceFundPerProperty: Number(maintenanceFund), readingServiceTotal: Number(readingService) }) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error ?? "No se pudieron guardar los valores"); onSaved("Valores comunes guardados y liquidaciones recalculadas."); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudieron guardar los valores"); } finally { setSaving(false); } }
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Valores comunes"><button className="modal-backdrop" onClick={onClose} aria-label="Cerrar" /><form className="upload-modal compact-modal" onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow">Distribución del período</span><h2>Valores comunes y fondo</h2><p>Estos montos se distribuyen y quedan registrados en auditoría.</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><label className="field"><span>Cargo común total</span><input inputMode="numeric" pattern="\d+" value={sharedPool} onChange={(event) => setSharedPool(event.target.value)} required /></label><div className="field-row"><label className="field"><span>Fondo común por parcela</span><input inputMode="numeric" pattern="\d+" value={maintenanceFund} onChange={(event) => setMaintenanceFund(event.target.value)} required /></label><label className="field"><span>Servicio de lectura total</span><input inputMode="numeric" pattern="\d+" value={readingService} onChange={(event) => setReadingService(event.target.value)} required /></label></div><div className="privacy-note"><History size={16} /><span>El cambio recalcula todas las liquidaciones activas sin alterar pagos ya verificados.</span></div>{error && <div className="form-error"><AlertTriangle size={16} />{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}><CircleDollarSign size={16} />{saving ? "Guardando…" : "Guardar valores"}</button></div></form></div>;
}

function OwnerModal({ property, onClose, onSaved }: { property: NonNullable<DashboardData["admin"]>["properties"][number]; onClose: () => void; onSaved: (message: string) => void }) {
  const [ownerLabel, setOwnerLabel] = useState(property.ownerLabel); const [ownerEmail, setOwnerEmail] = useState(property.ownerEmail ?? ""); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(null); setSaving(true); try { const response = await fetch(`/api/properties/${property.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerLabel, ownerEmail }) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error ?? "No se pudo actualizar el propietario"); onSaved("Datos del propietario actualizados."); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo actualizar el propietario"); } finally { setSaving(false); } }
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Editar propietario"><button className="modal-backdrop" onClick={onClose} aria-label="Cerrar" /><form className="upload-modal compact-modal" onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow">Parcela {property.parcelNumber}</span><h2>Datos del propietario</h2><p>El correo se usará únicamente para enviar su consolidado.</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><label className="field"><span>Nombre o identificación</span><input value={ownerLabel} maxLength={100} onChange={(event) => setOwnerLabel(event.target.value)} required /></label><label className="field"><span>Correo electrónico</span><input type="email" value={ownerEmail} maxLength={254} onChange={(event) => setOwnerEmail(event.target.value)} placeholder="propietario@correo.cl" /></label>{error && <div className="form-error"><AlertTriangle size={16} />{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}><Mail size={16} />{saving ? "Guardando…" : "Guardar propietario"}</button></div></form></div>;
}

function BillModal({ data, onClose, onSaved }: { data: DashboardData; onClose: () => void; onSaved: (message: string) => void }) {
  const [invoiceNumber, setInvoiceNumber] = useState(data.period.invoiceNumber ?? ""); const [issuedAt, setIssuedAt] = useState(""); const [dueDate, setDueDate] = useState(data.period.dueDate); const [total, setTotal] = useState(String(data.period.utilityTotal)); const [consumption, setConsumption] = useState(String(data.period.masterKwh)); const [previousAmount, setPreviousAmount] = useState(""); const [previousAt, setPreviousAt] = useState(""); const [file, setFile] = useState<File | null>(null); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(null); if (!file) return setError("Selecciona la boleta PDF de CGE."); setSaving(true); try { const form = new FormData(); form.set("periodId", data.period.id); form.set("invoiceNumber", invoiceNumber); form.set("issuedAt", issuedAt); form.set("dueDate", dueDate); form.set("total", total); form.set("consumptionKwh", consumption); form.set("previousPaymentAmount", previousAmount); form.set("previousPaymentAt", previousAt); form.set("bill", file); const response = await fetch("/api/bills", { method: "POST", body: form }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error ?? "No se pudo cargar la boleta"); onSaved("Boleta CGE guardada en el histórico privado."); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo cargar la boleta"); } finally { setSaving(false); } }
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Subir boleta CGE"><button className="modal-backdrop" onClick={onClose} aria-label="Cerrar" /><form className="upload-modal" onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow">Documento del suministro general</span><h2>Subir boleta CGE</h2><p>El PDF quedará privado y podrá adjuntarse a los consolidados.</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><div className="field-row"><label className="field"><span>Número de factura</span><input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} required /></label><label className="field"><span>Fecha de emisión</span><input type="date" value={issuedAt} onChange={(event) => setIssuedAt(event.target.value)} required /></label></div><div className="field-row"><label className="field"><span>Vencimiento</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} required /></label><label className="field"><span>Total CGE</span><input inputMode="numeric" pattern="\d+" value={total} onChange={(event) => setTotal(event.target.value)} required /></label></div><div className="field-row"><label className="field"><span>Consumo general (kWh)</span><input inputMode="numeric" pattern="\d+" value={consumption} onChange={(event) => setConsumption(event.target.value)} required /></label><label className="field"><span>Último pago informado</span><input inputMode="numeric" pattern="\d*" value={previousAmount} onChange={(event) => setPreviousAmount(event.target.value)} /></label></div><label className="field"><span>Fecha del último pago</span><input type="date" value={previousAt} onChange={(event) => setPreviousAt(event.target.value)} /></label><label className="file-field"><input type="file" accept="application/pdf" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required /><span><FileCheck2 />{file ? file.name : "Seleccionar PDF de CGE"}</span><small>PDF · máximo 10 MB</small></label>{error && <div className="form-error"><AlertTriangle size={16} />{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}><UploadCloud size={16} />{saving ? "Subiendo…" : "Guardar boleta"}</button></div></form></div>;
}

function AdjustmentModal({ row, onClose, onSaved }: { row: DashboardData["rows"][number]; onClose: () => void; onSaved: (message: string) => void }) {
  const [amount, setAmount] = useState(""); const [reason, setReason] = useState(""); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(null); setSaving(true); try { if (!row.statementId) throw new Error("La parcela aún no tiene liquidación"); const response = await fetch("/api/adjustments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ statementId: row.statementId, amount: Number(amount), reason }) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error ?? "No se pudo aplicar la compensación"); onSaved("Crédito compensatorio aplicado y cobro recalculado."); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo aplicar la compensación"); } finally { setSaving(false); } }
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Compensar cobro"><button className="modal-backdrop" onClick={onClose} aria-label="Cerrar" /><form className="upload-modal compact-modal" onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow">Corrección auditada · parcela {row.parcelNumber}</span><h2>Aplicar compensación</h2><p>Registra un crédito cuando una lectura o distribución perjudicó a esta parcela.</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div>{row.anomaly && <div className="form-error"><AlertTriangle size={16} />{row.anomaly}</div>}<label className="field"><span>Monto del crédito</span><input inputMode="numeric" pattern="\d+" value={amount} onChange={(event) => setAmount(event.target.value)} max={Math.max(0, row.total)} required /></label><label className="field"><span>Motivo y respaldo</span><textarea value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={500} placeholder="Ej. lectura digitada incorrectamente; se verificó fotografía y medidor…" required /></label><div className="privacy-note"><ShieldCheck size={16} /><span>La compensación reduce el total, conserva el cobro original en el historial y registra usuario, fecha y motivo.</span></div>{error && <div className="form-error"><AlertTriangle size={16} />{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}><CircleDollarSign size={16} />{saving ? "Aplicando…" : "Aplicar crédito"}</button></div></form></div>;
}

function PeriodModal({ data, onClose, onSaved }: { data: DashboardData; onClose: () => void; onSaved: (message: string) => void }) {
  const [startDate, setStartDate] = useState(data.period.startDate);
  const [endDate, setEndDate] = useState(data.period.endDate);
  const [dueDate, setDueDate] = useState(data.period.dueDate);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dayCount = startDate && endDate && startDate <= endDate ? Math.round((new Date(`${endDate}T12:00:00`).getTime() - new Date(`${startDate}T12:00:00`).getTime()) / 86400000) + 1 : 0;

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    if (startDate > endDate) return setError("La fecha de término debe ser posterior al inicio.");
    if (dueDate < endDate) return setError("El vencimiento no puede ser anterior al término de la medición.");
    setSaving(true);
    try {
      const response = await fetch(`/api/periods/${data.period.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startDate, endDate, dueDate }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "No se pudo guardar el rango");
      onSaved("Rango de medición guardado y cobro recalculado.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar el rango"); }
    finally { setSaving(false); }
  }

  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Rango de medición"><button className="modal-backdrop" onClick={onClose} aria-label="Cerrar" /><form className="upload-modal compact-modal !border !border-violet-200 !bg-gradient-to-br !from-white !via-violet-50/40 !to-sky-50/70" onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow text-violet-700">Período del cobro</span><h2>Rango de medición</h2><p>Define las fechas que aparecerán en la liquidación de {data.period.name}.</p></div><button type="button" className="icon-button !border-violet-200 !bg-violet-50" onClick={onClose}><X /></button></div><div className="date-range-preview !border-violet-200 !bg-gradient-to-r !from-violet-100 !to-sky-100"><CalendarDays /><div><span>Período seleccionado</span><strong>{startDate ? formatDate(startDate) : "—"} → {endDate ? formatDate(endDate) : "—"}</strong><small>{dayCount ? `${dayCount} días incluidos` : "Selecciona un rango válido"}</small></div></div><div className="field-row"><label className="field"><span>Inicio de la medición</span><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} required /></label><label className="field"><span>Término de la medición</span><input type="date" value={endDate} min={startDate} onChange={(event) => setEndDate(event.target.value)} required /></label></div><label className="field"><span>Fecha de vencimiento</span><input type="date" value={dueDate} min={endDate} onChange={(event) => setDueDate(event.target.value)} required /></label><div className="privacy-note !bg-sky-50 text-sky-900"><History size={16} /><span>Al guardar, el rango queda persistido y se registra en la auditoría junto con las fechas anteriores.</span></div>{error && <div className="form-error"><AlertTriangle size={16} />{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary !bg-gradient-to-r !from-violet-600 !to-sky-600" disabled={saving}><CalendarDays size={16} />{saving ? "Guardando…" : "Guardar rango"}</button></div></form></div>;
}

function ParcelModal({ data, onClose, onSaved }: { data: DashboardData; onClose: () => void; onSaved: (message: string) => void }) {
  const [parcelNumber, setParcelNumber] = useState(""); const [ownerLabel, setOwnerLabel] = useState(""); const [ownerEmail, setOwnerEmail] = useState(""); const [serialNumber, setSerialNumber] = useState(""); const [meterLabel, setMeterLabel] = useState("Parcela"); const [kind, setKind] = useState("parcel"); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false);
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(null); setSaving(true); try { const response = await fetch("/api/properties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ parcelNumber, ownerLabel, ownerEmail, serialNumber, meterLabel, kind, communityId: data.community.id }) }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error ?? "No se pudo crear la parcela"); onSaved("Nueva parcela y su primer medidor guardados correctamente."); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo crear la parcela"); } finally { setSaving(false); } }
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Nueva parcela"><button className="modal-backdrop" onClick={onClose} aria-label="Cerrar" /><form className="upload-modal compact-modal" onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow">Inventario de la comunidad</span><h2>Nueva parcela</h2><p>La parcela quedará disponible para lecturas, fotografías y liquidaciones.</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><div className="field-row"><label className="field"><span>Número de parcela</span><input value={parcelNumber} maxLength={20} onChange={(event) => setParcelNumber(event.target.value)} placeholder="Ej. 72" required /></label><label className="field"><span>Tipo de medidor</span><select value={kind} onChange={(event) => setKind(event.target.value)}><option value="parcel">Parcela</option><option value="well">Pozo</option></select></label></div><label className="field"><span>Identificación del propietario</span><input value={ownerLabel} maxLength={100} onChange={(event) => setOwnerLabel(event.target.value)} placeholder="Nombre o referencia interna" required /></label><label className="field"><span>Correo del propietario</span><input type="email" value={ownerEmail} maxLength={254} onChange={(event) => setOwnerEmail(event.target.value)} placeholder="propietario@correo.cl" /></label><div className="field-row"><label className="field"><span>Número de medidor</span><input value={serialNumber} maxLength={60} onChange={(event) => setSerialNumber(event.target.value)} placeholder="Serie única" required /></label><label className="field"><span>Etiqueta</span><input value={meterLabel} maxLength={40} onChange={(event) => setMeterLabel(event.target.value)} required /></label></div><div className="privacy-note"><History size={16} /><span>Para quitar una parcela se usa una <strong>desactivación recuperable</strong>. Sus lecturas, fotos y liquidaciones históricas no se eliminan.</span></div>{error && <div className="form-error"><AlertTriangle size={16} />{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}><Plus size={16} />{saving ? "Guardando…" : "Crear parcela"}</button></div></form></div>;
}

function UploadModal({ data, onClose, onSaved }: { data: DashboardData; onClose: () => void; onSaved: (message: string) => void }) {
  const allMeters = data.rows.flatMap((row) => row.meters.map((meter) => ({ ...meter, parcel: row.parcelNumber })));
  const [meterId, setMeterId] = useState(allMeters[0]?.id ?? ""); const selected = allMeters.find((meter) => meter.id === meterId);
  const [previousValue, setPreviousValue] = useState(String(selected?.previousValue ?? "")); const [currentValue, setCurrentValue] = useState(String(selected?.currentValue ?? ""));
  const [capturedAt, setCapturedAt] = useState(new Date().toISOString().slice(0, 16)); const [file, setFile] = useState<File | null>(null); const [preview, setPreview] = useState<string | null>(null); const [error, setError] = useState<string | null>(null); const [saving, setSaving] = useState(false); const inputRef = useRef<HTMLInputElement>(null);
  function changeMeter(value: string) { setMeterId(value); const meter = allMeters.find((item) => item.id === value); setPreviousValue(String(meter?.previousValue ?? "")); setCurrentValue(String(meter?.currentValue ?? "")); }
  function chooseFile(nextFile: File | null) { if (preview) URL.revokeObjectURL(preview); setFile(nextFile); setPreview(nextFile ? URL.createObjectURL(nextFile) : null); }
  async function submit(event: React.FormEvent) { event.preventDefault(); setError(null); if (!file) return setError("Toma o selecciona una fotografía del medidor."); if (Number(currentValue) < Number(previousValue)) return setError("La lectura actual no puede ser menor que la anterior."); setSaving(true); try { const form = new FormData(); form.set("meterId", meterId); form.set("periodId", data.period.id); form.set("previousValue", previousValue); form.set("currentValue", currentValue); form.set("capturedAt", new Date(capturedAt).toISOString()); form.set("photo", file); const response = await fetch("/api/readings", { method: "POST", body: form }); const result = await response.json() as { error?: string }; if (!response.ok) throw new Error(result.error ?? "No se pudo guardar la lectura"); onSaved("Lectura y fotografía guardadas con trazabilidad."); } catch (cause) { setError(cause instanceof Error ? cause.message : "No se pudo guardar la lectura"); } finally { setSaving(false); } }
  return <div className="modal-layer" role="dialog" aria-modal="true" aria-label="Nueva lectura"><button className="modal-backdrop" onClick={onClose} aria-label="Cerrar" /><form className="upload-modal" onSubmit={submit}><div className="modal-heading"><div><span className="eyebrow">Evidencia de medidor</span><h2>Nueva lectura</h2><p>La foto quedará privada y vinculada al período {data.period.name}.</p></div><button type="button" className="icon-button" onClick={onClose}><X /></button></div><label className="field"><span>Medidor</span><select value={meterId} onChange={(event) => changeMeter(event.target.value)}>{allMeters.map((meter) => <option key={meter.id} value={meter.id}>Parcela {meter.parcel} · {meter.label} · {meter.serialNumber}</option>)}</select></label><div className="field-row"><label className="field"><span>Lectura anterior</span><input inputMode="numeric" pattern="\d+" value={previousValue} onChange={(event) => setPreviousValue(event.target.value)} required /></label><label className="field"><span>Lectura actual</span><input inputMode="numeric" pattern="\d+" value={currentValue} onChange={(event) => setCurrentValue(event.target.value)} required /></label></div><label className="field"><span>Fecha y hora de captura</span><input type="datetime-local" value={capturedAt} onChange={(event) => setCapturedAt(event.target.value)} required /></label><input ref={inputRef} className="visually-hidden" type="file" accept="image/jpeg,image/png,image/webp" capture="environment" onChange={(event) => chooseFile(event.target.files?.[0] ?? null)} /><button type="button" className={`photo-dropzone ${preview ? "has-preview" : ""}`} onClick={() => inputRef.current?.click()}>{preview ? <><img src={preview} alt="Vista previa de la lectura" /><span><RefreshCw size={16} /> Cambiar fotografía</span></> : <><span className="camera-bubble"><Camera /></span><strong>Tomar o seleccionar fotografía</strong><small>JPEG, PNG o WebP · máximo 5 MB</small><em><UploadCloud size={15} /> Elegir archivo</em></>}</button><div className="privacy-note"><LockKeyhole size={16} /><span><strong>Archivo privado.</strong> El sistema valida el contenido, genera una huella SHA-256 y evita reutilizar la misma foto.</span></div>{error && <div className="form-error"><AlertTriangle size={16} />{error}</div>}<div className="modal-actions"><button type="button" className="button secondary" onClick={onClose}>Cancelar</button><button className="button primary" disabled={saving}><Sparkles size={16} />{saving ? "Guardando…" : "Guardar lectura"}</button></div></form></div>;
}
