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
    img: "assets/grow.png",
    sub: "Todo para tu cultivo",
  },
  parafernalia: {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    img: "assets/parafernalia.png",
    sub: "Para tu ritual",
  },
  smoke: {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
    img: "assets/parafernalia.png",
    sub: "Para tu ritual",
  },
  picadores: {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="4"/><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/></svg>`,
    img: "assets/grinders.png",
    sub: "Grinders y más",
  },
  iluminacion: {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    img: "",
    sub: "Led y más",
  },
  nutrientes: {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2v-4M9 21H5a2 2 0 0 1-2-2v-4m0 0h18"/></svg>`,
    img: "",
    sub: "Feeding & boosters",
  },
  accesorios: {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>`,
    img: "",
    sub: "Herramientas y más",
  },
  combos: {
    icon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="21 8 21 21 3 21 3 8"/><rect x="1" y="3" width="22" height="5"/><line x1="10" y1="12" x2="14" y2="12"/></svg>`,
    img: "assets/combos.png",
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
  const reviews = getProductReviews(product.id);
  const avg = avgStars(reviews);
  const count = reviews.length;

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
        <div class="card-stars" data-stars-for="${product.id}">
          <div class="stars-row">
            <span class="stars-display">${starsHtml(avg)}</span>
            ${count > 0 ? `<span class="stars-count">${avg.toFixed(1)} (${count})</span>` : ""}
            <button class="review-link" data-review-open="${product.id}">
              ${count > 0 ? "Ver reseñas" : "Opinar"}
            </button>
          </div>
        </div>
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

  let products;
  if (searchQuery.trim()) {
    // Búsqueda inteligente con score de relevancia
    products = smartSearch(searchQuery);
    // Si hay filtro de categoría activo, aplicarlo encima
    if (activeCategory !== "todos") {
      products = products.filter((p) => p.category === activeCategory);
    }
  } else {
    products = store.products.filter((p) => p.visible !== false);
    if (activeCategory !== "todos") {
      products = products.filter((p) => p.category === activeCategory);
    }
  }

  // Ordenamiento (no aplica cuando hay query → relevancia manda)
  if (!searchQuery.trim()) {
    if (activeSort === "price-asc") products.sort((a, b) => a.price - b.price);
    else if (activeSort === "price-desc") products.sort((a, b) => b.price - a.price);
    else if (activeSort === "name-asc") products.sort((a, b) => a.name.localeCompare(b.name));
  }

  if (!products.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;padding:3rem;text-align:center;color:var(--muted)">
        <div style="font-size:2rem;margin-bottom:.75rem">🔍</div>
        <strong style="display:block;color:var(--text);margin-bottom:.4rem">Sin resultados</strong>
        No encontramos productos para "<em>${escapeHtml(searchQuery)}</em>".<br>
        Probá con otro término o revisá la ortografía.
      </div>`;
    return;
  }

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
  container.querySelectorAll("[data-review-open]").forEach((btn) => {
    btn.addEventListener("click", (e) => { e.stopPropagation(); openReviewsPanel(btn.dataset.reviewOpen); });
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

function _toggleFavLocal(id) {
  if (favs.has(id)) favs.delete(id);
  else favs.add(id);
  saveFavs();
  document.querySelectorAll(`[data-fav-toggle="${id}"]`).forEach((btn) => {
    const isFav = favs.has(id);
    btn.classList.toggle("is-fav", isFav);
    btn.textContent = isFav ? "❤️" : "🤍";
    btn.setAttribute("aria-label", isFav ? "Quitar de favoritos" : "Agregar a favoritos");
  });
  updateFavCount();
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
  // Prellenar datos del usuario logueado en el formulario de checkout
  if (currentUser) {
    const form = document.querySelector("#checkout-form");
    if (form) {
      if (currentUser.name  && !form.name.value)  form.name.value  = currentUser.name;
      if (currentUser.phone && !form.phone.value) form.phone.value = currentUser.phone;
    }
  }
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
    const headers = { "Content-Type": "application/json" };
    if (currentToken) headers["Authorization"] = `Bearer ${currentToken}`;

    const response = await fetch(`${apiBase}/api/orders`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        customer: {
          name: form.get("name"),
          phone: form.get("phone"),
          note: form.get("note"),
        },
        items: cart,
        user_id: currentUser?.id || null,
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

// ═══════════════════════════════════════════════════════════════
// VALORACIONES Y RESEÑAS
// ═══════════════════════════════════════════════════════════════

const REVIEWS_KEY = "canopia_reviews"; // { [productId]: [{author, stars, text, date}] }

function loadReviews() {
  try { return JSON.parse(localStorage.getItem(REVIEWS_KEY) || "{}"); }
  catch { return {}; }
}

function saveReviews(data) {
  localStorage.setItem(REVIEWS_KEY, JSON.stringify(data));
}

function getProductReviews(productId) {
  return loadReviews()[productId] || [];
}

function addReview(productId, review) {
  const all = loadReviews();
  if (!all[productId]) all[productId] = [];
  all[productId].unshift(review); // más nuevo primero
  saveReviews(all);
}

function avgStars(reviews) {
  if (!reviews.length) return 0;
  return reviews.reduce((s, r) => s + r.stars, 0) / reviews.length;
}

function starsHtml(rating, size = "0.88rem") {
  const full = Math.round(rating);
  return Array.from({ length: 5 }, (_, i) =>
    `<span class="star-icon ${i < full ? "filled" : ""}" style="font-size:${size}">★</span>`
  ).join("");
}

// ── Renderiza las estrellas + link en la card ───────────────────
function renderCardStars(productId, container) {
  const reviews = getProductReviews(productId);
  const avg = avgStars(reviews);
  const count = reviews.length;

  container.innerHTML = `
    <div class="stars-row">
      <span class="stars-display">${starsHtml(avg)}</span>
      ${count > 0
        ? `<span class="stars-count">${avg.toFixed(1)} (${count})</span>`
        : ""}
      <button class="review-link" data-review-open="${productId}">
        ${count > 0 ? "Ver reseñas" : "Opinar"}
      </button>
    </div>`;

  container.querySelector("[data-review-open]").addEventListener("click", (e) => {
    e.stopPropagation();
    openReviewsPanel(productId);
  });
}

// ── Panel lateral de reseñas ────────────────────────────────────
let reviewsPanelProductId = null;

function openReviewsPanel(productId) {
  reviewsPanelProductId = productId;
  const product = store.products.find((p) => p.id === productId);
  const reviews = getProductReviews(productId);
  const avg = avgStars(reviews);

  // cabecera
  document.querySelector("#reviews-panel-product-name").textContent = product?.name || productId;
  document.querySelector("#reviews-panel-stars").innerHTML = starsHtml(avg, "1rem");

  // resumen con barras
  renderReviewsSummary(reviews);

  // lista
  renderReviewsList(reviews);

  document.querySelector("#reviews-panel").classList.add("is-open");
  document.querySelector("#reviews-panel").setAttribute("aria-hidden", "false");
}

function closeReviewsPanel() {
  document.querySelector("#reviews-panel").classList.remove("is-open");
  document.querySelector("#reviews-panel").setAttribute("aria-hidden", "true");
  reviewsPanelProductId = null;
}

function renderReviewsSummary(reviews) {
  const container = document.querySelector("#reviews-summary");
  if (!reviews.length) { container.innerHTML = ""; return; }

  const avg = avgStars(reviews);
  const counts = [5, 4, 3, 2, 1].map((s) => ({
    star: s,
    count: reviews.filter((r) => r.stars === s).length,
  }));

  container.innerHTML = `
    <div class="reviews-avg">
      <span class="reviews-avg-number">${avg.toFixed(1)}</span>
      <span class="reviews-avg-stars">${starsHtml(avg, "1rem")}</span>
      <span class="reviews-avg-total">${reviews.length} reseña${reviews.length !== 1 ? "s" : ""}</span>
    </div>
    <div class="reviews-bars">
      ${counts.map(({ star, count }) => `
        <div class="reviews-bar-row">
          <span>${star}★</span>
          <div class="reviews-bar-track">
            <div class="reviews-bar-fill" style="width:${reviews.length ? Math.round((count / reviews.length) * 100) : 0}%"></div>
          </div>
          <span class="reviews-bar-count">${count}</span>
        </div>`).join("")}
    </div>`;
}

function renderReviewsList(reviews) {
  const list = document.querySelector("#reviews-list");
  if (!reviews.length) {
    list.innerHTML = `<div class="reviews-empty">Todavía no hay reseñas.<br>¡Sé el primero en opinar!</div>`;
    return;
  }
  list.innerHTML = reviews.map((r) => `
    <div class="review-item">
      <div class="review-item-head">
        <div class="review-item-author">
          <div class="review-avatar">${r.author.slice(0, 2).toUpperCase()}</div>
          <span class="review-author-name">${escapeHtml(r.author)}</span>
        </div>
        <span class="review-date">${r.date}</span>
      </div>
      <div class="review-stars">${starsHtml(r.stars, "0.9rem")}</div>
      ${r.text ? `<p class="review-text">${escapeHtml(r.text)}</p>` : ""}
    </div>`).join("");
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── Modal nueva reseña ──────────────────────────────────────────
let reviewModalProductId = null;
let selectedStars = 0;

function openReviewModal(productId) {
  reviewModalProductId = productId;
  selectedStars = 0;
  const product = store.products.find((p) => p.id === productId);

  document.querySelector("#review-modal-product-name").textContent = product?.name || productId;
  document.querySelector("#review-modal-product-cat").textContent = product?.category || "";
  document.querySelector("#review-form").reset();
  document.querySelector("#review-star-required").textContent = "";
  updateStarPicker(0);
  document.querySelector("#review-modal-overlay").classList.add("is-open");
}

function closeReviewModal() {
  document.querySelector("#review-modal-overlay").classList.remove("is-open");
  reviewModalProductId = null;
}

function updateStarPicker(value) {
  document.querySelectorAll(".star-pick").forEach((btn) => {
    const s = Number(btn.dataset.star);
    btn.classList.toggle("active", s <= value);
  });
}

function setupReviews() {
  // Star picker hover + click
  const picker = document.querySelector("#star-picker");
  picker.addEventListener("mouseover", (e) => {
    const btn = e.target.closest(".star-pick");
    if (btn) updateStarPicker(Number(btn.dataset.star));
  });
  picker.addEventListener("mouseleave", () => updateStarPicker(selectedStars));
  picker.addEventListener("click", (e) => {
    const btn = e.target.closest(".star-pick");
    if (btn) {
      selectedStars = Number(btn.dataset.star);
      updateStarPicker(selectedStars);
      document.querySelector("#review-star-required").textContent = "";
    }
  });

  // Submit
  document.querySelector("#review-form").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!selectedStars) {
      document.querySelector("#review-star-required").textContent = "Elegí al menos 1 estrella";
      return;
    }
    const form = new FormData(e.currentTarget);
    const review = {
      author: form.get("author").trim() || "Anónimo",
      stars: selectedStars,
      text: form.get("text").trim(),
      date: new Date().toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" }),
    };
    addReview(reviewModalProductId, review);
    closeReviewModal();

    // Refrescar la card en el grid
    const starsContainer = document.querySelector(`[data-product-id="${reviewModalProductId}"] .card-stars`);
    if (starsContainer) renderCardStars(reviewModalProductId, starsContainer);

    // Si el panel de reseñas estaba abierto para ese producto, refrescar
    if (reviewsPanelProductId === reviewModalProductId) {
      const updatedReviews = getProductReviews(reviewModalProductId);
      renderReviewsSummary(updatedReviews);
      renderReviewsList(updatedReviews);
      const avg = avgStars(updatedReviews);
      document.querySelector("#reviews-panel-stars").innerHTML = starsHtml(avg, "1rem");
    }

    // Abrir el panel de reseñas para ver la nueva reseña publicada
    openReviewsPanel(reviewModalProductId);
  });

  // Cerrar modal
  document.querySelector("#close-review-modal").addEventListener("click", closeReviewModal);
  document.querySelector("#cancel-review-modal").addEventListener("click", closeReviewModal);
  document.querySelector("#review-modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "review-modal-overlay") closeReviewModal();
  });

  // Panel de reseñas
  document.querySelector("#close-reviews-panel").addEventListener("click", closeReviewsPanel);
  document.querySelector("#reviews-panel").addEventListener("click", (e) => {
    if (e.target.id === "reviews-panel") closeReviewsPanel();
  });
  document.querySelector("#open-review-from-panel").addEventListener("click", () => {
    const id = reviewsPanelProductId;
    closeReviewsPanel();
    openReviewModal(id);
  });
}

// ═══════════════════════════════════════════════════════════════
// BÚSQUEDA INTELIGENTE
// ═══════════════════════════════════════════════════════════════

const SEARCH_HISTORY_KEY = "canopia_search_history";
const MAX_HISTORY = 6;
const MAX_SUGGESTIONS = 5;

// ── Historial ──────────────────────────────────────────────────
function getSearchHistory() {
  try { return JSON.parse(localStorage.getItem(SEARCH_HISTORY_KEY) || "[]"); }
  catch { return []; }
}
function addToSearchHistory(query) {
  if (!query.trim()) return;
  let history = getSearchHistory().filter((h) => h !== query);
  history.unshift(query);
  localStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history.slice(0, MAX_HISTORY)));
}

// ── Algoritmo de relevancia ─────────────────────────────────────
/**
 * Calcula un score de 0-100 para un producto dado un query.
 * Mayor = más relevante.
 */
function scoreProduct(product, query) {
  const q = cleanString(query.trim());
  if (!q) return 0;

  const tokens = q.split(/\s+/).filter(Boolean);
  const fields = [
    { value: cleanString(product.name), weight: 10 },
    { value: cleanString(product.tag || ""), weight: 5 },
    { value: cleanString(product.category || ""), weight: 4 },
    { value: cleanString(product.description || ""), weight: 2 },
  ];

  let score = 0;

  for (const { value, weight } of fields) {
    // Coincidencia exacta del query completo
    if (value === q) { score += weight * 10; continue; }
    // Empieza con el query completo
    if (value.startsWith(q)) { score += weight * 7; continue; }
    // Contiene el query completo
    if (value.includes(q)) { score += weight * 5; }

    // Por cada token individual
    for (const token of tokens) {
      if (value === token) score += weight * 4;
      else if (value.startsWith(token)) score += weight * 3;
      else if (value.includes(token)) score += weight * 2;
      else {
        // Fuzzy: tolerancia a 1-2 errores tipográficos en palabras cortas
        const words = value.split(/\s+/);
        for (const word of words) {
          const dist = levenshtein(token, word);
          const maxDist = token.length <= 4 ? 1 : 2;
          if (dist <= maxDist) score += weight * (maxDist - dist + 1);
        }
      }
    }
  }

  return score;
}

/**
 * Distancia de Levenshtein entre dos strings cortos.
 * Limitado a strings ≤20 chars para rendimiento.
 */
function levenshtein(a, b) {
  if (a.length > 20 || b.length > 20) return 99;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Devuelve los productos visibles ordenados por relevancia para un query.
 * Excluye score 0.
 */
function smartSearch(query) {
  if (!query.trim()) return [];
  return store.products
    .filter((p) => p.visible !== false)
    .map((p) => ({ product: p, score: scoreProduct(p, query) }))
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score)
    .map(({ product }) => product);
}

/**
 * Envuelve las ocurrencias del query en <mark> dentro de un string.
 */
function highlightText(text, query) {
  if (!query.trim()) return escapeHtml(text);
  const tokens = cleanString(query).split(/\s+/).filter((t) => t.length >= 2);
  let result = escapeHtml(text);
  for (const token of tokens) {
    // Regex case-insensitive sobre el texto ya escapado
    const re = new RegExp(`(${token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")})`, "gi");
    result = result.replace(re, "<mark>$1</mark>");
  }
  return result;
}

// ── Dropdown de sugerencias ─────────────────────────────────────
function buildDropdown() {
  const wrap = document.createElement("div");
  wrap.className = "search-dropdown";
  wrap.id = "search-dropdown";
  wrap.setAttribute("role", "listbox");
  wrap.setAttribute("aria-label", "Sugerencias de búsqueda");
  return wrap;
}

function renderDropdown(query, dropdown) {
  dropdown.innerHTML = "";

  const trimmed = query.trim();

  // Sin query → mostrar historial
  if (!trimmed) {
    const history = getSearchHistory();
    if (!history.length) { dropdown.classList.remove("is-open"); return; }

    const section = document.createElement("div");
    section.className = "search-dropdown-section";
    section.innerHTML = `
      <div class="search-dropdown-label">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
        </svg>
        Búsquedas recientes
      </div>
      ${history.map((h) => `
        <button class="search-history-item" type="button" data-history="${escapeHtml(h)}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="1 4 1 10 7 10"/>
            <path d="M3.51 15a9 9 0 1 0 .49-3.67"/>
          </svg>
          ${escapeHtml(h)}
        </button>`).join("")}`;
    dropdown.appendChild(section);
    dropdown.classList.add("is-open");

    dropdown.querySelectorAll("[data-history]").forEach((btn) => {
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        applySearch(btn.dataset.history);
      });
    });
    return;
  }

  // Con query → sugerencias de productos
  const results = smartSearch(trimmed);

  if (!results.length) {
    dropdown.innerHTML = `
      <div class="search-no-results">
        <strong>Sin resultados para "${escapeHtml(trimmed)}"</strong>
        Probá con otro término
      </div>`;
    dropdown.classList.add("is-open");
    return;
  }

  const section = document.createElement("div");
  section.className = "search-dropdown-section";
  section.innerHTML = `
    <div class="search-dropdown-label">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
      </svg>
      Productos
    </div>
    ${results.slice(0, MAX_SUGGESTIONS).map((p) => `
      <button class="search-suggestion-item" type="button" data-suggest-id="${p.id}">
        <div class="suggestion-thumb">
          ${p.image
            ? `<img src="${p.image}" alt="" loading="lazy" />`
            : `<span>${initials(p.name)}</span>`}
        </div>
        <div class="suggestion-info">
          <div class="suggestion-name">${highlightText(p.name, trimmed)}</div>
          <div class="suggestion-meta">
            <span class="suggestion-price">${formatPrice(p.price)}</span>
            <span class="suggestion-cat">${p.category}</span>
          </div>
        </div>
      </button>`).join("")}`;
  dropdown.appendChild(section);

  if (results.length > MAX_SUGGESTIONS) {
    const btn = document.createElement("button");
    btn.className = "search-view-all";
    btn.type = "button";
    btn.dataset.viewAll = trimmed;
    btn.innerHTML = `Ver los ${results.length} resultados
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M5 12h14M12 5l7 7-7 7"/>
      </svg>`;
    dropdown.appendChild(btn);
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      applySearch(trimmed);
    });
  }

  dropdown.classList.add("is-open");

  dropdown.querySelectorAll("[data-suggest-id]").forEach((btn) => {
    btn.addEventListener("mousedown", (e) => {
      e.preventDefault();
      const product = store.products.find((p) => p.id === btn.dataset.suggestId);
      if (product) {
        applySearch(product.name);
        // scroll directo al producto en el grid
        setTimeout(() => {
          const card = document.querySelector(`[data-product-id="${product.id}"]`);
          card?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 150);
      }
    });
  });
}

