// ─── Helpers ────────────────────────────────────────────────────────────────
const formatPrice = (value) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function initials(text) {
  return text.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function cleanString(str) {
  return (str || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function normalizeKey(value) {
  return value.trim().toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "_");
}

// ─── State ──────────────────────────────────────────────────────────────────
const defaultData = {
  theme: {},
  onlineData: { productsCsvUrl: "", categoriesCsvUrl: "", combosCsvUrl: "" },
  contact: {
    whatsapp: "5491100000000",
    instagram: "https://instagram.com/canopia",
    message: "Hola Canopia, quiero consultar por productos.",
  },
  categories: [],
  products: [],
  combos: [],
};

let store = defaultData;
let activeCategory = "todos";
let searchQuery = "";
let activeSort = "default";
let cart = JSON.parse(localStorage.getItem("canopia_cart") || "[]");
let favs = new Set(JSON.parse(localStorage.getItem("canopia_favs") || "[]"));
let compareList = []; // max 3 IDs
let catalogUpdatedAt = null;
let catalogPollTimer = null;
let apiBase = "";

// ─── Load / Poll ─────────────────────────────────────────────────────────────
async function loadStore() {
  try {
    const response = await fetch("data/site.json", { cache: "no-store" });
    store = { ...defaultData, ...(await response.json()) };
    apiBase = store.editorUrl || "";
    await loadOnlineData();
    await loadDatabaseProducts();
  } catch (error) {
    console.warn("No se pudo cargar data/site.json", error);
  }
}

async function loadDatabaseProducts() {
  try {
    const response = await fetch(`${apiBase}/api/products`, { cache: "no-store" });
    if (!response.ok) return false;
    const data = await response.json();
    if (data.products?.length) store.products = data.products;
    catalogUpdatedAt = data.updatedAt || catalogUpdatedAt;
    setLiveStatus(true);
    return true;
  } catch (error) {
    console.warn("No se pudo cargar el catalogo online", error);
    setLiveStatus(false);
    return false;
  }
}

function setLiveStatus(isLive) {
  const badge = document.querySelector("#live-sync");
  if (!badge) return;
  badge.hidden = !isLive;
}

function refreshCatalogViews() {
  renderFilters();
  renderProducts();
  renderCombos();
  renderCart();
  renderFavs();
}

async function pollCatalog() {
  try {
    const response = await fetch(`${apiBase}/api/products`, { cache: "no-store" });
    if (!response.ok) return;
    const data = await response.json();
    if (!data.updatedAt || data.updatedAt === catalogUpdatedAt) return;
    catalogUpdatedAt = data.updatedAt;
    if (data.products) store.products = data.products;
    refreshCatalogViews();
    setLiveStatus(true);
  } catch {
    setLiveStatus(false);
  }
}

function startCatalogPolling() {
  if (catalogPollTimer) clearInterval(catalogPollTimer);
  catalogPollTimer = setInterval(pollCatalog, 5000);
}

// ─── CSV ─────────────────────────────────────────────────────────────────────
async function loadOnlineData() {
  const onlineData = store.onlineData || {};
  const [products, categories, combos] = await Promise.all([
    fetchCsvData(onlineData.productsCsvUrl, parseProduct),
    fetchCsvData(onlineData.categoriesCsvUrl, parseCategory),
    fetchCsvData(onlineData.combosCsvUrl, parseCombo),
  ]);
  if (products.length) store.products = products;
  if (categories.length) store.categories = categories;
  if (combos.length) store.combos = combos;
}

async function fetchCsvData(url, parser) {
  if (!url) return [];
  try {
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseCsv(await response.text()).map(parser).filter(Boolean);
  } catch (error) {
    console.warn(`No se pudo cargar ${url}`, error);
    return [];
  }
}

function parseCsv(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i], next = text[i + 1];
    if (char === '"' && quoted && next === '"') { cell += '"'; i++; }
    else if (char === '"') { quoted = !quoted; }
    else if (char === "," && !quoted) { row.push(cell); cell = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((v) => v.trim())) rows.push(row);
      row = []; cell = "";
    } else { cell += char; }
  }
  row.push(cell);
  if (row.some((v) => v.trim())) rows.push(row);
  const headers = rows.shift()?.map((h) => normalizeKey(h)) || [];
  return rows.map((values) =>
    headers.reduce((rec, h, i) => { rec[h] = values[i]?.trim() || ""; return rec; }, {}),
  );
}

