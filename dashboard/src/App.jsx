import { useState, useEffect, useCallback, useRef } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";
import "./App.css";

const API = "http://localhost:8000";

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg: "#f7f6f2",
  surface: "#ffffff",
  border: "#e8e4dc",
  borderHover: "#c8c4b8",
  text: "#1a1a18",
  muted: "#888880",
  faint: "#f0ede6",
  green: "#3d7a4e",
  greenLight: "#eaf4ee",
  greenMid: "#b8dfc4",
  orange: "#d4621a",
  orangeLight: "#fdf0e8",
  orangeMid: "#f5c4a0",
  red: "#c0392b",
  redLight: "#fdecea",
  yellow: "#d4a017",
  yellowLight: "#fdf8e8",
  blue: "#2563eb",
  blueLight: "#eff6ff",
};

const STATUS_META = {
  placed:           { label: "Placed",          bg: C.yellowLight, color: C.yellow,  dot: C.yellow },
  preparing:        { label: "Preparing",        bg: C.orangeLight, color: C.orange,  dot: C.orange },
  out_for_delivery: { label: "Out for Delivery", bg: C.blueLight,   color: C.blue,    dot: C.blue },
  delivered:        { label: "Delivered",        bg: C.greenLight,  color: C.green,   dot: C.green },
  cancelled:        { label: "Cancelled",        bg: C.redLight,    color: C.red,     dot: C.red },
  booked:           { label: "Booked",           bg: C.yellowLight, color: C.yellow,  dot: C.yellow },
  seated:           { label: "Seated",           bg: C.orangeLight, color: C.orange,  dot: C.orange },
  done:             { label: "Done",             bg: C.greenLight,  color: C.green,   dot: C.green },
};

const DELIVERY_STATUSES = ["placed", "preparing", "out_for_delivery", "delivered", "cancelled"];
const DINING_STATUSES   = ["booked", "seated", "done"];
const CATEGORIES = ["main_course", "breads", "rice", "starters", "drinks"];

// ── Helpers ───────────────────────────────────────────────────────────────────
function minsLeft(isoDeadline) {
  if (!isoDeadline) return null;
  const diff = new Date(isoDeadline + "Z") - Date.now();
  return Math.max(0, Math.round(diff / 60000));
}

function fmtTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

// ── Components ────────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const m = STATUS_META[status] || { label: status, bg: C.faint, color: C.muted, dot: C.muted };
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 5,
      background: m.bg, color: m.color,
      border: `1px solid ${m.color}40`,
      borderRadius: 6, padding: "3px 9px", fontSize: 11, fontWeight: 600,
      fontFamily: "'DM Mono', monospace", letterSpacing: 0.3, whiteSpace: "nowrap"
    }}>
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: m.dot, flexShrink: 0 }} />
      {m.label}
    </span>
  );
}

function Tag({ children, color = C.green }) {
  return (
    <span style={{
      background: color + "15", color, border: `1px solid ${color}30`,
      borderRadius: 4, padding: "1px 7px", fontSize: 10, fontWeight: 700,
      fontFamily: "'DM Mono', monospace", letterSpacing: 0.5,
    }}>{children}</span>
  );
}

