const TOKEN_KEY = "canopia_admin_token";
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
  productForm.image.value = product.image || "";
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
    image: form.get("image"),
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

async function init() {
  await loadCategories();
  if (token) {
    try {
      await loadProducts();
      showAdmin();
      setInterval(pollCatalog, 5000);
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