function parseProduct(row) {
  if (!row.nombre) return null;
  return {
    id: row.id || slugify(row.nombre),
    name: row.nombre,
    category: row.categoria || "parafernalia",
    description: row.descripcion || "",
    price: Number(row.precio || 0),
    tag: row.etiqueta || row.categoria || "Producto",
    image: row.imagen || "",
    featured: ["si", "sí", "true", "1"].includes((row.destacado || "").toLowerCase()),
    visible: !["no", "false", "0"].includes((row.visible || "si").toLowerCase()),
  };
}

function parseCategory(row) {
  if (!row.nombre) return null;
  return { id: row.id || slugify(row.nombre), name: row.nombre, description: row.descripcion || "" };
}

function parseCombo(row) {
  if (!row.nombre) return null;
  return {
    id: row.id || slugify(row.nombre),
    name: row.nombre,
    description: row.descripcion || "",
    items: (row.items || "").split("|").map((i) => i.trim()).filter(Boolean),
    price: Number(row.precio || 0),
    tag: row.etiqueta || "Combo",
  };
}

// ─── Render helpers ───────────────────────────────────────────────────────────
function stockLabel(stock) {
  const v = Number(stock || 0);
  if (v <= 0) return "Sin stock";
  if (v <= 3) return `Ultimos ${v}`;
  return `Stock: ${v}`;
}