/**
 * Aplica una búsqueda: guarda historial, actualiza inputs, renderiza.
 */
function applySearch(query) {
  searchQuery = query;
  addToSearchHistory(query);

  // Sincronizar ambos inputs
  const headerInput = document.querySelector("#header-search-input");
  const catalogInput = document.querySelector("#catalog-search");
  if (headerInput) headerInput.value = query;
  if (catalogInput) catalogInput.value = query;

  renderProducts();

  // Scroll al catálogo
  document.querySelector("#catalogo")?.scrollIntoView({ behavior: "smooth" });

  // Cerrar dropdown
  const dropdown = document.querySelector("#search-dropdown");
  if (dropdown) dropdown.classList.remove("is-open");
}

// ── Setup ───────────────────────────────────────────────────────
function setupSmartSearch() {
  const headerInput = document.querySelector("#header-search-input");
  const searchBarOverlay = document.querySelector("#search-bar-overlay");
  const searchToggle = document.querySelector("#search-toggle");
  const searchClose = document.querySelector("#search-close");

  // Crear dropdown y agregarlo al DOM
  const dropdown = buildDropdown();
  document.querySelector(".search-bar-inner")?.appendChild(dropdown);

  // Abrir/cerrar barra del header
  searchToggle?.addEventListener("click", () => {
    searchBarOverlay.hidden = !searchBarOverlay.hidden;
    if (!searchBarOverlay.hidden) {
      headerInput?.focus();
      renderDropdown("", dropdown);
    }
  });
  searchClose?.addEventListener("click", () => {
    searchBarOverlay.hidden = true;
    dropdown.classList.remove("is-open");
  });

  // Typing en el header
  headerInput?.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    const catalogInput = document.querySelector("#catalog-search");
    if (catalogInput) catalogInput.value = searchQuery;
    renderProducts();
    renderDropdown(searchQuery, dropdown);
  });

  headerInput?.addEventListener("focus", () => {
    renderDropdown(headerInput.value, dropdown);
  });

  headerInput?.addEventListener("blur", () => {
    // Pequeño delay para que los clicks en el dropdown se registren
    setTimeout(() => dropdown.classList.remove("is-open"), 150);
  });

  // Teclado en el header (Enter guarda historial)
  headerInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && headerInput.value.trim()) {
      addToSearchHistory(headerInput.value.trim());
      dropdown.classList.remove("is-open");
      document.querySelector("#catalogo")?.scrollIntoView({ behavior: "smooth" });
    }
    if (e.key === "Escape") {
      searchBarOverlay.hidden = true;
      dropdown.classList.remove("is-open");
    }
  });

  // Typing en el catálogo (inline, sin dropdown)
  const catalogInput = document.querySelector("#catalog-search");
  catalogInput?.addEventListener("input", (e) => {
    searchQuery = e.target.value;
    if (headerInput) headerInput.value = searchQuery;
    renderProducts();
  });
  catalogInput?.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && catalogInput.value.trim()) {
      addToSearchHistory(catalogInput.value.trim());
    }
  });
}

