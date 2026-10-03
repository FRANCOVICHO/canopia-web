// ── Helpers de imágenes ────────────────────────────────────────────────────────
const TOKEN_KEY = "canopia_admin_token";
/** Convierte el campo image (string o JSON array) a un array de URLs. */
function parseImages(raw) {
  if (!raw) return [""];
  const s = String(raw).trim();
  if (s.startsWith("[")) {
    try {
      const arr = JSON.parse(s);
      return Array.isArray(arr) && arr.length ? arr : [""];
    } catch { return [s]; }
  }
  return [s];
}

/** Llena el editor de imágenes con las URLs del producto. */
function setImageInputs(raw) {
  const urls = parseImages(raw);
  const container = document.querySelector("#image-inputs");
  container.innerHTML = "";
  urls.forEach((url) => addImageRow(url));
}

/** Agrega una fila de input de imagen. */
function addImageRow(value = "") {
  const container = document.querySelector("#image-inputs");
  const row = document.createElement("div");
  row.className = "image-input-row";
  row.innerHTML = `
    <input name="images[]" placeholder="https://..." value="${value.replace(/"/g, "&quot;")}" />
    <button type="button" class="img-row-remove" aria-label="Quitar">✕</button>`;
  row.querySelector(".img-row-remove").addEventListener("click", () => {
    if (container.querySelectorAll(".image-input-row").length > 1) row.remove();
  });
  container.appendChild(row);
  // Ocultar botón de la primera fila
  updateRemoveButtons();
}

function updateRemoveButtons() {
  const rows = document.querySelectorAll("#image-inputs .image-input-row");
  rows.forEach((row, i) => {
    const btn = row.querySelector(".img-row-remove");
    btn.style.opacity = i === 0 ? "0" : "1";
    btn.style.pointerEvents = i === 0 ? "none" : "auto";
  });
}

/** Lee los inputs de imagen y devuelve el array de URLs no vacías. */
function getImageValues() {
  return [...document.querySelectorAll("#image-inputs input[name='images[]']")]
    .map((i) => i.value.trim())
    .filter(Boolean);
}


const formatPrice = (value) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);

let token = sessionStorage.getItem(TOKEN_KEY) || "";
let products = [];
let categories = [];
let lastUpdatedAt = null;
let editingId = null;

const loginSection = document.querySelector("#login-section");
const adminPanel = document.querySelector("#admin-panel");
const loginForm = document.querySelector("#login-form");
const loginMessage = document.querySelector("#login-message");
const productTableBody = document.querySelector("#product-table-body");
const productDialog = document.querySelector("#product-dialog");
const productForm = document.querySelector("#product-form");
const formMessage = document.querySelector("#form-message");
const syncStatus = document.querySelector("#sync-status");
const liveBadge = document.querySelector("#live-badge");

function authHeaders() {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "No se pudo completar la accion.");
  return data;
}

async function loadCategories() {
  // Intentar cargar desde la API (DB)
  try {
    const data = await api("/api/categories");
    categories = (data.categories || []).map((c) => ({
      id: c.name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-"),
      name: c.name,
      description: c.description || "",
    }));
  } catch {
    // Fallback a site.json si la API no responde
    try {
      const response = await fetch("data/site.json", { cache: "no-store" });
      const data = await response.json();
      categories = data.categories || [];
    } catch {
      categories = [
        { id: "parafernalia", name: "Parafernalia" },
        { id: "grow", name: "Grow" },
        { id: "picadores", name: "Picadores" },
        { id: "combos", name: "Combos" },
      ];
    }
  }

  const filter = document.querySelector("#filter-category");
  const formCategory = document.querySelector("#form-category");
  const options = categories
    .map((cat) => `<option value="${cat.id}">${cat.name}</option>`)
    .join("");

  filter.innerHTML = `<option value="todos">Todas las categorias</option>${options}`;
  formCategory.innerHTML = options;
}

async function loadProducts() {
  const data = await api("/api/products");
  products = data.products || [];
  lastUpdatedAt = data.updatedAt || null;
  renderProducts();
  renderStats();
  syncStatus.textContent = `Ultima actualizacion: ${lastUpdatedAt || "sin datos"}. La tienda se refresca sola.`;
}