function Card({ children, style = {} }) {
  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`,
      borderRadius: 12, padding: 20, ...style
    }}>{children}</div>
  );
}

// Global layout wrapper style to guarantee component flex stretches properly
function SectionTitle({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, letterSpacing: 2,
      color: C.muted, fontFamily: "'DM Mono', monospace",
      textTransform: "uppercase", marginBottom: 16
    }}>{children}</div>
  );
}

function Btn({ children, onClick, variant = "primary", style = {}, disabled = false }) {
  const styles = {
    primary:   { bg: C.green,   color: "#fff",    border: C.green },
    secondary: { bg: C.surface, color: C.text,    border: C.border },
    danger:    { bg: C.redLight, color: C.red,    border: C.red + "40" },
    orange:    { bg: C.orange,  color: "#fff",    border: C.orange },
  };
  const s = styles[variant];
  return (
    <button disabled={disabled} onClick={onClick} style={{
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      borderRadius: 7, padding: "7px 14px", fontSize: 12, fontWeight: 600,
      cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      fontFamily: "inherit", transition: "opacity 0.15s", ...style
    }}>{children}</button>
  );
}

function Countdown({ deadline, orderId, onExpire }) {
  const [mins, setMins] = useState(minsLeft(deadline));
  useEffect(() => {
    const iv = setInterval(() => {
      const m = minsLeft(deadline);
      setMins(m);
      if (m === 0) onExpire && onExpire(orderId);
    }, 10000);
    return () => clearInterval(iv);
  }, [deadline, orderId, onExpire]);

  if (mins === null) return <span style={{ color: C.muted, fontSize: 12 }}>—</span>;
  const urgent = mins <= 10;
  const color = mins === 0 ? C.red : urgent ? C.orange : C.green;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: 4,
      color, fontFamily: "'DM Mono', monospace", fontWeight: 700, fontSize: 13
    }}>
      <span style={{ fontSize: 10 }}>⏱</span>
      {mins === 0 ? "OVERDUE" : `${mins}m`}
    </span>
  );
}

function SetEtaModal({ order, onClose, onSet }) {
  const [mins, setMins] = useState(45);
  const suggested = (order._prep_total || 35) + 10;

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#00000040",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
    }} onClick={onClose}>
      <div style={{
        background: C.surface, borderRadius: 14, padding: 28, width: 360,
        border: `1px solid ${C.border}`, boxShadow: "0 8px 40px #0002"
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Set Delivery ETA</div>
        <div style={{ color: C.muted, fontSize: 12, marginBottom: 20 }}>
          Order {order.order_id} · {order.customer_name}
        </div>
        <div style={{ color: C.muted, fontSize: 11, marginBottom: 8 }}>
          Suggested based on prep time: <strong style={{ color: C.orange }}>{suggested} min</strong>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
          <input
            type="range" min={5} max={120} step={5}
            value={mins} onChange={e => setMins(+e.target.value)}
            style={{ flex: 1, accentColor: C.green }}
          />
          <span style={{
            fontFamily: "'DM Mono', monospace", fontWeight: 700,
            fontSize: 18, color: C.green, minWidth: 50
          }}>{mins}m</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Btn variant="secondary" onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
          <Btn onClick={() => { onSet(order.order_id, mins); onClose(); }} style={{ flex: 1 }}>Set ETA</Btn>
        </div>
      </div>
    </div>
  );
}

function OrderModal({ order, onClose }) {
  if (!order) return null;
  return (
    <div style={{
      position: "fixed", inset: 0, background: "#00000040",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
    }} onClick={onClose}>
      <div style={{
        background: C.surface, borderRadius: 14, padding: 28, width: 420,
        border: `1px solid ${C.border}`, boxShadow: "0 8px 40px #0002", maxHeight: "80vh", overflowY: "auto"
      }} onClick={e => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{order.order_id}</div>
            <div style={{ color: C.muted, fontSize: 12 }}>{fmtDate(order.created_at)} · {fmtTime(order.created_at)}</div>
          </div>
          <StatusBadge status={order.status} />
        </div>

        <div style={{ background: C.faint, borderRadius: 10, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: C.muted, marginBottom: 10 }}>CUSTOMER</div>
          <div style={{ fontWeight: 600, fontSize: 14 }}>{order.customer_name}</div>
          <div style={{ color: C.muted, fontSize: 12 }}>{order.phone}</div>
          {order.address && <div style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>{order.address}{order.pincode ? `, ${order.pincode}` : ""}</div>}
        </div>

        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: C.muted, marginBottom: 10 }}>ITEMS ORDERED</div>
          {order.items?.map((item, i) => (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "8px 0", borderBottom: `1px solid ${C.border}`
            }}>
              <span style={{ fontSize: 13 }}>{item.qty}× {item.name}</span>
              <span style={{ fontFamily: "'DM Mono', monospace", fontSize: 12, color: C.muted }}>₹{item.price * item.qty}</span>
            </div>
          ))}
        </div>

        <div style={{ background: C.faint, borderRadius: 10, padding: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginBottom: 6 }}>
            <span>Subtotal</span><span>₹{order.subtotal}</span>
          </div>
          {order.delivery_charge > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: C.muted, marginBottom: 6 }}>
              <span>Delivery charge</span><span>₹{order.delivery_charge}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 15, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
            <span>Total</span><span style={{ color: C.green }}>₹{order.total}</span>
          </div>
        </div>

        <Btn variant="secondary" onClick={onClose} style={{ width: "100%", marginTop: 16 }}>Close</Btn>
      </div>
    </div>
  );
}

function AddItemModal({ onClose, onAdd }) {
  const [form, setForm] = useState({
    name: "", category: "main_course", price: "", is_special: false,
    tags: "veg", prep_time: 20
  });
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!form.name || !form.price) return;
    setLoading(true);
    await onAdd({
      name: form.name,
      category: form.category,
      price: parseInt(form.price),
      is_special: form.is_special,
      tags: [form.tags],
      prep_time: form.prep_time
    });
    setLoading(false);
    onClose();
  };

  const inp = (field) => ({
    value: form[field],
    onChange: e => setForm(p => ({ ...p, [field]: e.target.value })),
    style: {
      width: "100%", boxSizing: "border-box",
      border: `1px solid ${C.border}`, borderRadius: 7, padding: "8px 11px",
      fontSize: 13, fontFamily: "inherit", background: C.faint, color: C.text,
      outline: "none"
    }
  });

  return (
    <div style={{
      position: "fixed", inset: 0, background: "#00000040",
      display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000
    }} onClick={onClose}>
      <div style={{
        background: C.surface, borderRadius: 14, padding: 28, width: 400,
        border: `1px solid ${C.border}`, boxShadow: "0 8px 40px #0002"
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 20 }}>Add Menu Item</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: "block", marginBottom: 5 }}>Item Name</label>
            <input {...inp("name")} placeholder="e.g. Butter Chicken" />
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: "block", marginBottom: 5 }}>Category</label>
              <select {...inp("category")} style={{ ...inp("category").style }}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.replace("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: "block", marginBottom: 5 }}>Price (₹)</label>
              <input {...inp("price")} type="number" placeholder="0" />
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: "block", marginBottom: 8 }}>Veg / Non-Veg</label>
            <div style={{ display: "flex", gap: 16 }}>
              {["veg", "non-veg"].map(t => (
                <label key={t} style={{ display: "flex", alignItems: "center", gap: 7, cursor: "pointer", fontSize: 13 }}>
                  <input type="radio" name="tag" value={t}
                    checked={form.tags === t}
                    onChange={e => setForm(p => ({ ...p, tags: e.target.value }))}
                    style={{ accentColor: t === "veg" ? C.green : C.orange }}
                  />
                  <span style={{ color: t === "veg" ? C.green : C.orange, fontWeight: 600 }}>
                    {t === "veg" ? "🟢 Veg" : "🔴 Non-Veg"}
                  </span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 11, color: C.muted, fontWeight: 600, display: "block", marginBottom: 5 }}>
              Prep Time: <strong style={{ color: C.orange }}>{form.prep_time} min</strong>
            </label>
            <input type="range" min={5} max={60} step={5}
              value={form.prep_time}
              onChange={e => setForm(p => ({ ...p, prep_time: +e.target.value }))}
              style={{ width: "100%", accentColor: C.orange }}
            />
            <div style={{ fontSize: 10, color: C.muted, marginTop: 3 }}>
              Estimated delivery = prep time + 10 min buffer
            </div>
          </div>

          <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 13 }}>
            <input type="checkbox" checked={form.is_special}
              onChange={e => setForm(p => ({ ...p, is_special: e.target.checked }))}
              style={{ accentColor: C.orange, width: 15, height: 15 }}
            />
            <span>⭐ Mark as Today's Special</span>
          </label>
        </div>

        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          <Btn variant="secondary" onClick={onClose} style={{ flex: 1 }}>Cancel</Btn>
          <Btn onClick={submit} disabled={loading || !form.name || !form.price} style={{ flex: 1 }}>
            {loading ? "Adding..." : "Add Item"}
          </Btn>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
const TABS = ["Overview", "Delivery", "Dining", "Menu"];

export default function App() {
  const [tab, setTab] = useState("Overview");
  const [orders, setOrders] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [viewOrder, setViewOrder] = useState(null);
  const [etaOrder, setEtaOrder] = useState(null);
  const [showAddItem, setShowAddItem] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const iv = setInterval(() => setTick(t => t + 1), 30000);
    return () => clearInterval(iv);
  }, []);

  const fetchOrders = useCallback(async () => {
    try {
      const res = await fetch(`${API}/dashboard`);
      const json = await res.json();
      setOrders(json.orders || []);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const fetchMenu = useCallback(async () => {
    try {
      const res = await fetch(`${API}/menu`);
      const json = await res.json();
      setMenuItems(json.items || []);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    fetchOrders();
    fetchMenu();
    const iv = setInterval(fetchOrders, 15000);
    return () => clearInterval(iv);
  }, [fetchOrders, fetchMenu]);

  const updateStatus = async (orderId, status) => {
    await fetch(`${API}/orders/${orderId}/status`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    fetchOrders();
  };

  const setEta = async (orderId, mins) => {
    await fetch(`${API}/orders/${orderId}/estimated_time`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estimated_time: mins })
    });
    fetchOrders();
  };

  const addItem = async (data) => {
    await fetch(`${API}/menu`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    });
    fetchMenu();
  };

  const deleteItem = async (id) => {
    await fetch(`${API}/menu/${id}`, { method: "DELETE" });
    fetchMenu();
  };

  const deliveries = orders.filter(o => o.delivery_type === "home_delivery");
  const dining     = orders.filter(o => o.delivery_type === "dining");
  const activeQueue = deliveries
    .filter(o => ["placed", "preparing", "out_for_delivery"].includes(o.status))
    .sort((a, b) => {
      const aLeft = a.estimated_delivery_at ? minsLeft(a.estimated_delivery_at) : 999;
      const bLeft = b.estimated_delivery_at ? minsLeft(b.estimated_delivery_at) : 999;
      return aLeft - bLeft;
    });

  return (
    <div style={{ minHeight: "100vh", width: "100%", background: C.bg, fontFamily: "'Lato', 'Helvetica Neue', sans-serif", color: C.text }}>
      {/* Modals */}
      {viewOrder && <OrderModal order={viewOrder} onClose={() => setViewOrder(null)} />}
      {etaOrder  && <SetEtaModal order={etaOrder} onClose={() => setEtaOrder(null)} onSet={setEta} />}
      {showAddItem && <AddItemModal onClose={() => setShowAddItem(false)} onAdd={addItem} />}

      {/* Sidebar */}
      <div style={{ display: "flex", minHeight: "100vh", width: "100%" }}>
        <div style={{
          width: 220, background: C.surface, borderRight: `1px solid ${C.border}`,
          display: "flex", flexDirection: "column", position: "fixed", top: 0, bottom: 0
        }}>
          <div style={{ padding: "24px 20px 20px" }}>
            <div style={{ fontWeight: 800, fontSize: 18, letterSpacing: -0.5, color: C.text }}>
              🍛 Kukkad Nukkad
            </div>
            <div style={{ fontSize: 10, color: C.muted, letterSpacing: 1.5, marginTop: 3 }}>KITCHEN PORTAL</div>
          </div>

          <nav style={{ flex: 1, padding: "8px 12px" }}>
            {TABS.map(t => {
              const active = tab === t;
              const icons = { Overview: "◈", Delivery: "🛵", Dining: "🪑", Menu: "📋" };
              const badge = t === "Delivery" ? activeQueue.length : t === "Dining" ? dining.filter(o => o.status === "booked").length : 0;
              return (
                <button key={t} onClick={() => setTab(t)} style={{
                  width: "100%", textAlign: "left", background: active ? C.greenLight : "transparent",
                  border: active ? `1px solid ${C.greenMid}` : "1px solid transparent",
                  borderRadius: 8, padding: "9px 12px", marginBottom: 2,
                  color: active ? C.green : C.muted, cursor: "pointer",
                  fontFamily: "inherit", fontSize: 13, fontWeight: active ? 700 : 500,
                  display: "flex", alignItems: "center", gap: 9, transition: "all 0.15s"
                }}>
                  <span style={{ fontSize: 16 }}>{icons[t]}</span>
                  {t}
                  {badge > 0 && (
                    <span style={{
                      marginLeft: "auto", background: C.orange, color: "#fff",
                      borderRadius: 10, padding: "1px 7px", fontSize: 10, fontWeight: 700
                    }}>{badge}</span>
                  )}
                </button>
              );
            })}
          </nav>

          <div style={{ padding: "12px 20px 20px", borderTop: `1px solid ${C.border}` }}>
            <div style={{ fontSize: 10, color: C.muted }}>
              Live · {new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}
            </div>
            <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>Auto-refresh 15s</div>
          </div>
        </div>

        {/* Main content */}
        <div style={{ marginLeft: 220, flex: 1, padding: "32px 24px", boxSizing: "border-box" }}>
          {loading ? (
            <div style={{ color: C.muted, textAlign: "center", marginTop: 120, fontSize: 14 }}>Loading…</div>
          ) : (
            <>
              {tab === "Overview"  && <Overview orders={orders} activeQueue={activeQueue} onViewOrder={setViewOrder} tick={tick} />}
              {tab === "Delivery"  && <DeliveryTab orders={deliveries} activeQueue={activeQueue} onStatus={updateStatus} onView={setViewOrder} onEta={setEtaOrder} tick={tick} />}
              {tab === "Dining"    && <DiningTab orders={dining} onStatus={updateStatus} onView={setViewOrder} />}
              {tab === "Menu"      && <MenuTab items={menuItems} onAdd={() => setShowAddItem(true)} onDelete={deleteItem} />}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────────────
function Overview({ orders, activeQueue, onViewOrder, tick }) {
  const today = new Date().toDateString();
  const todayOrders = orders.filter(o => new Date(o.created_at).toDateString() === today);
  const todayRevenue = todayOrders.filter(o => o.status !== "cancelled").reduce((s, o) => s + (o.total || 0), 0);
  const active = orders.filter(o => ["placed", "preparing", "out_for_delivery", "booked", "seated"].includes(o.status)).length;
  const cancelled = orders.filter(o => o.status === "cancelled").length;

  const itemCount = {};
  orders.forEach(o => o.items?.forEach(it => {
    itemCount[it.name] = (itemCount[it.name] || 0) + it.qty;
  }));
  const topItems = Object.entries(itemCount).sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([name, count]) => ({ name: name.split(" ").slice(0, 2).join(" "), count }));

  const dayRevenue = {};
  orders.forEach(o => {
    if (o.status === "cancelled") return;
    const d = new Date(o.created_at).toLocaleDateString("en-IN", { weekday: "short" });
    dayRevenue[d] = (dayRevenue[d] || 0) + (o.total || 0);
  });
  const revenueChart = Object.entries(dayRevenue).map(([day, revenue]) => ({ day, revenue }));

  const stats = [
    { label: "Today's Revenue", value: `₹${todayRevenue.toLocaleString("en-IN")}`, color: C.green, bg: C.greenLight },
    { label: "Today's Orders",  value: todayOrders.length,                          color: C.orange, bg: C.orangeLight },
    { label: "Active Now",      value: active,                                       color: C.blue,   bg: C.blueLight },
    { label: "Cancelled",       value: cancelled,                                    color: C.red,    bg: C.redLight },
  ];

  return (
    <div>
      <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: -0.5, marginBottom: 24 }}>Overview</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 28 }}>
        {stats.map(s => (
          <div key={s.label} style={{
            background: s.bg, border: `1px solid ${s.color}25`,
            borderRadius: 12, padding: "18px 20px"
          }}>
            <div style={{ fontSize: 10, color: s.color, fontWeight: 700, letterSpacing: 1.5, marginBottom: 8 }}>
              {s.label.toUpperCase()}
            </div>
            <div style={{ fontSize: 28, fontWeight: 800, color: s.color, letterSpacing: -1 }}>{s.value}</div>
          </div>
        ))}
      </div>

      {activeQueue.length > 0 && (
        <Card style={{ marginBottom: 24 }}>
          <SectionTitle>🛵 Live Delivery Queue ({activeQueue.length})</SectionTitle>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {activeQueue.map((o, i) => {
              const left = minsLeft(o.estimated_delivery_at);
              const urgent = left !== null && left <= 10;
              return (
                <div key={o.order_id} style={{
                  display: "grid", gridTemplateColumns: "28px 1fr auto auto auto",
                  alignItems: "center", gap: 12, padding: "10px 14px",
                  background: urgent ? C.orangeLight : C.faint,
                  border: `1px solid ${urgent ? C.orangeMid : C.border}`,
                  borderRadius: 9, cursor: "pointer"
                }} onClick={() => onViewOrder(o)}>
                  <div style={{
                    width: 24, height: 24, borderRadius: "50%",
                    background: urgent ? C.orange : C.green,
                    color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                    fontSize: 10, fontWeight: 800
                  }}>{i + 1}</div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{o.customer_name}</div>
                    <div style={{ fontSize: 11, color: C.muted }}>{o.items?.map(it => `${it.qty}× ${it.name}`).join(", ")}</div>
                  </div>
                  <StatusBadge status={o.status} />
                  {left !== null
                    ? <Countdown deadline={o.estimated_delivery_at} orderId={o.order_id} />
                    : <span style={{ fontSize: 11, color: C.muted }}>No ETA</span>
                  }
                  <span style={{ fontSize: 11, color: C.muted, fontFamily: "'DM Mono', monospace" }}>₹{o.total}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        <Card>
          <SectionTitle>Top Items Ordered</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={topItems} margin={{ left: -20 }}>
              <XAxis dataKey="name" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="count" fill={C.green} radius={[5, 5, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card>
          <SectionTitle>Revenue by Day</SectionTitle>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={revenueChart} margin={{ left: -20 }}>
              <CartesianGrid stroke={C.border} />
              <XAxis dataKey="day" tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: C.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: C.surface, border: `1px solid ${C.border}`, borderRadius: 8, fontSize: 12 }}
                formatter={v => [`₹${v}`, "Revenue"]} />
              <Line dataKey="revenue" stroke={C.orange} strokeWidth={2} dot={{ fill: C.orange, r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

// ── Delivery Tab ──────────────────────────────────────────────────────────────
function DeliveryTab({ orders, activeQueue, onStatus, onView, onEta, tick }) {
  const [filter, setFilter] = useState("all");
  const filtered = filter === "all" ? orders : orders.filter(o => o.status === filter);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: -0.5 }}>Delivery Orders</div>
        <div style={{ fontSize: 12, color: C.muted }}>{orders.length} total</div>
      </div>

      {activeQueue.length > 0 && (
        <div style={{
          background: C.orangeLight, border: `1px solid ${C.orangeMid}`,
          borderRadius: 10, padding: "12px 16px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap"
        }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: C.orange, letterSpacing: 1 }}>ACTIVE QUEUE</span>
          {activeQueue.map((o, i) => {
            const left = minsLeft(o.estimated_delivery_at);
            return (
              <div key={o.order_id} style={{
                display: "flex", alignItems: "center", gap: 6,
                background: C.surface, border: `1px solid ${C.orangeMid}`,
                borderRadius: 7, padding: "5px 10px", cursor: "pointer"
              }} onClick={() => onView(o)}>
                <span style={{ fontWeight: 700, fontSize: 11, color: C.orange }}>#{i + 1}</span>
                <span style={{ fontSize: 12, fontWeight: 600 }}>{o.customer_name}</span>
                {left !== null
                  ? <Countdown deadline={o.estimated_delivery_at} orderId={o.order_id} />
                  : <span style={{ fontSize: 11, color: C.muted }}>No ETA</span>
                }
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
        {["all", ...DELIVERY_STATUSES].map(s => (
          <button key={s} onClick={() => setFilter(s)} style={{
            background: filter === s ? C.green : C.surface,
            color: filter === s ? "#fff" : C.muted,
            border: `1px solid ${filter === s ? C.green : C.border}`,
            borderRadius: 20, padding: "5px 14px", fontSize: 11, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit"
          }}>{s === "all" ? "All" : STATUS_META[s]?.label || s}</button>
        ))}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {filtered.length === 0 && (
          <div style={{ color: C.muted, textAlign: "center", padding: 60, fontSize: 13 }}>No orders here.</div>
        )}
        {filtered.map(o => {
          const left = minsLeft(o.estimated_delivery_at);
          const urgent = left !== null && left <= 10 && ["placed","preparing","out_for_delivery"].includes(o.status);
          return (
            <div key={o.order_id} style={{
              background: C.surface,
              border: `1px solid ${urgent ? C.orange : C.border}`,
              borderLeft: `4px solid ${urgent ? C.orange : C.green}`,
              borderRadius: 10, overflow: "hidden"
            }}>

              <div style={{
                display: "grid", gridTemplateColumns: "160px 1fr 220px",
                alignItems: "start", gap: 0,
                borderBottom: `1px solid ${C.border}`,
                padding: "12px 18px"
              }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12, fontFamily: "'DM Mono', monospace", color: C.text }}>{o.order_id}</div>
                  <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{fmtDate(o.created_at)} · {fmtTime(o.created_at)}</div>
                </div>

                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{o.customer_name}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 1 }}>{o.phone}</div>
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <StatusBadge status={o.status} />
                  <select
                    value={o.status}
                    onChange={e => onStatus(o.order_id, e.target.value)}
                    style={{
                      border: `1px solid ${C.border}`, borderRadius: 6, padding: "5px 8px",
                      fontSize: 11, fontFamily: "inherit", background: C.faint, color: C.text,
                      cursor: "pointer", width: "100%"
                    }}
                  >
                    {DELIVERY_STATUSES.map(s => (
                      <option key={s} value={s}>{STATUS_META[s]?.label || s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div style={{ padding: "10px 18px", borderBottom: `1px solid ${C.border}` }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: "left", fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: 1, paddingBottom: 5, width: 40 }}>QTY</th>
                      <th style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: 1, paddingBottom: 5 }}>ITEM</th>
                      <th style={{ textAlign: "right", fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: 1, paddingBottom: 5, width: 60 }}>PRICE</th>
                    </tr>
                  </thead>
                  <tbody>
                    {o.items?.map((it, i) => (
                      <tr key={i} style={{ borderTop: `1px solid ${C.faint}` }}>
                        <td style={{ padding: "4px 0", fontSize: 12, fontWeight: 700, fontFamily: "'DM Mono', monospace", color: C.orange }}>{it.qty}×</td>
                        <td style={{ padding: "4px 8px 4px 0", fontSize: 12, color: C.text, textAlign: "center" }}>{it.name}</td>
                        <td style={{ padding: "4px 0", fontSize: 11, fontFamily: "'DM Mono', monospace", color: C.muted, textAlign: "right" }}>₹{it.price * it.qty}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{
                display: "grid", gridTemplateColumns: "1fr 160px 200px",
                alignItems: "center", gap: 0,
                padding: "10px 18px",
                background: C.faint
              }}>
                <div style={{ fontSize: 11, color: C.muted }}>
                  {o.address
                    ? <>{o.address}{o.pincode ? `, ${o.pincode}` : ""}</>
                    : <span style={{ color: C.border }}>No address</span>
                  }
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.muted }}>ETA</div>
                  {o.status === "delivered"
                    ? <span style={{ fontSize: 11, color: C.green, fontWeight: 600 }}>✓ Delivered</span>
                    : left !== null
                    ? <Countdown deadline={o.estimated_delivery_at} orderId={o.order_id} />
                    : <span style={{ fontSize: 11, color: C.muted }}>Not set</span>
                  }
                </div>

                <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 8 }}>
                  <div style={{ textAlign: "right", marginRight: 4 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 1, color: C.muted }}>TOTAL</div>
                    <div style={{ fontWeight: 800, fontSize: 16, fontFamily: "'DM Mono', monospace", color: C.green }}>₹{o.total}</div>
                  </div>
                  <Btn variant="secondary" onClick={() => onView(o)} style={{ fontSize: 11, padding: "6px 12px" }}>View</Btn>
                  {["placed","preparing"].includes(o.status) && !o.estimated_delivery_at && (
                    <Btn variant="orange" onClick={() => onEta(o)} style={{ fontSize: 11, padding: "6px 12px" }}>Set ETA</Btn>
                  )}
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Dining Tab ────────────────────────────────────────────────────────────────
function DiningTab({ orders, onStatus, onView }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: -0.5 }}>Dining</div>
        <div style={{ fontSize: 12, color: C.muted }}>{orders.length} bookings</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {orders.length === 0 && (
          <div style={{ color: C.muted, fontSize: 13, padding: 40 }}>No dining orders yet.</div>
        )}
        {orders.map(o => {
          const partySize = o.table_booking?.party_size || o.party_size || "?";
          const bookingStatus = o.table_booking?.status || o.status;
          return (
            <Card key={o.order_id} style={{ borderTop: `3px solid ${C.green}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 12, fontFamily: "'DM Mono', monospace", color: C.muted }}>{o.order_id}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{fmtDate(o.created_at)} · {fmtTime(o.created_at)}</div>
                </div>
                <StatusBadge status={bookingStatus} />
              </div>

              <div style={{
                display: "flex", alignItems: "baseline", gap: 6,
                background: C.greenLight, borderRadius: 10, padding: "12px 14px", marginBottom: 14
              }}>
                <span style={{ fontSize: 36, fontWeight: 800, color: C.green, letterSpacing: -2 }}>{partySize}</span>
                <span style={{ fontSize: 12, color: C.green, fontWeight: 600 }}>
                  {partySize === 1 ? "person" : "people"}
                </span>
              </div>

              <div style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 600, fontSize: 14 }}>{o.customer_name}</div>
                <div style={{ fontSize: 12, color: C.muted }}>{o.phone}</div>
                <div style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
                  {o.items?.map(it => `${it.qty}× ${it.name}`).join(", ")}
                </div>
                <div style={{ fontWeight: 700, color: C.green, fontFamily: "'DM Mono', monospace", marginTop: 6 }}>₹{o.total}</div>
              </div>

              <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                {DINING_STATUSES.map(s => {
                  const active = bookingStatus === s;
                  return (
                    <button key={s} onClick={() => onStatus(o.order_id, s)} style={{
                      flex: 1, padding: "6px 0", borderRadius: 7,
                      border: `1px solid ${active ? C.green : C.border}`,
                      background: active ? C.green : C.faint,
                      color: active ? "#fff" : C.muted,
                      cursor: "pointer", fontSize: 10, fontFamily: "inherit", fontWeight: 600
                    }}>{STATUS_META[s]?.label || s}</button>
                  );
                })}
              </div>
              <Btn variant="secondary" onClick={() => onView(o)} style={{ width: "100%", fontSize: 11 }}>View Details</Btn>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