// ═══════════════════════════════════════════════════════════════
// SISTEMA DE AUTENTICACIÓN Y PERFIL
// ═══════════════════════════════════════════════════════════════

const USER_TOKEN_KEY = "canopia_user_token";
const USER_DATA_KEY  = "canopia_user_data";

let currentUser  = null;
let currentToken = localStorage.getItem(USER_TOKEN_KEY) || null;

// ── API helper autenticado ──────────────────────────────────────
async function authApi(action, method = "GET", body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (currentToken) opts.headers["Authorization"] = `Bearer ${currentToken}`;
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(`${apiBase}/api/auth?action=${action}`, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Error en la solicitud.");
  return data;
}

// ── Persistencia local del usuario ─────────────────────────────
function saveUserSession(token, user) {
  currentToken = token;
  currentUser  = user;
  localStorage.setItem(USER_TOKEN_KEY, token);
  localStorage.setItem(USER_DATA_KEY, JSON.stringify(user));
}

function clearUserSession() {
  currentToken = null;
  currentUser  = null;
  localStorage.removeItem(USER_TOKEN_KEY);
  localStorage.removeItem(USER_DATA_KEY);
}

function loadUserFromStorage() {
  try {
    const raw = localStorage.getItem(USER_DATA_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

// ── Sincronización de favoritos ─────────────────────────────────
async function syncFavsToServer() {
  if (!currentToken) return;
  try {
    await authApi("sync-favs", "POST", { favs: [...favs] });
  } catch { /* silent */ }
}

async function loadFavsFromServer() {
  if (!currentToken) return;
  try {
    const data = await authApi("me");
    // Merge: server favs + local favs
    const serverFavs = JSON.parse(data.user?.favs_json || "[]");
    serverFavs.forEach((id) => favs.add(id));
    saveFavs();
    updateFavCount();
  } catch { /* silent */ }
}

// ── Render del header icon ──────────────────────────────────────
function updateAuthButton() {
  const btn = document.querySelector("#open-auth");
  if (!btn) return;
  if (currentUser) {
    btn.classList.add("is-logged");
    btn.setAttribute("aria-label", `Mi cuenta — ${currentUser.name}`);
    btn.title = currentUser.name;
  } else {
    btn.classList.remove("is-logged");
    btn.setAttribute("aria-label", "Mi cuenta");
    btn.title = "";
  }
}

// ── Abrir / cerrar panel ────────────────────────────────────────
function openAuthPanel() {
  const panel = document.querySelector("#auth-panel");
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  if (currentUser) showProfileView();
  else showLoginView();
}

function closeAuthPanel() {
  const panel = document.querySelector("#auth-panel");
  panel.classList.remove("is-open");
  panel.setAttribute("aria-hidden", "true");
}

function showLoginView() {
  document.querySelector("#auth-view-login").hidden  = false;
  document.querySelector("#auth-view-profile").hidden = true;
  document.querySelector("#auth-message").textContent = "";
}

function showProfileView() {
  document.querySelector("#auth-view-login").hidden  = true;
  document.querySelector("#auth-view-profile").hidden = false;
  renderAuthUserBadge();
  switchProfileTab("orders");
}

function renderAuthUserBadge() {
  if (!currentUser) return;
  document.querySelector("#auth-user-badge").innerHTML = `
    <div class="auth-avatar">${currentUser.name.slice(0, 2).toUpperCase()}</div>
    <div class="auth-user-info">
      <strong>${escapeHtml(currentUser.name)}</strong>
      <small>${escapeHtml(currentUser.email)}</small>
    </div>`;
}

// ── Tabs del perfil ─────────────────────────────────────────────
function switchProfileTab(tab) {
  document.querySelectorAll(".auth-profile-tab").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.ptab === tab);
  });
  document.querySelectorAll(".auth-ptab-content").forEach((el) => {
    el.hidden = true;
  });
  const content = document.querySelector(`#ptab-${tab}`);
  if (content) content.hidden = false;

  if (tab === "orders")    loadProfileOrders();
  if (tab === "addresses") loadProfileAddresses();
  if (tab === "favs")      renderProfileFavs();
  if (tab === "settings")  renderProfileSettings();
}

// ── Tab: Pedidos ────────────────────────────────────────────────
async function loadProfileOrders() {
  const container = document.querySelector("#profile-orders-list");
  container.innerHTML = `<p style="color:var(--muted);font-size:.85rem">Cargando pedidos...</p>`;
  try {
    const data = await authApi("orders");
    renderProfileOrders(data.orders || []);
  } catch {
    container.innerHTML = `<p style="color:var(--muted);font-size:.85rem">No se pudieron cargar los pedidos.</p>`;
  }
}

function renderProfileOrders(orders) {
  const container = document.querySelector("#profile-orders-list");
  if (!orders.length) {
    container.innerHTML = `
      <div class="auth-empty">
        <div class="auth-empty-icon">🛍️</div>
        <strong>Sin pedidos aún</strong>
        <p>Tus compras confirmadas aparecerán acá.</p>
      </div>`;
    return;
  }
  container.innerHTML = orders.map((o) => `
    <div class="order-card">
      <div class="order-card-head">
        <div>
          <div class="order-card-id">Pedido #${o.id}</div>
          <div class="order-card-date">${o.created_at ? new Date(o.created_at).toLocaleDateString("es-AR") : ""}</div>
        </div>
        <span class="order-status ${o.status}">${o.status}</span>
      </div>
      <div class="order-card-body">
        ${(o.items || []).map((item) => `
          <div class="order-item-row">
            <strong>${escapeHtml(item.name)}</strong>
            <span>x${item.quantity} — ${formatPrice(item.subtotal)}</span>
          </div>`).join("")}
        <div class="order-total">
          <span>Total</span>
          <span>${formatPrice(o.total)}</span>
        </div>
        ${o.note ? `<p style="font-size:.78rem;color:var(--muted);margin-top:.4rem">Nota: ${escapeHtml(o.note)}</p>` : ""}
      </div>
    </div>`).join("");
}

// ── Tab: Direcciones ────────────────────────────────────────────
async function loadProfileAddresses() {
  const container = document.querySelector("#profile-addresses-list");
  container.innerHTML = `<p style="color:var(--muted);font-size:.85rem">Cargando...</p>`;
  try {
    const data = await authApi("addresses");
    renderProfileAddresses(data.addresses || []);
  } catch {
    container.innerHTML = "";
  }
}

function renderProfileAddresses(addresses) {
  const container = document.querySelector("#profile-addresses-list");
  if (!addresses.length) {
    container.innerHTML = `
      <div class="auth-empty">
        <div class="auth-empty-icon">📍</div>
        <strong>Sin direcciones guardadas</strong>
        <p>Guardá tus direcciones para agilizar futuros pedidos.</p>
      </div>`;
    return;
  }
  container.innerHTML = addresses.map((a) => `
    <div class="address-card">
      <div class="address-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>
      <div class="address-info">
        <div class="address-label">${escapeHtml(a.label)}</div>
        <div class="address-line">${escapeHtml(a.line1)}</div>
        ${a.city ? `<div class="address-city">${escapeHtml(a.city)}</div>` : ""}
        ${a.notes ? `<div class="address-notes">${escapeHtml(a.notes)}</div>` : ""}
      </div>
      <div class="address-actions">
        <button class="btn btn-outline" type="button" data-edit-address="${a.id}"
          data-label="${escapeHtml(a.label)}" data-line1="${escapeHtml(a.line1)}"
          data-city="${escapeHtml(a.city || "")}" data-notes="${escapeHtml(a.notes || "")}">
          Editar
        </button>
        <button class="btn btn-outline danger" type="button" data-delete-address="${a.id}">✕</button>
      </div>
    </div>`).join("");

  container.querySelectorAll("[data-edit-address]").forEach((btn) => {
    btn.addEventListener("click", () => openAddressForm(btn.dataset));
  });
  container.querySelectorAll("[data-delete-address]").forEach((btn) => {
    btn.addEventListener("click", () => deleteAddress(btn.dataset.deleteAddress));
  });
}

async function deleteAddress(id) {
  try {
    await authApi(`address&id=${id}`, "DELETE");
    loadProfileAddresses();
  } catch { /* silent */ }
}

function openAddressForm(data = {}) {
  const form = document.querySelector("#address-form");
  form.hidden = false;
  form.label.value = data.label || "Casa";
  form.line1.value = data.line1 || "";
  form.city.value  = data.city  || "";
  form.notes.value = data.notes || "";
  form.id.value    = data.editAddress || "";
  form.scrollIntoView({ behavior: "smooth" });
}

// ── Tab: Favoritos ──────────────────────────────────────────────
function renderProfileFavs() {
  const list = document.querySelector("#profile-favs-list");
  const favProducts = [...favs]
    .map((id) => store.products.find((p) => p.id === id))
    .filter(Boolean);

  if (!favProducts.length) {
    list.innerHTML = `
      <div class="auth-empty">
        <div class="auth-empty-icon">❤️</div>
        <strong>Sin favoritos aún</strong>
        <p>Tocá el corazón en cualquier producto para guardarlo acá.</p>
      </div>`;
    return;
  }

  list.innerHTML = favProducts.map((p) => `
    <div class="fav-item">
      ${p.image
        ? `<img class="fav-item-art" src="${p.image}" alt="${p.name}" loading="lazy" />`
        : `<div class="fav-item-art">${initials(p.name)}</div>`}
      <div class="fav-item-info">
        <strong>${escapeHtml(p.name)}</strong>
        <span>${formatPrice(p.price)}</span>
      </div>
      <div class="fav-item-actions">
        <button class="btn btn-primary" type="button" data-fav-buy="${p.id}"
          ${Number(p.stock) <= 0 ? "disabled" : ""}>Comprar</button>
        <button class="btn btn-outline" type="button" data-fav-remove="${p.id}">✕</button>
      </div>
    </div>`).join("");

  list.querySelectorAll("[data-fav-buy]").forEach((btn) => {
    btn.addEventListener("click", () => { addToCart(btn.dataset.favBuy); closeAuthPanel(); openCart(); });
  });
  list.querySelectorAll("[data-fav-remove]").forEach((btn) => {
    btn.addEventListener("click", () => { toggleFav(btn.dataset.favRemove); renderProfileFavs(); });
  });
}

// ── Tab: Configuración ──────────────────────────────────────────
function renderProfileSettings() {
  if (!currentUser) return;
  const form = document.querySelector("#profile-edit-form");
  form.name.value  = currentUser.name  || "";
  form.phone.value = currentUser.phone || "";
}

// ── Setup ───────────────────────────────────────────────────────
function setupAuth() {
  // Abrir panel
  document.querySelector("#open-auth")?.addEventListener("click", openAuthPanel);

  // Cerrar
  ["#close-auth-panel", "#close-auth-panel-2"].forEach((sel) => {
    document.querySelector(sel)?.addEventListener("click", closeAuthPanel);
  });
  document.querySelector("#auth-panel")?.addEventListener("click", (e) => {
    if (e.target.id === "auth-panel") closeAuthPanel();
  });

  // Tabs login/registro
  document.querySelectorAll(".auth-tab").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".auth-tab").forEach((t) => t.classList.remove("is-active"));
      btn.classList.add("is-active");
      const isLogin = btn.dataset.tab === "login";
      document.querySelector("#login-form-user").hidden    = !isLogin;
      document.querySelector("#register-form-user").hidden = isLogin;
      document.querySelector("#auth-message").textContent  = "";
    });
  });

  // Login
  document.querySelector("#login-form-user")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.querySelector("#auth-message");
    msg.className = "auth-message";
    msg.textContent = "Verificando...";
    const fd = new FormData(e.currentTarget);
    try {
      const data = await authApi("login", "POST", {
        email: fd.get("email"),
        password: fd.get("password"),
      });
      saveUserSession(data.token, data.user);
      await loadFavsFromServer();
      updateAuthButton();
      showProfileView();
      msg.textContent = "";
    } catch (err) {
      msg.textContent = err.message;
    }
  });

  // Registro
  document.querySelector("#register-form-user")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.querySelector("#auth-message");
    msg.className = "auth-message";
    msg.textContent = "Creando cuenta...";
    const fd = new FormData(e.currentTarget);
    try {
      const data = await authApi("register", "POST", {
        name:     fd.get("name"),
        email:    fd.get("email"),
        phone:    fd.get("phone"),
        password: fd.get("password"),
      });
      saveUserSession(data.token, data.user);
      await syncFavsToServer();
      updateAuthButton();
      showProfileView();
      msg.textContent = "";
    } catch (err) {
      msg.textContent = err.message;
    }
  });

  // Saltar login
  document.querySelector("#auth-skip-btn")?.addEventListener("click", closeAuthPanel);

  // Tabs del perfil
  document.querySelectorAll(".auth-profile-tab").forEach((btn) => {
    btn.addEventListener("click", () => switchProfileTab(btn.dataset.ptab));
  });

  // Logout
  document.querySelector("#logout-user-btn")?.addEventListener("click", () => {
    clearUserSession();
    updateAuthButton();
    showLoginView();
  });

  // Editar perfil
  document.querySelector("#profile-edit-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const msg = document.querySelector("#profile-edit-message");
    const fd  = new FormData(e.currentTarget);
    try {
      const data = await authApi("profile", "PUT", {
        name:  fd.get("name"),
        phone: fd.get("phone"),
      });
      currentUser = data.user;
      localStorage.setItem(USER_DATA_KEY, JSON.stringify(data.user));
      renderAuthUserBadge();
      msg.className = "auth-message is-ok";
      msg.textContent = "¡Cambios guardados!";
      setTimeout(() => { msg.textContent = ""; }, 3000);
    } catch (err) {
      msg.className = "auth-message";
      msg.textContent = err.message;
    }
  });

  // Dirección: mostrar form
  document.querySelector("#add-address-btn")?.addEventListener("click", () => {
    openAddressForm();
  });
  document.querySelector("#cancel-address-btn")?.addEventListener("click", () => {
    document.querySelector("#address-form").hidden = true;
  });

  // Dirección: guardar
  document.querySelector("#address-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    try {
      await authApi("address", "POST", {
        id:    fd.get("id") || undefined,
        label: fd.get("label"),
        line1: fd.get("line1"),
        city:  fd.get("city"),
        notes: fd.get("notes"),
      });
      document.querySelector("#address-form").hidden = true;
      loadProfileAddresses();
    } catch (err) {
      alert(err.message);
    }
  });

  // Restaurar sesión previa
  const savedUser = loadUserFromStorage();
  if (savedUser && currentToken) {
    currentUser = savedUser;
    updateAuthButton();
    // Verificar token en background
    authApi("me").then((data) => {
      currentUser = data.user;
      localStorage.setItem(USER_DATA_KEY, JSON.stringify(data.user));
      updateAuthButton();
      loadFavsFromServer();
    }).catch(() => {
      clearUserSession();
      updateAuthButton();
    });
  }
}