function whatsappUrl(productName = "") {
  const phone = store.contact.whatsapp || "";
  const message = productName
    ? `Hola Canopia, quiero consultar por ${productName}.`
    : store.contact.message;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function productImageHtml(product, extraClass = "") {
  return product.image
    ? `<img class="product-image${extraClass ? " " + extraClass : ""}" src="${product.image}" alt="${product.name}" loading="lazy" />`
    : `<div class="product-art">${initials(product.name)}</div>`;
}

// ─── Category icon & image map ────────────────────────────────────────────────
const CAT_DATA = {
  grow: {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22V12M12 12C12 12 7 8 7 4a5 5 0 0 1 10 0c0 4-5 8-5 8z"/></svg>`,
    img: "https://images.unsplash.com/photo-1586771107445-d3ca888129ff?w=400&q=70",
    sub: "Todo para tu cultivo",
  },
  parafernalia: {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    img: "https://images.unsplash.com/photo-1574626035716-01df7c6c9a1f?w=400&q=70",
    sub: "Para tu ritual",
  },
  smoke: {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    img: "https://images.unsplash.com/photo-1574626035716-01df7c6c9a1f?w=400&q=70",
    sub: "Para tu ritual",
  },
  picadores: {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
    img: "https://images.unsplash.com/photo-1603910522284-4c652f8d3e2d?w=400&q=70",
    sub: "Grinders y más",
  },
  iluminacion: {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    img: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=400&q=70",
    sub: "Led y más",
  },
  nutrientes: {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18"/></svg>`,
    img: "https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=400&q=70",
    sub: "Feeding & boosters",
  },
  accesorios: {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
    img: "https://images.unsplash.com/photo-1416339684178-3a239570f315?w=400&q=70",
    sub: "Herramientas y más",
  },
  combos: {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,
    img: "https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=400&q=70",
    sub: "Kits listos",
  },
};

function getCatData(catId) {
  return CAT_DATA[catId] || {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>`,
    img: "",
    sub: "",
  };
}

// ─── Categories ───────────────────────────────────────────────────────────────
function renderCategories() {
  const grid = document.querySelector("#category-grid");
  grid.innerHTML = store.categories
    .map((c) => {
      const d = getCatData(c.id);
      return `
        <article class="category-card" role="button" tabindex="0" data-cat-filter="${c.id}">
          ${d.img ? `<img class="cat-img" src="${d.img}" alt="" loading="lazy" />` : ""}
          <div class="cat-overlay">
            <div class="cat-icon">${d.icon}</div>
            <strong>${c.name}</strong>
            <small>${d.sub || c.description}</small>
            <span class="cat-arrow">
              Ver todo
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </span>
          </div>
        </article>`;
    })
    .join("");

  grid.querySelectorAll("[data-cat-filter]").forEach((card) => {
    const handler = () => {
      activeCategory = card.dataset.catFilter;
      renderFilters();
      renderProducts();
      document.querySelector("#catalogo")?.scrollIntoView({ behavior: "smooth" });
    };
    card.addEventListener("click", handler);
    card.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") handler(); });
  });
}

// ─── Filters ─────────────────────────────────────────────────────────────────
function renderFilters() {
  const filters = document.querySelector("#filters");
  const items = [{ id: "todos", name: "Todo" }, ...store.categories];
  filters.innerHTML = items
    .map((item) => `
      <button class="filter-button ${item.id === activeCategory ? "is-active" : ""}" type="button" data-filter="${item.id}">
        ${item.name}
      </button>`)
    .join("");
  filters.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      activeCategory = btn.dataset.filter;
      renderFilters();
      renderProducts();
    });
  });
}

// ─── Product card ─────────────────────────────────────────────────────────────
function productCardHtml(product) {
  const isFav = favs.has(product.id);
  const isComparing = compareList.includes(product.id);
  const outOfStock = Number(product.stock) <= 0;
  return `
    <article class="product-card" data-product-id="${product.id}">
      <button class="fav-button ${isFav ? "is-fav" : ""}" type="button"
        data-fav-toggle="${product.id}" aria-label="${isFav ? "Quitar de favoritos" : "Agregar a favoritos"}">
        ${isFav ? "❤️" : "🤍"}
      </button>
      ${product.image
        ? `<img class="product-image" src="${product.image}" alt="${product.name}" loading="lazy" />`
        : `<div class="product-art">${initials(product.name)}</div>`}
      <div class="product-body">
        <span class="badge">${product.tag}</span>
        <h3>${product.name}</h3>
        <p>${product.description}</p>
        <span class="stock-line">${stockLabel(product.stock)}</span>
        <div class="product-footer">
          <span class="price">${formatPrice(product.price)}</span>
          <div class="product-actions">
            <button class="btn btn-primary" type="button"
              data-add-to-cart="${product.id}" ${outOfStock ? "disabled" : ""}>Comprar</button>
            <a class="btn btn-outline" href="${whatsappUrl(product.name)}"
              target="_blank" rel="noreferrer">Consultar</a>
            <button class="compare-button ${isComparing ? "is-comparing" : ""}" type="button"
              data-compare-toggle="${product.id}">
              ${isComparing ? "✓ Comparando" : "Comparar"}
            </button>
          </div>
        </div>
      </div>
    </article>`;
}

// ─── Product grid ─────────────────────────────────────────────────────────────
function renderProducts() {
  const grid = document.querySelector("#product-grid");
  let products = store.products.filter((p) => p.visible !== false);
  if (activeCategory !== "todos") products = products.filter((p) => p.category === activeCategory);
  if (searchQuery.trim()) {
    const q = cleanString(searchQuery);
    products = products.filter(
      (p) => cleanString(p.name).includes(q) || cleanString(p.description || "").includes(q),
    );
  }
  if (activeSort === "price-asc") products.sort((a, b) => a.price - b.price);
  else if (activeSort === "price-desc") products.sort((a, b) => b.price - a.price);
  else if (activeSort === "name-asc") products.sort((a, b) => a.name.localeCompare(b.name));

  grid.innerHTML = products.map(productCardHtml).join("");
  bindProductCardEvents(grid);
}

function bindProductCardEvents(container) {
  container.querySelectorAll("[data-fav-toggle]").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggleFav(btn.dataset.favToggle); });
  });
  container.querySelectorAll("[data-add-to-cart]").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); addToCart(btn.dataset.addToCart); });
  });
  container.querySelectorAll("[data-compare-toggle]").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); toggleCompare(btn.dataset.compareToggle); });
  });
}

// ─── Combos ──────────────────────────────────────────────────────────────────
function renderCombos() {
  const grid = document.querySelector("#combo-grid");
  grid.innerHTML = store.combos
    .map((combo) => `
      <article class="combo-card">
        <span class="badge">${combo.tag}</span>
        <h3>${combo.name}</h3>
        <p>${combo.description}</p>
        <ul>${combo.items.map((i) => `<li>${i}</li>`).join("")}</ul>
        <strong class="price">${formatPrice(combo.price)}</strong>
      </article>`)
    .join("");
}

// ─── Contact / Nav ────────────────────────────────────────────────────────────
function setupContact() {
  document.querySelectorAll("[data-whatsapp-link]").forEach((link) => {
    link.href = whatsappUrl();
    link.target = "_blank";
    link.rel = "noreferrer";
  });
  const instagram = document.querySelector("#instagram-link");
  if (instagram) instagram.href = store.contact.instagram;
  const text = document.querySelector("#contact-text");
  if (text && store.contact.text) text.textContent = store.contact.text;
}

function setupNav() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector("#main-nav");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const isOpen = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(isOpen));
    });
  }

  // Header search toggle
  const searchToggle = document.querySelector("#search-toggle");
  const searchOverlay = document.querySelector("#search-bar-overlay");
  const searchClose = document.querySelector("#search-close");
  const searchInput = document.querySelector("#header-search-input");

  if (searchToggle && searchOverlay) {
    searchToggle.addEventListener("click", () => {
      searchOverlay.hidden = !searchOverlay.hidden;
      if (!searchOverlay.hidden) searchInput?.focus();
    });
  }
  if (searchClose) {
    searchClose.addEventListener("click", () => { searchOverlay.hidden = true; });
  }
  // Sync header search with catalog search
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      searchQuery = e.target.value;
      const catalogInput = document.querySelector("#catalog-search");
      if (catalogInput) catalogInput.value = searchQuery;
      renderProducts();
      if (searchQuery.trim()) {
        document.querySelector("#catalogo")?.scrollIntoView({ behavior: "smooth" });
      }
    });
  }
}

// ─── FAVORITOS ────────────────────────────────────────────────────────────────
function saveFavs() {
  localStorage.setItem("canopia_favs", JSON.stringify([...favs]));
}

function toggleFav(id) {
  if (favs.has(id)) favs.delete(id);
  else favs.add(id);
  saveFavs();
  // re-render sólo el botón del card sin re-renderizar todo
  document.querySelectorAll(`[data-fav-toggle="${id}"]`).forEach((btn) => {
    const isFav = favs.has(id);
    btn.classList.toggle("is-fav", isFav);
    btn.textContent = isFav ? "❤️" : "🤍";
    btn.setAttribute("aria-label", isFav ? "Quitar de favoritos" : "Agregar a favoritos");
  });
  updateFavCount();
  // si el panel está abierto, re-render
  if (!document.querySelector("#favs-panel").classList.contains("is-open")) return;
  renderFavs();
}

function updateFavCount() {
  document.querySelector("#fav-count").textContent = String(favs.size);
}

function renderFavs() {
  const list = document.querySelector("#favs-list");
  const favProducts = [...favs]
    .map((id) => store.products.find((p) => p.id === id))
    .filter(Boolean);

  if (!favProducts.length) {
    list.innerHTML = "<p style='color:var(--muted)'>Aún no guardaste favoritos.<br>Tocá ❤️ en cualquier producto.</p>";
    return;
  }

  list.innerHTML = favProducts
    .map((p) => `
      <div class="fav-item">
        ${p.image
          ? `<img class="fav-item-art" src="${p.image}" alt="${p.name}" loading="lazy" />`
          : `<div class="fav-item-art">${initials(p.name)}</div>`}
        <div class="fav-item-info">
          <strong>${p.name}</strong>
          <span>${formatPrice(p.price)}</span>
        </div>
        <div class="fav-item-actions">
          <button class="button primary" type="button" data-fav-buy="${p.id}"
            ${Number(p.stock) <= 0 ? "disabled" : ""}>Comprar</button>
          <button class="button ghost" type="button" data-fav-remove="${p.id}">✕</button>
        </div>
      </div>`)
    .join("");

  list.querySelectorAll("[data-fav-buy]").forEach((btn) => {
    btn.addEventListener("click", () => { addToCart(btn.dataset.favBuy); closeFavs(); openCart(); });
  });
  list.querySelectorAll("[data-fav-remove]").forEach((btn) => {
    btn.addEventListener("click", () => { toggleFav(btn.dataset.favRemove); });
  });
}

function openFavs() {
  renderFavs();
  document.querySelector("#favs-panel").classList.add("is-open");
  document.querySelector("#favs-panel").setAttribute("aria-hidden", "false");
}

function closeFavs() {
  document.querySelector("#favs-panel").classList.remove("is-open");
  document.querySelector("#favs-panel").setAttribute("aria-hidden", "true");
}

function setupFavs() {
  document.querySelector("#open-favs").addEventListener("click", openFavs);
  document.querySelector("#close-favs").addEventListener("click", closeFavs);
  document.querySelector("#favs-panel").addEventListener("click", (e) => {
    if (e.target.id === "favs-panel") closeFavs();
  });
  updateFavCount();
}

// ─── COMPARAR ────────────────────────────────────────────────────────────────
const MAX_COMPARE = 3;

function toggleCompare(id) {
  const idx = compareList.indexOf(id);
  if (idx !== -1) {
    compareList.splice(idx, 1);
  } else {
    if (compareList.length >= MAX_COMPARE) {
      // quitar el primero para hacer lugar
      compareList.shift();
    }
    compareList.push(id);
  }
  updateCompareBar();
  // actualizar botones en el grid
  document.querySelectorAll("[data-compare-toggle]").forEach((btn) => {
    const isC = compareList.includes(btn.dataset.compareToggle);
    btn.classList.toggle("is-comparing", isC);
    btn.textContent = isC ? "✓ Comparando" : "Comparar";
  });
}

function updateCompareBar() {
  const bar = document.querySelector("#compare-bar");
  const slots = document.querySelector("#compare-slots");
  const label = document.querySelector("#compare-bar-label");
  bar.classList.toggle("is-visible", compareList.length > 0);
  label.textContent = compareList.length === 0
    ? "Comparar"
    : `${compareList.length} / ${MAX_COMPARE}`;

  slots.innerHTML = Array.from({ length: MAX_COMPARE }, (_, i) => {
    const id = compareList[i];
    const p = id ? store.products.find((pr) => pr.id === id) : null;
    if (p && p.image) {
      return `<div class="compare-slot filled"><img src="${p.image}" alt="${p.name}" /></div>`;
    } else if (p) {
      return `<div class="compare-slot filled" title="${p.name}">${initials(p.name)}</div>`;
    }
    return `<div class="compare-slot"></div>`;
  }).join("");
}

function openCompareModal() {
  if (compareList.length < 2) return;
  const products = compareList
    .map((id) => store.products.find((p) => p.id === id))
    .filter(Boolean);

  const colWidth = `${Math.floor(100 / (products.length + 1))}%`;
  const fields = [
    { label: "Precio", key: "price", render: (v) => `<span class="compare-highlight">${formatPrice(v)}</span>` },
    { label: "Categoría", key: "category", render: (v) => v },
    { label: "Stock", key: "stock", render: (v) => stockLabel(v) },
    { label: "Descripción", key: "description", render: (v) => v || "—" },
    { label: "Etiqueta", key: "tag", render: (v) => `<span class="badge">${v}</span>` },
    { label: "Destacado", key: "featured", render: (v) => (v ? "✓" : "—") },
  ];

  const headerRow = `
    <tr>
      <th style="width:${colWidth}"></th>
      ${products.map((p) => `
        <td class="compare-product-header" style="width:${colWidth}">
          ${p.image ? `<img src="${p.image}" alt="${p.name}" />` : `<div class="compare-art">${initials(p.name)}</div>`}
          <strong>${p.name}</strong>
          <br>
          <button class="button primary" type="button" style="margin-top:0.5rem;min-height:auto;padding:0.4rem 0.8rem;font-size:0.8rem"
            data-compare-buy="${p.id}" ${Number(p.stock) <= 0 ? "disabled" : ""}>Comprar</button>
        </td>`).join("")}
    </tr>`;

  const dataRows = fields
    .map((f) => `
      <tr>
        <th>${f.label}</th>
        ${products.map((p) => `<td>${f.render(p[f.key])}</td>`).join("")}
      </tr>`)
    .join("");

  document.querySelector("#compare-modal-body").innerHTML = `
    <table class="compare-table">
      <thead>${headerRow}</thead>
      <tbody>${dataRows}</tbody>
    </table>`;

  document.querySelector("#compare-modal-body").querySelectorAll("[data-compare-buy]").forEach((btn) => {
    btn.addEventListener("click", () => {
      addToCart(btn.dataset.compareBuy);
      closeCompareModal();
      openCart();
    });
  });

  document.querySelector("#compare-modal-overlay").classList.add("is-open");
}

function closeCompareModal() {
  document.querySelector("#compare-modal-overlay").classList.remove("is-open");
}

function setupCompare() {
  document.querySelector("#compare-now-btn").addEventListener("click", openCompareModal);
  document.querySelector("#compare-clear-btn").addEventListener("click", () => {
    compareList = [];
    updateCompareBar();
    document.querySelectorAll("[data-compare-toggle]").forEach((btn) => {
      btn.classList.remove("is-comparing");
      btn.textContent = "Comparar";
    });
  });
  document.querySelector("#close-compare-modal").addEventListener("click", closeCompareModal);
  document.querySelector("#compare-modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "compare-modal-overlay") closeCompareModal();
  });
}

// ─── SUGERENCIAS: Comprados juntos / Relacionados ────────────────────────────
// Mapa en memoria: productId → Set de IDs con los que aparece en el mismo carrito
const togetherMap = new Map();

/**
 * Registra que los IDs de un pedido fueron comprados juntos.
 * Se llama tras cada checkout exitoso con los IDs del carrito.
 */
function recordPurchasedTogether(ids) {
  for (const id of ids) {
    if (!togetherMap.has(id)) togetherMap.set(id, new Map());
    for (const other of ids) {
      if (other === id) continue;
      const count = togetherMap.get(id).get(other) || 0;
      togetherMap.get(id).set(other, count + 1);
    }
  }
}

/**
 * Devuelve hasta `limit` IDs que se compraron más juntos con `productId`.
 * Si no hay datos suficientes, completa con productos de la misma categoría.
 */
function getSuggestedIds(productId, limit = 4) {
  const product = store.products.find((p) => p.id === productId);
  const results = new Set();

  // 1. Comprados juntos (frecuencia)
  const together = togetherMap.get(productId);
  if (together && together.size) {
    const sorted = [...together.entries()].sort((a, b) => b[1] - a[1]);
    for (const [id] of sorted) {
      if (results.size >= limit) break;
      const p = store.products.find((pr) => pr.id === id && pr.visible !== false);
      if (p) results.add(id);
    }
  }

  // 2. Misma categoría como fallback
  if (product && results.size < limit) {
    store.products
      .filter((p) => p.id !== productId && p.category === product.category && p.visible !== false)
      .slice(0, limit)
      .forEach((p) => { if (results.size < limit) results.add(p.id); });
  }

  return [...results].slice(0, limit);
}

/**
 * Renderiza una fila de sugerencias dentro de un contenedor dado.
 * `title` es el texto del encabezado.
 */
function renderSuggestionsRow(container, ids, title) {
  if (!ids.length) return;
  const products = ids
    .map((id) => store.products.find((p) => p.id === id))
    .filter(Boolean);
  if (!products.length) return;

  const section = document.createElement("div");
  section.className = "suggestions-section";
  section.innerHTML = `
    <p class="suggestions-title">${title}</p>
    <div class="suggestions-row">
      ${products.map((p) => `
        <div class="suggestion-card" data-suggestion-id="${p.id}">
          ${p.image
            ? `<img src="${p.image}" alt="${p.name}" loading="lazy" />`
            : `<div class="suggestion-art">${initials(p.name)}</div>`}
          <div class="suggestion-body">
            <strong>${p.name}</strong>
            <span>${formatPrice(p.price)}</span>
            <button class="button primary" type="button"
              data-suggestion-buy="${p.id}"
              ${Number(p.stock) <= 0 ? "disabled" : ""}>+ Agregar</button>
          </div>
        </div>`).join("")}
    </div>`;

  section.querySelectorAll("[data-suggestion-buy]").forEach((btn) => {
    btn.addEventListener("click", () => addToCart(btn.dataset.suggestionBuy));
  });

  container.appendChild(section);
}

// ─── CARRITO ──────────────────────────────────────────────────────────────────
function saveCart() {
  localStorage.setItem("canopia_cart", JSON.stringify(cart));
  renderCart();
}

function addToCart(productId) {
  const product = store.products.find((p) => p.id === productId);
  if (!product || Number(product.stock) <= 0) return;
  const existing = cart.find((i) => i.id === productId);
  if (existing) {
    if (existing.quantity < Number(product.stock)) existing.quantity += 1;
  } else {
    cart.push({ id: productId, quantity: 1 });
  }
  saveCart();
  openCart();
}

function changeQuantity(productId, delta) {
  const product = store.products.find((p) => p.id === productId);
  const item = cart.find((i) => i.id === productId);
  if (!item || !product) return;
  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter((i) => i.id !== productId);
  if (item.quantity > Number(product.stock)) item.quantity = Number(product.stock);
  saveCart();
}

function renderCart() {
  const count = cart.reduce((s, i) => s + i.quantity, 0);
  const total = cart.reduce((s, i) => {
    const p = store.products.find((e) => e.id === i.id);
    return s + (p ? p.price * i.quantity : 0);
  }, 0);

  document.querySelector("#cart-count").textContent = String(count);
  document.querySelector("#cart-total").textContent = formatPrice(total);

  const items = document.querySelector("#cart-items");
  if (!cart.length) {
    items.innerHTML = "<p>Tu carrito esta vacio.</p>";
    return;
  }

  items.innerHTML = cart
    .map((item) => {
      const p = store.products.find((e) => e.id === item.id);
      if (!p) return "";
      return `
        <div class="cart-line">
          <div>
            <strong>${p.name}</strong>
            <span>${formatPrice(p.price)} x ${item.quantity}</span>
          </div>
          <div class="quantity-controls">
            <button type="button" data-cart-dec="${item.id}">-</button>
            <strong>${item.quantity}</strong>
            <button type="button" data-cart-inc="${item.id}">+</button>
          </div>
        </div>`;
    })
    .join("");

  items.querySelectorAll("[data-cart-dec]").forEach((btn) => {
    btn.addEventListener("click", () => changeQuantity(btn.dataset.cartDec, -1));
  });
  items.querySelectorAll("[data-cart-inc]").forEach((btn) => {
    btn.addEventListener("click", () => changeQuantity(btn.dataset.cartInc, 1));
  });

  // Sugerencias "comprados juntos" basadas en todos los items del carrito
  const cartIds = cart.map((i) => i.id);
  const suggestedIds = new Set();
  for (const id of cartIds) {
    getSuggestedIds(id, 4).forEach((sid) => {
      if (!cartIds.includes(sid)) suggestedIds.add(sid);
    });
  }

  // Limpiar sugerencias previas y renderizar
  const existing = items.parentElement.querySelector(".suggestions-section");
  if (existing) existing.remove();

  if (suggestedIds.size) {
    renderSuggestionsRow(
      document.querySelector(".cart-dialog"),
      [...suggestedIds].slice(0, 4),
      "Comprados juntos frecuentemente",
    );
  }
}

function openCart() {
  document.querySelector("#cart-panel").classList.add("is-open");
  document.querySelector("#cart-panel").setAttribute("aria-hidden", "false");
}

function closeCart() {
  document.querySelector("#cart-panel").classList.remove("is-open");
  document.querySelector("#cart-panel").setAttribute("aria-hidden", "true");
}

function setupCart() {
  document.querySelector("#open-cart").addEventListener("click", openCart);
  document.querySelector("#close-cart").addEventListener("click", closeCart);
  document.querySelector("#cart-panel").addEventListener("click", (e) => {
    if (e.target.id === "cart-panel") closeCart();
  });
  document.querySelector("#checkout-form").addEventListener("submit", checkout);
  renderCart();
}

// ─── CHECKOUT ────────────────────────────────────────────────────────────────
function whatsappOrderUrl(order) {
  const lines = [
    "Hola Canopia, confirme esta compra desde la web:",
    ...order.items.map((i) => `- ${i.name} x${i.quantity}: ${formatPrice(i.subtotal)}`),
    `Total: ${formatPrice(order.total)}`,
    `Nombre: ${order.customer.name}`,
    `Telefono: ${order.customer.phone}`,
    order.customer.note ? `Nota: ${order.customer.note}` : "",
  ].filter(Boolean);
  return `https://wa.me/${store.contact.whatsapp}?text=${encodeURIComponent(lines.join("\n"))}`;
}

async function checkout(event) {
  event.preventDefault();
  const message = document.querySelector("#checkout-message");
  if (!cart.length) { message.textContent = "Agrega productos antes de confirmar."; return; }

  const form = new FormData(event.currentTarget);
  message.textContent = "Confirmando compra...";

  try {
    const response = await fetch(`${apiBase}/api/orders`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        customer: {
          name: form.get("name"),
          phone: form.get("phone"),
          note: form.get("note"),
        },
        items: cart,
      }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "No se pudo confirmar la compra.");

    // Registrar comprados juntos
    recordPurchasedTogether(result.items.map((i) => i.id));

    cart = [];
    saveCart();
    await loadDatabaseProducts();
    renderProducts();
    message.textContent = "Compra confirmada. Te abrimos WhatsApp con el resumen.";
    window.open(whatsappOrderUrl(result), "_blank", "noreferrer");
  } catch (error) {
    message.textContent = error.message;
  }
}

// ─── Productos relacionados (se inyecta debajo de cada card al hacer hover largo) ──
// Estrategia: panel debajo del catálogo cuando el usuario agrega al carrito
let relatedTimeout = null;

function showRelated(productId) {
  const product = store.products.find((p) => p.id === productId);
  if (!product) return;

  // Productos de la misma categoría, excluyendo el actual y los del carrito
  const cartIds = cart.map((i) => i.id);
  const related = store.products
    .filter(
      (p) =>
        p.id !== productId &&
        p.visible !== false &&
        p.category === product.category &&
        !cartIds.includes(p.id),
    )
    .slice(0, 4);

  if (!related.length) return;

  // Remover sección previa
  document.querySelector("#related-section")?.remove();

  const section = document.createElement("section");
  section.id = "related-section";
  section.className = "section";
  section.style.paddingTop = "1rem";
  section.innerHTML = `
    <div class="section-heading">
      <p class="eyebrow">Puede interesarte</p>
      <h2>Productos relacionados</h2>
    </div>`;

  const row = document.createElement("div");
  row.className = "suggestions-row";

  related.forEach((p) => {
    const card = document.createElement("div");
    card.className = "suggestion-card";
    card.innerHTML = `
      ${p.image ? `<img src="${p.image}" alt="${p.name}" loading="lazy" />`
                : `<div class="suggestion-art">${initials(p.name)}</div>`}
      <div class="suggestion-body">
        <strong>${p.name}</strong>
        <span>${formatPrice(p.price)}</span>
        <button class="button primary" type="button"
          ${Number(p.stock) <= 0 ? "disabled" : ""}>+ Agregar</button>
      </div>`;
    card.querySelector("button").addEventListener("click", () => addToCart(p.id));
    row.appendChild(card);
  });

  section.appendChild(row);

  // Insertar después del catálogo
  const catalogSection = document.querySelector("#catalogo");
  catalogSection?.after(section);

  // Auto-remover después de 12s si no se interactuó
  clearTimeout(relatedTimeout);
  relatedTimeout = setTimeout(() => {
    document.querySelector("#related-section")?.remove();
  }, 12000);
}

// ─── Setup catalog controls ───────────────────────────────────────────────────
function setupCatalogControls() {
  const searchInput = document.querySelector("#catalog-search");
  const sortSelect = document.querySelector("#catalog-sort");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => { searchQuery = e.target.value; renderProducts(); });
  }
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => { activeSort = e.target.value; renderProducts(); });
  }
}

// ─── INIT ────────────────────────────────────────────────────────────────────
async function init() {
  await loadStore();

  renderCategories();
  renderFilters();
  renderProducts();
  renderCombos();
  setupContact();
  setupNav();
  setupCart();
  setupFavs();
  setupCompare();
  setupCatalogControls();

  // Mostrar relacionados cuando se agrega al carrito
  document.querySelector("#product-grid").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add-to-cart]");
    if (btn) showRelated(btn.dataset.addToCart);
  });

  if (catalogUpdatedAt) {
    refreshCatalogViews();
    startCatalogPolling();
  }
}

init();