function renderStats() {
  const stats = document.querySelector("#admin-stats");
  const visible = products.filter((p) => p.visible).length;
  const outOfStock = products.filter((p) => Number(p.stock) <= 0).length;
  const lowStock = products.filter((p) => Number(p.stock) > 0 && Number(p.stock) <= 3).length;

  stats.innerHTML = `
    <article class="stat-card"><span>Total</span><strong>${products.length}</strong></article>
    <article class="stat-card"><span>Visibles</span><strong>${visible}</strong></article>
    <article class="stat-card"><span>Sin stock</span><strong>${outOfStock}</strong></article>
    <article class="stat-card"><span>Stock bajo</span><strong>${lowStock}</strong></article>
  `;
}

function filteredProducts() {
  const search = document.querySelector("#search-products").value.trim().toLowerCase();
  const category = document.querySelector("#filter-category").value;

  return products.filter((product) => {
    const matchesCategory = category === "todos" || product.category === category;
    const matchesSearch =
      !search ||
      product.name.toLowerCase().includes(search) ||
      product.id.toLowerCase().includes(search);
    return matchesCategory && matchesSearch;
  });
}

function renderProducts() {
  const rows = filteredProducts();
  if (!rows.length) {
    productTableBody.innerHTML = `<tr><td colspan="6">No hay productos para mostrar.</td></tr>`;
    return;
  }

  productTableBody.innerHTML = rows
    .map(
      (product) => `
        <tr>
          <td>
            <strong>${product.name}</strong>
            <small>${product.id}</small>
          </td>
          <td>${product.category}</td>
          <td>${formatPrice(product.price)}</td>
          <td>
            <div class="stock-editor">
              <button type="button" data-stock-dec="${product.id}">-</button>
              <span>${product.stock}</span>
              <button type="button" data-stock-inc="${product.id}">+</button>
            </div>
          </td>
          <td>
            <span class="status-pill ${product.visible ? "is-on" : "is-off"}">${product.visible ? "Visible" : "Oculto"}</span>
            ${product.featured ? '<span class="status-pill is-featured">Destacado</span>' : ""}
          </td>
          <td class="row-actions">
            <button class="button ghost" type="button" data-edit="${product.id}">Editar</button>
            <button class="button ghost danger" type="button" data-delete="${product.id}">Borrar</button>
          </td>
        </tr>
      `,
    )
    .join("");

  productTableBody.querySelectorAll("[data-edit]").forEach((button) => {
    button.addEventListener("click", () => openEditDialog(button.dataset.edit));
  });
  productTableBody.querySelectorAll("[data-delete]").forEach((button) => {
    button.addEventListener("click", () => deleteProduct(button.dataset.delete));
  });
  productTableBody.querySelectorAll("[data-stock-inc]").forEach((button) => {
    button.addEventListener("click", () => adjustStock(button.dataset.stockInc, 1));
  });
  productTableBody.querySelectorAll("[data-stock-dec]").forEach((button) => {
    button.addEventListener("click", () => adjustStock(button.dataset.stockDec, -1));
  });
}

function openCreateDialog() {
  editingId = null;
  productForm.reset();
  productForm.mode.value = "create";
  productForm.id.disabled = false;
  productForm.visible.checked = true;
  setImageInputs("");
  document.querySelector("#dialog-title").textContent = "Nuevo producto";
  formMessage.textContent = "";
  productDialog.showModal();
}

function openEditDialog(id) {
  const product = products.find((item) => item.id === id);
  if (!product) return;

  editingId = id;
  productForm.mode.value = "edit";
  productForm.id.value = product.id;
  productForm.id.disabled = true;
  productForm.name.value = product.name;
  productForm.category.value = product.category;
  productForm.price.value = product.price;
  productForm.stock.value = product.stock;
  productForm.tag.value = product.tag;
  setImageInputs(product.image || "");
  productForm.description.value = product.description || "";
  productForm.featured.checked = Boolean(product.featured);
  productForm.visible.checked = Boolean(product.visible);
  document.querySelector("#dialog-title").textContent = "Editar producto";
  formMessage.textContent = "";
  productDialog.showModal();
}