// Override de toggleFav para sincronizar con el servidor
// eslint-disable-next-line no-global-assign
function toggleFav(id) {
  if (favs.has(id)) favs.delete(id);
  else favs.add(id);
  saveFavs();
  document.querySelectorAll(`[data-fav-toggle="${id}"]`).forEach((btn) => {
    const isFav = favs.has(id);
    btn.classList.toggle("is-fav", isFav);
    btn.textContent = isFav ? "❤️" : "🤍";
    btn.setAttribute("aria-label", isFav ? "Quitar de favoritos" : "Agregar a favoritos");
  });
  updateFavCount();
  // Refrescar panel de favoritos si está abierto
  if (document.querySelector("#favs-panel")?.classList.contains("is-open")) renderFavs();
  // Refrescar tab de favoritos en perfil si está visible
  const ptabFavs = document.querySelector("#ptab-favs");
  if (ptabFavs && !ptabFavs.hidden) renderProfileFavs();
  // Sync al servidor en background
  syncFavsToServer();
}

// ═══════════════════════════════════════════════════════════════
// MODAL DETALLE DE PRODUCTO
// ═══════════════════════════════════════════════════════════════

const MODAL_REVIEWS_PAGE = 3; // reseñas visibles por defecto
let modalReviewsShowAll = false;

