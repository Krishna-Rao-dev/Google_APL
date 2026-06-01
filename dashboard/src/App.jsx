// dashboard/src/App.jsx
import { useState, useEffect, useCallback } from "react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from "recharts";

const API = "http://localhost:8000";

const STATUS_COLOR = {
  placed: "#f59e0b",
  preparing: "#3b82f6",
  out_for_delivery: "#8b5cf6",
  delivered: "#10b981",
  cancelled: "#ef4444",
  booked: "#f59e0b",
  seated: "#3b82f6",
  done: "#10b981",
};

function Badge({ status }) {
  return (
    <span style={{
      background: STATUS_COLOR[status] + "22",
      color: STATUS_COLOR[status],
      border: `1px solid ${STATUS_COLOR[status]}55`,
      padding: "2px 10px",
      borderRadius: 99,
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: 1,
      textTransform: "uppercase"
    }}>{status.replace(/_/g, " ")}</span>
  );
}

const TABS = ["Overview", "Deliveries", "Dining"];

export default function App() {
  const [tab, setTab] = useState("Overview");
  const [data, setData] = useState({ orders: [], analytics: {} });
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`${API}/dashboard`);
      const json = await res.json();
      setData(json);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const iv = setInterval(fetchData, 15000); // poll every 15s
    return () => clearInterval(iv);
  }, [fetchData]);

  const deliveries = data.orders.filter(o => o.delivery_type === "home_delivery");
  const dining = data.orders.filter(o => o.delivery_type === "dining");
  const analytics = data.analytics || {};

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0a0a0f",
      color: "#e8e4dc",
      fontFamily: "'DM Mono', 'Courier New', monospace",
      padding: "0",
    }}>
      {/* Header */}
      <div style={{
        borderBottom: "1px solid #1e1e2e",
        padding: "20px 30px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        background: "#0d0d17"
      }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: 0, color: "#f59e0b", marginBottom: 4 }}>ADMIN PANEL</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -1 }}>Restaurant Name: 🍛 Kukkad Nukkad</div>
        </div>
        <div style={{ fontSize: 11, color: "#666", letterSpacing: 2 }}>
          LIVE · {new Date().toLocaleTimeString("en-IN")}
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", gap: 0, borderBottom: "1px solid #1e1e2e", padding: "0 40px", background: "#0d0d17" }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: "none", border: "none",
            borderBottom: tab === t ? "2px solid #f59e0b" : "2px solid transparent",
            color: tab === t ? "#f59e0b" : "#666",
            padding: "14px 24px",
            cursor: "pointer",
            fontSize: 12,
            letterSpacing: 2,
            fontFamily: "inherit",
            fontWeight: tab === t ? 700 : 400
          }}>{t.toUpperCase()}</button>
        ))}
      </div>

      <div style={{ padding: "32px 40px" }}>
        {loading ? (
          <div style={{ color: "#666", textAlign: "center", marginTop: 80 }}>Loading data...</div>
        ) : (
          <>
            {tab === "Overview" && <Overview analytics={analytics} orders={data.orders} />}
            {tab === "Deliveries" && <Deliveries orders={deliveries} refresh={fetchData} />}
            {tab === "Dining" && <DiningView orders={dining} refresh={fetchData} />}
          </>
        )}
      </div>
    </div>
  );
}