async function saveProduct(event) {
  event.preventDefault();
  formMessage.textContent = "Guardando...";

  const form = new FormData(productForm);
  const payload = {
    id: form.get("id"),
    name: form.get("name"),
    category: form.get("category"),
    description: form.get("description"),
    price: Number(form.get("price")),
    tag: form.get("tag"),
    images: getImageValues(),          // array de URLs
    image: getImageValues()[0] || "",  // primera (compatibilidad)
    stock: Number(form.get("stock")),
    featured: form.get("featured") === "on",
    visible: form.get("visible") === "on",
  };

  try {
    if (productForm.mode.value === "create") {
      await api("/api/products", { method: "POST", body: JSON.stringify(payload) });
    } else {
      payload.id = editingId;
      await api("/api/products", { method: "PUT", body: JSON.stringify(payload) });
    }
    productDialog.close();
    await loadProducts();
  } catch (error) {
    formMessage.textContent = error.message;
  }
}

async function adjustStock(id, delta) {
  const product = products.find((item) => item.id === id);
  if (!product) return;

  const stock = Math.max(0, Number(product.stock) + delta);
  try {
    await api("/api/products", {
      method: "PUT",
      body: JSON.stringify({ ...product, stock }),
    });
    await loadProducts();
  } catch (error) {
    syncStatus.textContent = error.message;
  }
}