function openProductModal(productId) {
  const product = store.products.find((p) => p.id === productId);
  if (!product) return;

  modalReviewsShowAll = false;
  renderProductModalBody(product);
  renderProductModalReviews(product);

  const overlay = document.querySelector("#product-modal-overlay");
  overlay.classList.add("is-open");
  overlay.setAttribute("aria-hidden", "false");
  document.body.style.overflow = "hidden";
}

function closeProductModal() {
  const overlay = document.querySelector("#product-modal-overlay");
  overlay.classList.remove("is-open");
  overlay.setAttribute("aria-hidden", "true");
  document.body.style.overflow = "";
}

// ── Cuerpo del modal (imagen + info) ─────────────────────────────
function renderProductModalBody(product) {
  const isFav      = favs.has(product.id);
  const isComparing = compareList.includes(product.id);
  const outOfStock = Number(product.stock) <= 0;
  const reviews    = getProductReviews(product.id);
  const avg        = avgStars(reviews);
  const count      = reviews.length;

  const stockClass = outOfStock ? "no-stock" : "";
  const stockText  = outOfStock
    ? "Sin stock"
    : Number(product.stock) <= 3
      ? `Últimos ${product.stock} disponibles`
      : `${product.stock} en stock`;

  document.querySelector("#product-modal-body").innerHTML = `
    <!-- Imagen -->
    <div class="product-modal-img-col" id="product-modal-img-col">
      ${product.image
        ? `<img id="product-modal-main-img" src="${product.image}" alt="${escapeHtml(product.name)}" loading="eager" />`
        : `<div class="product-modal-art">${initials(product.name)}</div>`}
      ${product.images && product.images.length > 1 ? `
        <div class="product-modal-thumbs">
          ${product.images.map((url, i) => `
            <button class="modal-thumb ${i === 0 ? "is-active" : ""}" type="button"
              data-thumb="${url}" style="background-image:url('${url}')">
            </button>`).join("")}
        </div>` : ""}
    </div>

    <!-- Info -->
    <div class="product-modal-info">
      <div class="product-modal-meta">
        <span class="badge">${product.tag}</span>
        <span class="product-modal-cat">${product.category}</span>
      </div>

      <h2 class="product-modal-name" id="product-modal-name">${escapeHtml(product.name)}</h2>

      <!-- Estrellas -->
      <div class="product-modal-stars-row">
        <span class="stars-display">${starsHtml(avg, "1rem")}</span>
        ${count > 0
          ? `<span class="stars-count">${avg.toFixed(1)} (${count} reseña${count !== 1 ? "s" : ""})</span>`
          : `<span class="stars-count" style="color:var(--muted-2)">Sin reseñas aún</span>`}
      </div>

      <p class="product-modal-desc">${escapeHtml(product.description || "")}</p>

      <span class="product-modal-stock ${stockClass}">${stockText}</span>

      <span class="product-modal-price">${formatPrice(product.price)}</span>

      <div class="product-modal-actions">
        <button class="btn btn-primary" type="button"
          id="modal-buy-btn" data-modal-buy="${product.id}" ${outOfStock ? "disabled" : ""}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
          Agregar al carrito
        </button>
        <button class="btn btn-outline ${isFav ? "is-fav-modal" : ""}" type="button"
          id="modal-fav-btn" data-modal-fav="${product.id}"
          aria-label="${isFav ? "Quitar de favoritos" : "Agregar a favoritos"}"
          style="flex:0 0 auto">
          ${isFav ? "❤️" : "🤍"}
        </button>
        <a class="btn btn-outline" href="${whatsappUrl(product.name)}"
          target="_blank" rel="noreferrer" style="flex:0 0 auto">
          <svg viewBox="0 0 24 24" fill="currentColor" style="width:1rem;height:1rem"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M11.975 0C5.363 0 0 5.373 0 11.997c0 2.117.554 4.102 1.523 5.82L.057 23.926l6.264-1.643a11.9 11.9 0 0 0 5.654 1.435h.005c6.613 0 11.975-5.373 11.975-11.997 0-6.623-5.362-11.72-11.98-11.72z"/></svg>
        </a>
      </div>

      <button class="compare-button ${isComparing ? "is-comparing" : ""}" type="button"
        data-modal-compare="${product.id}" style="align-self:flex-start">
        ${isComparing ? "✓ Comparando" : "⚖️ Comparar"}
      </button>
    </div>`;

  // Bind acciones
  document.querySelector("[data-modal-buy]")?.addEventListener("click", () => {
    addToCart(product.id);
    closeProductModal();
  });

  document.querySelector("[data-modal-fav]")?.addEventListener("click", () => {
    toggleFav(product.id);
    // Actualizar botón fav sin cerrar el modal
    const btn = document.querySelector("[data-modal-fav]");
    if (btn) {
      const nowFav = favs.has(product.id);
      btn.textContent = nowFav ? "❤️" : "🤍";
      btn.setAttribute("aria-label", nowFav ? "Quitar de favoritos" : "Agregar a favoritos");
    }
  });

  document.querySelector("[data-modal-compare]")?.addEventListener("click", () => {
    toggleCompare(product.id);
    const btn = document.querySelector("[data-modal-compare]");
    if (btn) {
      const nowComp = compareList.includes(product.id);
      btn.classList.toggle("is-comparing", nowComp);
      btn.textContent = nowComp ? "✓ Comparando" : "⚖️ Comparar";
    }
  });

  // Galería: cambiar imagen principal al clickear miniatura
  document.querySelectorAll(".modal-thumb").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mainImg = document.querySelector("#product-modal-main-img");
      if (mainImg) mainImg.src = btn.dataset.thumb;
      document.querySelectorAll(".modal-thumb").forEach((t) => t.classList.remove("is-active"));
      btn.classList.add("is-active");
    });
  });
}

