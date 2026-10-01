const { createClient } = window.supabase;
if (!window.SUPABASE_CONFIG?.url || !window.SUPABASE_CONFIG?.publishableKey)
  throw new Error("Create config.js first.");
const db = createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.publishableKey);
const $ = (s) => document.querySelector(s),
  $$ = (s) => [...document.querySelectorAll(s)];
const esc = (v) =>
  String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const fmt = (v) =>
  v
    ? new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }).format(new Date(v))
    : "—";
const statusClass = (v) =>
  String(v || "")
    .toLowerCase()
    .replaceAll(" ", "-");
function userDisplay() {
  const meta = user?.user_metadata || {};
  return (
    meta.display_name ||
    meta.name ||
    ((meta.role || "").toLowerCase() === "owner" ? "Owner" : meta.role) ||
    "Owner"
  );
}
function userRole() {
  const meta = user?.user_metadata || {};
  return meta.role || "Owner";
}
let user = null,
  inventory = [],
  incoming = [],
  buyers = [],
  orders = [],
  items = [],
  movements = [],
  sourcing = [],
  sourcingUpdates = [];

function toast(x) {
  const t = $("#toast");
  t.textContent = x;
  t.classList.add("show");
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove("show"), 2200);
}
async function load() {
  const r = await Promise.all([
    db.from("inventory").select("*").order("species"),
    db
      .from("incoming_stock")
      .select("*")
      .order("created_at", { ascending: false }),
    db.from("buyers").select("*"),
    db.from("orders").select("*").order("order_date", { ascending: false }),
    db.from("order_items").select("*"),
    db
      .from("inventory_movements")
      .select("*")
      .order("created_at", { ascending: false }),
    db.from("sourcing").select("*").order("created_at", { ascending: false }),
    db
      .from("sourcing_updates")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);
  r.forEach((x) => {
    if (x.error) throw x.error;
  });
  [
    inventory,
    incoming,
    buyers,
    orders,
    items,
    movements,
    sourcing,
    sourcingUpdates,
  ] = r.map((x) => x.data || []);
  render();
}
function render() {
  $("#statStock").textContent = inventory.reduce(
    (a, x) => a + Number(x.quantity || 0),
    0,
  );
  $("#statIncoming").textContent = incoming.filter(
    (x) => !["Arrived", "Rejected"].includes(x.status),
  ).length;
  $("#statPending").textContent = orders.filter(
    (x) => x.status === "Pending",
  ).length;
  $("#statOrders").textContent = orders.length;
  renderInventory();
  renderIncoming();
  renderOrders();
  renderSourcing();
  renderMovements();
  renderOverview();
}
function renderOverview() {
  const wa = orders.filter((x) => x.sales_channel === "WhatsApp").length,
    tp = orders.filter((x) => x.sales_channel === "Tokopedia").length,
    max = Math.max(wa, tp, 1);
  $("#channels").innerHTML = [
    ["WhatsApp", wa],
    ["Tokopedia", tp],
  ]
    .map(
      (x) =>
        `<div class="channel"><div><span>${x[0]}</span><b>${x[1]}</b></div><i style="width:${(x[1] / max) * 100}%"></i></div>`,
    )
    .join("");
  const low = inventory.filter((x) => Number(x.quantity) <= 1);
  $("#lowStock").innerHTML = low.length
    ? low
        .slice(0, 6)
        .map((x) => {
          const out = Number(x.quantity) <= 0;
          return `<div class="mini ${out ? "mini-danger" : "mini-warning"}"><b>${esc(x.species)}</b><span>${out ? "Out of stock" : x.quantity + " available"}</span></div>`;
        })
        .join("")
    : `<p class="muted">Everything looks healthy.</p>`;
}
function renderInventory() {
  const q = ($("#inventorySearch")?.value || "").toLowerCase();
  const rows = inventory.filter((x) => x.species.toLowerCase().includes(q));
  $("#inventoryRows").innerHTML = rows.length
    ? rows
        .map((x) => {
          const available =
            String(x.availability || "").toLowerCase() === "available";
          return `<tr><td><b>${esc(x.species)}</b></td><td class="qty">${x.quantity}</td><td><span class="pill ${available ? "available" : "unavailable"}"><span class="pill-dot"></span>${esc(x.availability)}</span></td><td class="muted">${esc(x.notes || "—")}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="4" class="empty">No inventory.</td></tr>`;
}
function renderIncoming() {
  const q = ($("#incomingSearch")?.value || "").toLowerCase();
  const rows = incoming.filter((x) => x.species.toLowerCase().includes(q));
  $("#incomingRows").innerHTML = rows.length
    ? rows
        .map(
          (x) =>
            `<tr><td><b>${esc(x.species)}</b></td><td>${x.qty}</td><td><span class="pill status-${statusClass(x.status)}"><span class="pill-dot"></span>${esc(x.status)}</span></td><td>${esc(x.receipt_number || "—")}</td><td><span class="pill ${x.payment_status === "Paid" ? "paid" : "unpaid"}"><span class="pill-dot"></span>${x.payment_status}</span></td><td>${fmt(x.eta)}</td><td>${fmt(x.last_update)}</td></tr>`,
        )
        .join("")
    : `<tr><td colspan="7" class="empty">No incoming stock.</td></tr>`;
}
function buyer(id) {
  return buyers.find((x) => x.id === id);
}
function renderOrders() {
  const q = ($("#ordersSearch")?.value || "").toLowerCase();
  const rows = orders.filter(
    (o) =>
      String(o.order_number).includes(q) ||
      (buyer(o.buyer_id)?.name || "").toLowerCase().includes(q),
  );
  $("#orderRows").innerHTML = rows.length
    ? rows
        .map((o) => {
          const b = buyer(o.buyer_id),
            it = items.filter((x) => x.order_id === o.id);
          return `<article class="order"><div class="order-head"><div><p class="eyebrow">ORDER #${o.order_number}</p><h2>${esc(b?.name || "No buyer")}</h2></div><span class="order-status status-${statusClass(o.status)}"><span class="pill-dot"></span>${esc(o.status)}</span></div><div class="meta">${o.sales_channel} · ${fmt(o.order_date)} ${o.tracking_number ? "· Resi " + esc(o.tracking_number) : ""}</div><div class="chips">${it.map((x) => `<span>${esc(x.species)} × ${x.quantity}</span>`).join("")}</div><button class="ghost status-action" data-status="${o.id}">Change status</button></article>`;
        })
        .join("")
    : `<div class="empty-card">No orders.</div>`;
}
function renderSourcing() {
  const q = ($("#sourcingSearch")?.value || "").toLowerCase();

  const rows = sourcing.filter(
    (x) =>
      String(x.species || "")
        .toLowerCase()
        .includes(q) ||
      String(x.source_name || "")
        .toLowerCase()
        .includes(q) ||
      String(x.pic || "")
        .toLowerCase()
        .includes(q),
  );

  $("#sourcingRows").innerHTML = rows.length
    ? rows
        .map(
          (x) => `
            <tr class="sourcing-row" data-sourcing-id="${x.id}">
              <td><b>${esc(x.species)}</b></td>
              <td>${x.quantity}</td>
              <td>${esc(x.source_name || "—")}</td>
              <td>${esc(x.pic || "—")}</td>
              <td>
                <span class="pill status-${statusClass(x.status)}">
                  <span class="pill-dot"></span>
                  ${esc(x.status)}
                </span>
              </td>
              <td>${fmt(x.target_date)}</td>
              <td>${esc(x.last_update || "—")}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="7" class="empty">No sourcing records.</td></tr>`;
}
function openSourcing(id) {
  const x = sourcing.find((item) => item.id === id);
  if (!x) return;

  const updates = sourcingUpdates.filter((u) => u.sourcing_id === x.id);

  dialog(
    x.species,
    "SOURCING DETAIL",
    `
      <div class="form">
        <div>
          <p class="eyebrow">STATUS</p>
          <span class="pill status-${statusClass(x.status)}">
            <span class="pill-dot"></span>
            ${esc(x.status)}
          </span>
        </div>

        <div>
          <p class="eyebrow">SOURCE</p>
          <p>${esc(x.source_name || "—")}</p>
        </div>

        <div>
          <p class="eyebrow">PIC</p>
          <p>${esc(x.pic || "—")}</p>
        </div>

        <div>
          <p class="eyebrow">QUANTITY</p>
          <p>${x.quantity}</p>
        </div>

        <div>
          <p class="eyebrow">TARGET DATE</p>
          <p>${fmt(x.target_date)}</p>
        </div>

        <div>
          <p class="eyebrow">ETA</p>
          <p>${fmt(x.eta)}</p>
        </div>

        <div>
          <p class="eyebrow">LAST UPDATE</p>
          <p>${esc(x.last_update || "—")}</p>
        </div>

        <div>
          <p class="eyebrow">NOTES</p>
          <p>${esc(x.notes || "—")}</p>
        </div>
      </div>
    `,
    async () => {},
  );
}
function renderMovements() {
  $("#movementRows").innerHTML = movements.length
    ? movements
        .map((m) => {
          const x = inventory.find((i) => i.id === m.inventory_id);
          return `<tr><td><b>${esc(x?.species || "Unknown")}</b></td><td class="${m.quantity_change > 0 ? "plus" : "minus"}">${m.quantity_change > 0 ? "+" : ""}${m.quantity_change}</td><td>${esc(m.movement_type)}</td><td>${esc(m.reference_type || "—")}</td><td>${fmt(m.created_at)}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="5" class="empty">No movements.</td></tr>`;
}
function dialog(title, eyebrow, html, submit) {
  $("#dialogTitle").textContent = title;
  $("#dialogEyebrow").textContent = eyebrow;
  $("#dialogBody").innerHTML = html;
  $("#dialog").showModal();
  const f = $("#dialog form");
  if (f)
    f.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await submit(new FormData(f));
      } catch (x) {
        console.error(x);
        toast(x.message || "Save failed");
      }
    };
}
function closeDialog() {
  $("#dialog").close();
}
function addInventory() {
  dialog(
    "Add species",
    "INVENTORY",
    `<form class="form"><label>Species<input name="species" required></label><label>Quantity<input name="quantity" type="number" min="0" value="0" required></label><label>Notes<textarea name="notes"></textarea></label><div class="actions"><button type="button" class="ghost" data-close>Cancel</button><button class="primary">Save</button></div></form>`,
    async (f) => {
      const q = Number(f.get("quantity"));
      const { error } = await db.from("inventory").insert({
        species: f.get("species").trim(),
        quantity: q,
        availability: q > 0 ? "Available" : "Unavailable",
        notes: f.get("notes") || null,
      });
      if (error) throw error;
      closeDialog();
      toast("Species added ✓");
      load();
    },
  );
}
function addIncoming() {
  dialog(
    "Add incoming stock",
    "INCOMING STOCK",
    `<form class="form"><label>Species<input name="species" required></label><label>Qty<input name="qty" type="number" min="1" required></label><label>Status<select name="status"><option>In progress</option><option>Shipped</option><option>On Process</option><option>Rejected</option><option>Arrived</option></select></label><label>No. Resi<input name="receipt_number"></label><label>Paid / Unpaid<select name="payment_status"><option>Unpaid</option><option>Paid</option></select></label><label>ETA<input name="eta" type="date"></label><div class="actions"><button type="button" class="ghost" data-close>Cancel</button><button class="primary">Save</button></div></form>`,
    async (f) => {
      const { error } = await db.from("incoming_stock").insert({
        species: f.get("species").trim(),
        qty: Number(f.get("qty")),
        status: f.get("status"),
        receipt_number: f.get("receipt_number") || null,
        payment_status: f.get("payment_status"),
        eta: f.get("eta") || null,
      });
      if (error) throw error;
      closeDialog();
      toast("Incoming stock added ✓");
      load();
    },
  );
}
function addSourcing() {
  dialog(
    "New sourcing",
    "SOURCING",
    `<form class="form">
      <label>
        Species
        <input name="species" required>
      </label>

      <label>
        Quantity
        <input name="quantity" type="number" min="1" value="1" required>
      </label>

      <label>
        Source
        <input name="source_name" placeholder="Supplier / hunter / partner">
      </label>

      <label>
        Source contact
        <input name="source_contact">
      </label>

      <label>
        PIC
        <input name="pic">
      </label>

      <label>
        Status
        <select name="status">
          <option>Looking</option>
          <option>Contacted</option>
          <option>Confirmed</option>
          <option>On Process</option>
          <option>Ready</option>
          <option>Arrived</option>
          <option>Cancelled</option>
        </select>
      </label>

      <label>
        Target date
        <input name="target_date" type="date">
      </label>

      <label>
        ETA
        <input name="eta" type="date">
      </label>

      <label>
        Price
        <input name="price" type="number" min="0" value="0">
      </label>

      <label>
        DP
        <input name="dp" type="number" min="0" value="0">
      </label>

      <label>
        Last update
        <input name="last_update" placeholder="e.g. Waiting supplier confirmation">
      </label>

      <label>
        Notes
        <textarea name="notes"></textarea>
      </label>

      <div class="actions">
        <button type="button" class="ghost" data-close>Cancel</button>
        <button class="primary">Save sourcing</button>
      </div>
    </form>`,
    async (f) => {
      const { error } = await db.from("sourcing").insert({
        species: f.get("species").trim(),
        quantity: Number(f.get("quantity")),
        source_name: f.get("source_name") || null,
        source_contact: f.get("source_contact") || null,
        pic: f.get("pic") || null,
        status: f.get("status"),
        target_date: f.get("target_date") || null,
        eta: f.get("eta") || null,
        price: Number(f.get("price") || 0),
        dp: Number(f.get("dp") || 0),
        last_update: f.get("last_update") || null,
        notes: f.get("notes") || null,
      });

      if (error) throw error;

      closeDialog();
      toast("Sourcing added ✓");
      load();
    },
  );
}
function addOrder() {
  const opts = inventory
    .filter((x) => x.quantity > 0)
    .map(
      (x) =>
        `<option value="${x.id}">${esc(x.species)} · ${x.quantity}</option>`,
    )
    .join("");
  dialog(
    "New order",
    "ORDER",
    `<form class="form"><label>Buyer name<input name="name" required></label><label>Phone<input name="phone"></label><label>Address<textarea name="address"></textarea></label><label>Sales channel<select name="channel"><option>WhatsApp</option><option>Tokopedia</option></select></label><label>Species<select name="inventory" required>${opts}</select></label><label>Quantity<input name="quantity" type="number" min="1" value="1" required></label><label>Courier<input name="courier"></label><label>Tracking number<input name="tracking"></label><div class="actions"><button type="button" class="ghost" data-close>Cancel</button><button class="primary">Create order</button></div></form>`,
    async (f) => {
      const { data: b, error: be } = await db
        .from("buyers")
        .insert({
          name: f.get("name").trim(),
          phone: f.get("phone") || null,
          address: f.get("address") || null,
        })
        .select()
        .single();
      if (be) throw be;
      const inv = inventory.find((x) => x.id === f.get("inventory"));
      if (!inv) throw new Error("Inventory not found");
      const { data: o, error: oe } = await db
        .from("orders")
        .insert({
          buyer_id: b.id,
          sales_channel: f.get("channel"),
          courier: f.get("courier") || null,
          tracking_number: f.get("tracking") || null,
        })
        .select()
        .single();
      if (oe) throw oe;
      const { error: ie } = await db.from("order_items").insert({
        order_id: o.id,
        inventory_id: inv.id,
        species: inv.species,
        quantity: Number(f.get("quantity")),
      });
      if (ie) throw ie;
      closeDialog();
      toast(`Order #${o.order_number} created ✓`);
      load();
    },
  );
}
function changeStatus(id) {
  const o = orders.find((x) => x.id === id);
  if (!o) return;
  const next =
    {
      Pending: ["Confirmed", "Cancelled"],
      Confirmed: ["Shipped", "Cancelled"],
      Shipped: ["Delivered", "Returned"],
      Delivered: ["Returned"],
      Cancelled: [],
      Returned: [],
    }[o.status] || [];
  if (!next.length) return toast("This order is final.");
  dialog(
    `Order #${o.order_number} — Change status`,
    "ORDER STATUS",
    `<form class="form"><p class="muted">Current: <b>${o.status}</b></p><label>New status<select name="status">${next.map((x) => `<option>${x}</option>`).join("")}</select></label><div class="actions"><button type="button" class="ghost" data-close>Cancel</button><button class="primary">Update</button></div></form>`,
    async (f) => {
      const { error } = await db
        .from("orders")
        .update({ status: f.get("status") })
        .eq("id", id);
      if (error) throw error;
      closeDialog();
      toast("Status updated ✓");
      load();
    },
  );
}
async function login(e) {
  e.preventDefault();
  $("#loginError").textContent = "";
  $("#loginBtn").disabled = true;
  $("#loginBtn").textContent = "Logging in...";
  try {
    const { data, error } = await db.auth.signInWithPassword({
      email: $("#email").value.trim(),
      password: $("#password").value,
    });
    if (error) throw error;
    user = data.user;
    authUI();
  } catch (x) {
    $("#loginError").textContent = x.message;
  } finally {
    $("#loginBtn").disabled = false;
    $("#loginBtn").textContent = "Login";
  }
}
function authUI() {
  const ok = !!user;
  $("#loginView").classList.toggle("hidden", ok);
  $("#appView").classList.toggle("hidden", !ok);
  if (ok) {
    $("#currentKeeper").textContent = userDisplay();
    $("#currentKeeperRole").textContent = userRole();
    load().catch((e) => toast(e.message));
  }
}
function setup() {
  $("#loginForm").onsubmit = login;
  const mobileMenu = $("#mobileMenuBtn"),
    sidebar = $(".sidebar"),
    backdrop = $("#navBackdrop");
  const closeMobileMenu = () => {
    sidebar.classList.remove("open");
    backdrop.classList.remove("open");
    document.body.classList.remove("no-scroll");
    mobileMenu?.setAttribute("aria-expanded", "false");
  };
  mobileMenu?.addEventListener("click", () => {
    const open = !sidebar.classList.contains("open");
    sidebar.classList.toggle("open", open);
    backdrop.classList.toggle("open", open);
    document.body.classList.toggle("no-scroll", open);
    mobileMenu.setAttribute("aria-expanded", String(open));
  });
  backdrop?.addEventListener("click", closeMobileMenu);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeMobileMenu();
  });
  $("#logoutBtn").onclick = () => db.auth.signOut();
  $("#refreshBtn").onclick = () => load().then(() => toast("Refreshed ✓"));
  $$("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        $$(".view").forEach((v) => v.classList.add("hidden"));
        $("#" + b.dataset.view).classList.remove("hidden");
        $$(".nav").forEach((n) => n.classList.remove("active"));
        b.classList.add("active");
        $("#pageTitle").textContent = b.textContent;
        closeMobileMenu();
      }),
  );
  $("#inventorySearch").oninput = renderInventory;
  $("#incomingSearch").oninput = renderIncoming;
  $("#ordersSearch").oninput = renderOrders;
  $("#sourcingSearch").oninput = renderSourcing;
  $("#addInventory").onclick = addInventory;
  $("#addIncoming").onclick = addIncoming;
  $("#addOrder").onclick = addOrder;
  $("#addSourcing").onclick = addSourcing;
  $("#orderRows").onclick = (e) => {
    const b = e.target.closest("[data-status]");
    if (b) changeStatus(b.dataset.status);
  };
  $("#sourcingRows").onclick = (e) => {
    const row = e.target.closest("[data-sourcing-id]");
    if (row) openSourcing(row.dataset.sourcingId);
  };
  $("#dialog").onclick = (e) => {
    if (e.target.matches("[data-close]")) closeDialog();
  };
  db.auth.onAuthStateChange((_e, s) => {
    user = s?.user || null;
    authUI();
  });
  db.auth.getSession().then(({ data }) => {
    user = data.session?.user || null;
    authUI();
  });
}
setup();