// ── Menu Tab ──────────────────────────────────────────────────────────────────
function MenuTab({ items, onAdd, onDelete }) {
  const [catFilter, setCatFilter] = useState("all");
  const available = items.filter(i => i.available !== false);
  const filtered = catFilter === "all" ? available : available.filter(i => i.category === catFilter);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <div style={{ fontWeight: 800, fontSize: 22, letterSpacing: -0.5 }}>Menu Items</div>
        <Btn onClick={onAdd}>+ Add Item</Btn>
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" }}>
        {["all", ...CATEGORIES].map(c => (
          <button key={c} onClick={() => setCatFilter(c)} style={{
            background: catFilter === c ? C.orange : C.surface,
            color: catFilter === c ? "#fff" : C.muted,
            border: `1px solid ${catFilter === c ? C.orange : C.border}`,
            borderRadius: 20, padding: "5px 14px", fontSize: 11, fontWeight: 600,
            cursor: "pointer", fontFamily: "inherit"
          }}>{c === "all" ? "All" : c.replace("_", " ")}</button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
        {filtered.length === 0 && (
          <div style={{ color: C.muted, fontSize: 13, gridColumn: "1/-1", padding: 40, textAlign: "center" }}>
            No items. Add one above.
          </div>
        )}
        {filtered.map(item => {
          const isVeg = item.tags?.includes("veg");
          const isSpecial = item.is_special;
          return (
            <Card key={item.id || item.name} style={{ position: "relative" }}>
              {isSpecial && (
                <div style={{
                  position: "absolute", top: 12, right: 12,
                  background: C.yellowLight, border: `1px solid ${C.yellow}40`,
                  borderRadius: 5, padding: "2px 7px", fontSize: 10, fontWeight: 700, color: C.yellow
                }}>⭐ SPECIAL</div>
              )}

              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <div style={{
                  width: 16, height: 16, border: `2px solid ${isVeg ? C.green : C.orange}`,
                  borderRadius: 3, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0
                }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: isVeg ? C.green : C.orange }} />
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, flex: 1, paddingRight: 30 }}>{item.name}</div>
              </div>

              <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                <Tag color={C.muted}>{item.category.replace("_", " ")}</Tag>
                <Tag color={isVeg ? C.green : C.orange}>{isVeg ? "Veg" : "Non-Veg"}</Tag>
                {item.tags?.includes("bestseller") && <Tag color={C.yellow}>Bestseller</Tag>}
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.green, letterSpacing: -0.5 }}>₹{item.price}</div>
                  {item.prep_time && (
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>
                      ⏱ {item.prep_time} min prep · +10 buffer
                    </div>
                  )}
                </div>
                <Btn variant="danger" onClick={() => onDelete(item.id || item.name)} style={{ fontSize: 11, padding: "5px 12px" }}>
                  Remove
                </Btn>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}