async function deleteProduct(id) {
  const product = products.find((item) => item.id === id);
  if (!product) return;
  if (!confirm(`Borrar "${product.name}"?`)) return;

  try {
    await api(`/api/products?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await loadProducts();
  } catch (error) {
    syncStatus.textContent = error.message;
  }
}

function showAdmin() {
  loginSection.hidden = true;
  adminPanel.hidden = false;
  document.querySelector("#logout-btn").hidden = false;
  liveBadge.hidden = false;
}

function showLogin() {
  loginSection.hidden = false;
  adminPanel.hidden = true;
  document.querySelector("#logout-btn").hidden = true;
  liveBadge.hidden = true;
}

async function tryLogin(candidate) {
  token = candidate.trim();
  sessionStorage.setItem(TOKEN_KEY, token);
  await loadProducts();
  showAdmin();
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  loginMessage.textContent = "Verificando...";
  try {
    await tryLogin(new FormData(loginForm).get("token"));
    loginMessage.textContent = "";
  } catch (error) {
    token = "";
    sessionStorage.removeItem(TOKEN_KEY);
    loginMessage.textContent = error.message;
  }
});

document.querySelector("#logout-btn").addEventListener("click", () => {
  token = "";
  sessionStorage.removeItem(TOKEN_KEY);
  showLogin();
});

document.querySelector("#new-product-btn").addEventListener("click", openCreateDialog);
document.querySelector("#close-dialog").addEventListener("click", () => productDialog.close());
document.querySelector("#cancel-dialog").addEventListener("click", () => productDialog.close());
productForm.addEventListener("submit", saveProduct);
document.querySelector("#search-products").addEventListener("input", renderProducts);
document.querySelector("#filter-category").addEventListener("change", renderProducts);

async function pollCatalog() {
  if (!token) return;
  try {
    const response = await fetch("/api/products", { headers: authHeaders(), cache: "no-store" });
    const data = await response.json();
    if (!response.ok) return;
    if (data.updatedAt && data.updatedAt !== lastUpdatedAt) {
      products = data.products || [];
      lastUpdatedAt = data.updatedAt;
      renderProducts();
      renderStats();
      syncStatus.textContent = `Catalogo actualizado: ${lastUpdatedAt}`;
    }
  } catch {
    // ignore polling errors
  }
}

document.querySelector("#add-image-btn").addEventListener("click", () => addImageRow());

// ── Pedidos ───────────────────────────────────────────────────────────────────
let orders = [];

async function loadOrders(status = "pendiente") {
  try {
    const data = await api(`/api/orders?status=${status}&limit=100`);
    orders = data.orders || [];
    renderOrders();
    updateOrdersBadge();
  } catch (err) {
    document.querySelector("#orders-list").innerHTML =
      `<div class="orders-empty">No se pudieron cargar los pedidos.<br><small>${err.message}</small></div>`;
  }
}

function renderOrders() {
  const container = document.querySelector("#orders-list");
  if (!orders.length) {
    container.innerHTML = `<div class="orders-empty">No hay pedidos en este estado.</div>`;
    return;
  }

  container.innerHTML = orders.map((o) => {
    const isPending = o.status === "pendiente";
    return `
      <div class="order-row" id="order-row-${o.id}">
        <div class="order-row-id">#${o.id}<br><span style="font-weight:400;color:var(--muted-2)">${formatDate(o.created_at)}</span></div>
        <div class="order-row-info">
          <span class="order-status-badge ${o.status}">${o.status}</span>
          <strong>${escapeAdmin(o.customer_name)}</strong>
          <small>📱 ${escapeAdmin(o.customer_phone)}${o.customer_note ? ` · ${escapeAdmin(o.customer_note)}` : ""}</small>
          <div class="order-row-items">
            ${(o.items || []).map((item) =>
              `<span class="order-item-tag">${escapeAdmin(item.name)} ×${item.quantity}</span>`
            ).join("")}
          </div>
        </div>
        <div class="order-row-total">${formatPrice(o.total)}</div>
        <div class="order-row-actions">
          ${isPending ? `
            <button class="button primary" type="button" data-confirm-order="${o.id}">✓ Confirmar</button>
            <button class="button ghost danger" type="button" data-reject-order="${o.id}">✕ Rechazar</button>
          ` : `<span style="font-size:.78rem;color:var(--muted)">Sin acciones</span>`}
        </div>
      </div>`;
  }).join("");

  container.querySelectorAll("[data-confirm-order]").forEach((btn) => {
    btn.addEventListener("click", () => handleOrderAction(Number(btn.dataset.confirmOrder), "confirm"));
  });
  container.querySelectorAll("[data-reject-order]").forEach((btn) => {
    btn.addEventListener("click", () => handleOrderAction(Number(btn.dataset.rejectOrder), "reject"));
  });
}

async function handleOrderAction(orderId, action) {
  const label = action === "confirm" ? "confirmar" : "rechazar";
  const order = orders.find((o) => o.id === orderId);
  if (!order) return;

  const itemsText = (order.items || []).map((i) => `${i.name} ×${i.quantity}`).join(", ");
  if (!confirm(`¿${label.charAt(0).toUpperCase() + label.slice(1)} el pedido #${orderId}?\n${order.customer_name} — ${itemsText}`)) return;

  // Deshabilitar botones de esa fila mientras procesa
  const row = document.querySelector(`#order-row-${orderId}`);
  row?.querySelectorAll("button").forEach((b) => { b.disabled = true; b.textContent = "..."; });

  try {
    await api(`/api/orders?action=${action}`, {
      method: "POST",
      body: JSON.stringify({ order_id: orderId }),
    });
    // Refrescar la lista con el filtro activo
    const status = document.querySelector("#orders-filter").value;
    await loadOrders(status);
    await loadProducts(); // refrescar stock si se confirmó
  } catch (err) {
    alert(`Error al ${label}: ${err.message}`);
    // Re-habilitar botones
    row?.querySelectorAll("button").forEach((b) => { b.disabled = false; });
    renderOrders();
  }
}

async function updateOrdersBadge() {
  try {
    const data = await api("/api/orders?status=pendiente&limit=200");
    const count = (data.orders || []).length;
    const badge = document.querySelector("#orders-badge");
    if (count > 0) {
      badge.textContent = count;
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  } catch { /* silencioso */ }
}

function formatDate(str) {
  if (!str) return "";
  try { return new Date(str).toLocaleDateString("es-AR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }); }
  catch { return str; }
}

function escapeAdmin(str) {
  return String(str || "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Toggle sección pedidos / productos
document.querySelector("#show-orders-btn").addEventListener("click", () => {
  const ordersSection  = document.querySelector("#orders-section");
  const productsSection = document.querySelector("#products-section");
  const btn = document.querySelector("#show-orders-btn");
  const showing = !ordersSection.hidden;
  ordersSection.hidden  = showing;
  productsSection.hidden = !showing;
  btn.textContent = showing ? "📦 Pedidos" : "📦 Ocultar pedidos";
  // Reponer badge
  updateOrdersBadge().then(() => {
    const badge = document.querySelector("#orders-badge");
    if (badge && !badge.hidden) btn.innerHTML = `📦 Pedidos <span class="status-pill is-on" id="orders-badge">${badge.textContent}</span>`;
  });
  if (!showing) {
    const status = document.querySelector("#orders-filter").value;
    loadOrders(status);
    loadRecoveryCodes();
  }
});

document.querySelector("#orders-filter").addEventListener("change", (e) => loadOrders(e.target.value));
document.querySelector("#refresh-orders-btn").addEventListener("click", () => {
  const status = document.querySelector("#orders-filter").value;
  loadOrders(status);
});

document.querySelector("#refresh-codes-btn")?.addEventListener("click", loadRecoveryCodes);

async function loadRecoveryCodes() {
  const container = document.querySelector("#recovery-codes-list");
  if (!container) return;
  container.innerHTML = `<p style="color:var(--muted);padding:.8rem;font-size:.85rem">Cargando...</p>`;

  try {
    const data = await api("/api/auth?action=recovery-codes");
    const codes = data.codes || [];

    if (!codes.length) {
      container.innerHTML = `<p style="color:var(--muted);padding:.8rem;font-size:.85rem">No hay códigos pendientes.</p>`;
      return;
    }

    container.innerHTML = codes.map((c) => {
      const expires = new Date(c.expires);
      const minsLeft = Math.max(0, Math.round((expires - Date.now()) / 60000));
      const waText = encodeURIComponent(`Hola ${c.name}, tu código de recuperación de Canopia es: ${c.code} (válido ${minsLeft} min)`);
      const waLink = c.phone ? `https://wa.me/${c.phone.replace(/\D/g,'')}?text=${waText}` : "";

      return `
        <div class="order-row" style="grid-template-columns:auto 1fr auto">
          <div>
            <div style="font-size:2rem;font-weight:900;letter-spacing:.2em;color:var(--green)">${c.code}</div>
            <div style="font-size:.72rem;color:var(--muted)">Expira en ${minsLeft} min</div>
          </div>
          <div class="order-row-info">
            <strong>${escapeAdmin(c.name)}</strong>
            <small>${escapeAdmin(c.email)}</small>
            ${c.phone ? `<small>📱 ${escapeAdmin(c.phone)}</small>` : ""}
          </div>
          <div>
            ${waLink ? `
              <a href="${waLink}" target="_blank" rel="noreferrer" class="button primary"
                style="min-height:auto;padding:.45rem .9rem;font-size:.82rem;display:inline-flex;align-items:center;gap:.4rem;text-decoration:none">
                <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.975 0C5.363 0 0 5.373 0 11.997c0 2.117.554 4.102 1.523 5.82L.057 23.926l6.264-1.643a11.9 11.9 0 0 0 5.654 1.435h.005c6.613 0 11.975-5.373 11.975-11.997 0-6.623-5.362-11.72-11.98-11.72z"/></svg>
                Enviar por WhatsApp
              </a>` : `<span style="font-size:.78rem;color:var(--muted)">Sin teléfono</span>`}
          </div>
        </div>`;
    }).join("");

  } catch (err) {
    container.innerHTML = `<p style="color:#f87171;padding:.8rem;font-size:.85rem">${err.message}</p>`;
  }
}

async function init() {
  await loadCategories();
  if (token) {
    try {
      await loadProducts();
      showAdmin();
      updateOrdersBadge(); // verificar pedidos pendientes al entrar
      setInterval(pollCatalog, 5000);
      setInterval(updateOrdersBadge, 15000); // badge se refresca cada 15s
    } catch {
      token = "";
      sessionStorage.removeItem(TOKEN_KEY);
      showLogin();
    }
  } else {
    showLogin();
  }
}

init();