// ── Sección de reseñas del modal ──────────────────────────────────
function renderProductModalReviews(product) {
  const reviews = getProductReviews(product.id);
  const avg     = avgStars(reviews);
  const count   = reviews.length;
  const visible = modalReviewsShowAll ? reviews : reviews.slice(0, MODAL_REVIEWS_PAGE);

  const summaryHtml = count > 0 ? `
    <div class="modal-reviews-summary">
      <span class="modal-avg-big">${avg.toFixed(1)}</span>
      <div class="modal-avg-right">
        <span>${starsHtml(avg, "1.1rem")}</span>
        <span class="modal-avg-count">${count} reseña${count !== 1 ? "s" : ""}</span>
      </div>
    </div>` : "";

  const listHtml = count === 0
    ? `<div class="modal-reviews-empty">Todavía no hay reseñas. ¡Sé el primero en opinar!</div>`
    : `<div class="modal-reviews-list">
        ${visible.map((r) => `
          <div class="modal-review-item">
            <div class="modal-review-head">
              <div class="modal-review-author">
                <div class="review-avatar">${r.author.slice(0,2).toUpperCase()}</div>
                <span class="review-author-name">${escapeHtml(r.author)}</span>
              </div>
              <div style="display:flex;align-items:center;gap:.5rem">
                <span class="review-stars">${starsHtml(r.stars, "0.85rem")}</span>
                <span class="review-date">${r.date}</span>
              </div>
            </div>
            ${r.text ? `<p class="modal-review-text">${escapeHtml(r.text)}</p>` : ""}
          </div>`).join("")}
       </div>
       ${!modalReviewsShowAll && reviews.length > MODAL_REVIEWS_PAGE
         ? `<button class="modal-show-more" id="modal-show-more-btn">
              Ver las ${reviews.length - MODAL_REVIEWS_PAGE} reseñas restantes ↓
            </button>`
         : ""}`;

  document.querySelector("#product-modal-reviews").innerHTML = `
    <div class="product-modal-reviews-head">
      <h3>Reseñas y opiniones</h3>
      <button class="btn btn-outline" type="button" id="modal-write-review-btn"
        style="min-height:auto;padding:.4rem .9rem;font-size:.8rem">
        ✏️ Escribir reseña
      </button>
    </div>
    ${summaryHtml}
    ${listHtml}`;

  // Bind: escribir reseña
  document.querySelector("#modal-write-review-btn")?.addEventListener("click", () => {
    closeProductModal();
    openReviewModal(product.id);
  });

  // Bind: mostrar más
  document.querySelector("#modal-show-more-btn")?.addEventListener("click", () => {
    modalReviewsShowAll = true;
    renderProductModalReviews(product);
  });
}