// ── Overview ─────────────────────────────────────────────────────────────────
function Overview({ analytics, orders }) {
  const todayOrders = orders.filter(o => {
    const d = new Date(o.created_at);
    const today = new Date();
    return d.toDateString() === today.toDateString();
  });
  const todayRevenue = todayOrders.filter(o => o.status !== "cancelled")
    .reduce((s, o) => s + o.total, 0);
  const activeOrders = orders.filter(o => ["placed", "preparing", "out_for_delivery", "booked", "seated"].includes(o.status)).length;

  const statCards = [
    { label: "Today's Revenue", value: `₹${todayRevenue.toLocaleString("en-IN")}`, color: "#f59e0b" },
    { label: "Today's Orders", value: todayOrders.length, color: "#3b82f6" },
    { label: "Active Right Now", value: activeOrders, color: "#10b981" },
    { label: "Total Orders", value: orders.length, color: "#8b5cf6" },
  ];

  // Item frequency
  const itemCount = {};
  orders.forEach(o => o.items?.forEach(item => {
    itemCount[item.name] = (itemCount[item.name] || 0) + item.qty;
  }));
  const topItems = Object.entries(itemCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([name, count]) => ({ name: name.split(" ").slice(0, 2).join(" "), count }));

  // Revenue by day (last 7)
  const dayRevenue = {};

  orders.forEach(o => {
    if (o.status === "cancelled") return;

    const d = new Date(o.created_at).toLocaleDateString("en-IN", {
      weekday: "short"
    });

    dayRevenue[d] = (dayRevenue[d] || 0) + o.total;
  });
  const revenueChart = Object.entries(dayRevenue).map(([day, revenue]) => ({ day, revenue }));

  return (
    <div>
      {/* Stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 32 }}>
        {statCards.map(c => (
          <div key={c.label} style={{
            background: "#0d0d17",
            border: "1px solid #1e1e2e",
            borderRadius: 12,
            padding: "20px 24px",
          }}>
            <div style={{ fontSize: 10, color: "#666", letterSpacing: 2, marginBottom: 8 }}>{c.label.toUpperCase()}</div>
            <div style={{ fontSize: 28, fontWeight: 700, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <ChartCard title="TOP ITEMS ORDERED">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={topItems} margin={{ left: -20 }}>
              <XAxis dataKey="name" tick={{ fill: "#666", fontSize: 10 }} />
              <YAxis tick={{ fill: "#666", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#0d0d17", border: "1px solid #1e1e2e", color: "#e8e4dc" }} />
              <Bar dataKey="count" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="REVENUE BY DAY">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={revenueChart} margin={{ left: -20 }}>
              <CartesianGrid stroke="#1e1e2e" />
              <XAxis dataKey="day" tick={{ fill: "#666", fontSize: 10 }} />
              <YAxis tick={{ fill: "#666", fontSize: 10 }} />
              <Tooltip contentStyle={{ background: "#0d0d17", border: "1px solid #1e1e2e", color: "#e8e4dc" }} formatter={(v) => `₹${v}`} />
              <Line dataKey="revenue" stroke="#3b82f6" strokeWidth={2} dot={{ fill: "#3b82f6" }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>
      </div>
    </div>
  );
}

function ChartCard({ title, children }) {
  return (
    <div style={{ background: "#0d0d17", border: "1px solid #1e1e2e", borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 10, color: "#666", letterSpacing: 2, marginBottom: 16 }}>{title}</div>
      {children}
    </div>
  );
}

// ── Deliveries ────────────────────────────────────────────────────────────────
function Deliveries({ orders, refresh }) {
  const STATUSES = ["placed", "preparing", "out_for_delivery", "delivered", "cancelled"];

  const updateStatus = async (orderId, status) => {
    await fetch(`${API}/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    refresh();
  };

  return (
    <div>
      <div style={{ fontSize: 10, color: "#666", letterSpacing: 3, marginBottom: 20 }}>
        {orders.length} DELIVERY ORDERS
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {orders.length === 0 && <div style={{ color: "#444", textAlign: "center", marginTop: 60 }}>No delivery orders yet.</div>}
        {orders.map(o => (
          <div key={o.order_id} style={{
            background: "#0d0d17",
            border: "1px solid #1e1e2e",
            borderRadius: 12,
            padding: "16px 20px",
            display: "grid",
            gridTemplateColumns: "120px 1fr 1fr 160px 120px",
            alignItems: "center",
            gap: 16
          }}>
            <div>
              <div style={{ fontSize: 10, color: "#666" }}>ORDER ID</div>
              <div style={{ fontWeight: 700, fontSize: 13 }}>{o.order_id}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#666" }}>CUSTOMER</div>
              <div style={{ fontWeight: 600 }}>{o.customer_name}</div>
              <div style={{ fontSize: 11, color: "#888" }}>{o.phone}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#666" }}>ADDRESS</div>
              <div style={{ fontSize: 12 }}>{o.address}</div>
              <div style={{ fontSize: 11, color: "#888" }}>{o.pincode}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 6 }}>STATUS</div>
              <Badge status={o.status} />
            </div>
            <div>
              <div style={{ fontSize: 10, color: "#666", marginBottom: 6 }}>UPDATE</div>
              <select
                defaultValue={o.status}
                onChange={e => updateStatus(o.order_id, e.target.value)}
                style={{
                  background: "#1a1a2e", border: "1px solid #333", color: "#e8e4dc",
                  padding: "4px 8px", borderRadius: 6, fontSize: 11, fontFamily: "inherit", cursor: "pointer"
                }}
              >
                {STATUSES.map(s => <option key={s} value={s}>{s.replace(/_/g, " ")}</option>)}
              </select>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Dining ────────────────────────────────────────────────────────────────────
function DiningView({ orders, refresh }) {
  const updateStatus = async (orderId, status) => {
    await fetch(`${API}/orders/${orderId}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status })
    });
    refresh();
  };

  return (
    <div>
      <div style={{ fontSize: 10, color: "#666", letterSpacing: 3, marginBottom: 20 }}>
        {orders.length} TABLE BOOKINGS
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
        {orders.length === 0 && <div style={{ color: "#444" }}>No dining orders yet.</div>}
        {orders.map(o => (
          <div key={o.order_id} style={{
            background: "#0d0d17",
            border: "1px solid #1e1e2e",
            borderRadius: 12,
            padding: 20
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 12, fontWeight: 700 }}>{o.order_id}</div>
              <Badge status={o.table_booking?.status || o.status} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <span style={{ fontSize: 24, fontWeight: 700, color: "#f59e0b" }}>
                {o.table_booking?.party_size || "?"}
              </span>
              <span style={{ fontSize: 12, color: "#888", marginLeft: 6 }}>people</span>
            </div>
            <div style={{ fontSize: 13, marginBottom: 4 }}>{o.customer_name}</div>
            <div style={{ fontSize: 11, color: "#888", marginBottom: 12 }}>{o.phone}</div>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 16 }}>
              {o.items?.map(i => `${i.qty}x ${i.name}`).join(", ")}
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {["booked", "seated", "done"].map(s => (
                <button key={s} onClick={() => updateStatus(o.order_id, s)} style={{
                  flex: 1, padding: "6px 0", borderRadius: 6, border: "1px solid #333",
                  background: o.status === s ? STATUS_COLOR[s] : "#1a1a2e",
                  color: o.status === s ? "#000" : "#888",
                  cursor: "pointer", fontSize: 10, fontFamily: "inherit", letterSpacing: 1
                }}>{s.toUpperCase()}</button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}