// ── Setup ─────────────────────────────────────────────────────────
function setupProductModal() {
  // Cerrar con botón X
  document.querySelector("#close-product-modal")?.addEventListener("click", closeProductModal);

  // Cerrar clickeando el overlay
  document.querySelector("#product-modal-overlay")?.addEventListener("click", (e) => {
    if (e.target.id === "product-modal-overlay") closeProductModal();
  });

  // Cerrar con Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (document.querySelector("#product-modal-overlay")?.classList.contains("is-open")) {
        closeProductModal();
      }
    }
  });

  // Click en la card (delegado desde el grid) — abre el modal
  // Solo si el click NO fue en un botón/link interactivo
  document.querySelector("#product-grid")?.addEventListener("click", (e) => {
    const card = e.target.closest(".product-card");
    if (!card) return;

    // Si el click fue en un botón, link o elemento interactivo, no abrir modal
    const interactive = e.target.closest(
      "button, a, [data-add-to-cart], [data-fav-toggle], [data-compare-toggle], [data-review-open]"
    );
    if (interactive) return;

    const productId = card.dataset.productId;
    if (productId) openProductModal(productId);
  });
}

// ─── Setup catalog controls ───────────────────────────────────────────────────
function setupCatalogControls() {
  // Solo el sort — el search lo maneja setupSmartSearch
  const sortSelect = document.querySelector("#catalog-sort");
  if (sortSelect) {
    sortSelect.addEventListener("change", (e) => {
      activeSort = e.target.value;
      renderProducts();
    });
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
  setupReviews();
  setupProductModal();
  setupSmartSearch();
  setupCatalogControls();
  setupAuth();

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
