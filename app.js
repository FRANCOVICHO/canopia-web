const formatPrice = (value) =>
  new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(value);

const defaultData = {
  theme: {},
  onlineData: {
    productsCsvUrl: "",
    categoriesCsvUrl: "",
    combosCsvUrl: "",
  },
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
let catalogUpdatedAt = null;
let catalogPollTimer = null;
let apiBase = "";

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
  badge.title = isLive ? "Catalogo conectado en tiempo real" : "";
}

function refreshCatalogViews() {
  renderFilters();
  renderProducts();
  renderHeroSlider();
  renderCombos();
  setupHeroFeature();
  renderCart();
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
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);

  const headers = rows.shift()?.map((header) => normalizeKey(header)) || [];
  return rows.map((values) =>
    headers.reduce((record, header, index) => {
      record[header] = values[index]?.trim() || "";
      return record;
    }, {}),
  );
}

function normalizeKey(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_");
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
  return {
    id: row.id || slugify(row.nombre),
    name: row.nombre,
    description: row.descripcion || "",
  };
}

function parseCombo(row) {
  if (!row.nombre) return null;
  return {
    id: row.id || slugify(row.nombre),
    name: row.nombre,
    description: row.descripcion || "",
    items: (row.items || "").split("|").map((item) => item.trim()).filter(Boolean),
    price: Number(row.precio || 0),
    tag: row.etiqueta || "Combo",
  };
}

function slugify(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function applyThemeVariables() {
  // Aplica variables customizadas desde data/site.json si existen
  Object.entries(store.theme || {}).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--${key}`, value);
  });
}

function getSavedTheme() {
  try {
    return localStorage.getItem("canopia_theme");
  } catch {
    return null;
  }
}

function saveTheme(theme) {
  try {
    localStorage.setItem("canopia_theme", theme);
  } catch {
    // ignore
  }
}

function setTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
}

function setupThemePrompt() {
  const dialog = document.querySelector("#theme-dialog");
  const buttons = dialog?.querySelectorAll("[data-theme-value]");
  const themeToggle = document.querySelector("#theme-toggle");

  const applyFromStorageOrPrompt = () => {
    const saved = getSavedTheme();
    if (saved === "dark" || saved === "light") {
      setTheme(saved);
      return;
    }
    if (dialog && typeof dialog.showModal === "function") {
      dialog.showModal();
    } else if (dialog) {
      dialog.setAttribute("open", "true");
    }
  };

  if (buttons?.length) {
    buttons.forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = btn.dataset.themeValue;
        if (value !== "dark" && value !== "light") return;
        setTheme(value);
        saveTheme(value);
        try {
          dialog?.close();
        } catch {
          // ignore
        }
      });
    });
  }

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      const current = document.documentElement.getAttribute("data-theme") || "dark";
      const next = current === "dark" ? "light" : "dark";
      setTheme(next);
      saveTheme(next);
    });
  }

  applyFromStorageOrPrompt();
}


function initials(text) {
  return text
    .split(" ")
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function renderCategories() {
  const grid = document.querySelector("#category-grid");
  grid.innerHTML = store.categories
    .map(
      (category) => `
        <article class="category-card">
          <strong>${category.name}</strong>
          <span>${category.description}</span>
        </article>
      `,
    )
    .join("");
}

function renderFilters() {
  const filters = document.querySelector("#filters");
  const items = [{ id: "todos", name: "Todo" }, ...store.categories];
  filters.innerHTML = items
    .map(
      (item) => `
        <button class="filter-button ${item.id === activeCategory ? "is-active" : ""}" type="button" data-filter="${item.id}">
          ${item.name}
        </button>
      `,
    )
    .join("");

  filters.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => {
      activeCategory = button.dataset.filter;
      renderFilters();
      renderProducts();
    });
  });
}

function cleanString(str) {
  return (str || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function renderProducts() {
  const grid = document.querySelector("#product-grid");
  
  // 1. Filtrar por categoría
  let products =
    activeCategory === "todos"
      ? store.products.filter((product) => product.visible !== false)
      : store.products.filter((product) => product.visible !== false && product.category === activeCategory);

  // 2. Filtrar por texto de búsqueda
  if (searchQuery.trim()) {
    const query = cleanString(searchQuery);
    products = products.filter(
      (product) =>
        cleanString(product.name).includes(query) ||
        cleanString(product.description || "").includes(query),
    );
  }

  // 3. Ordenar
  if (activeSort === "price-asc") {
    products.sort((a, b) => a.price - b.price);
  } else if (activeSort === "price-desc") {
    products.sort((a, b) => b.price - a.price);
  } else if (activeSort === "name-asc") {
    products.sort((a, b) => a.name.localeCompare(b.name));
  }

  grid.innerHTML = products
    .map(
      (product) => `
        <article class="product-card">
          ${
            product.image
              ? `<img class="product-image" src="${product.image}" alt="${product.name}" loading="lazy" />`
              : `<div class="product-art">${initials(product.name)}</div>`
          }
          <div class="product-body">
            <span class="badge">${product.tag}</span>
            <h3>${product.name}</h3>
            <p>${product.description}</p>
            <span class="stock-line">${stockLabel(product.stock)}</span>
            <div class="product-meta">
              <span class="price">${formatPrice(product.price)}</span>
              <div class="product-actions">
                <button class="button primary" type="button" data-add-to-cart="${product.id}" ${Number(product.stock) <= 0 ? "disabled" : ""}>Comprar</button>
                <a class="button ghost" href="${whatsappUrl(product.name)}" target="_blank" rel="noreferrer">Consultar</a>
              </div>
            </div>
          </div>
        </article>
      `,
    )
    .join("");

  grid.querySelectorAll("[data-add-to-cart]").forEach((button) => {
    button.addEventListener("click", () => addToCart(button.dataset.addToCart));
  });
}

function renderHeroSlider() {
  const track = document.querySelector("#hero-slider-track");
  const products = store.products.filter((product) => product.visible !== false).slice(0, 8);
  if (!products.length) return;

  track.innerHTML = [...products, ...products]
    .map(
      (product) => `
        <a class="hero-slide" href="#catalogo">
          <span>${product.tag}</span>
          <strong>${product.name}</strong>
          <small>${formatPrice(product.price)} · ${stockLabel(product.stock)}</small>
        </a>
      `,
    )
    .join("");
}

function stockLabel(stock) {
  const value = Number(stock || 0);
  if (value <= 0) return "Sin stock";
  if (value <= 3) return `Ultimos ${value}`;
  return `Stock: ${value}`;
}

function renderCombos() {
  const grid = document.querySelector("#combo-grid");
  grid.innerHTML = store.combos
    .map(
      (combo) => `
        <article class="combo-card">
          <span class="badge">${combo.tag}</span>
          <h3>${combo.name}</h3>
          <p>${combo.description}</p>
          <ul>${combo.items.map((item) => `<li>${item}</li>`).join("")}</ul>
          <strong class="price">${formatPrice(combo.price)}</strong>
        </article>
      `,
    )
    .join("");
}

function whatsappUrl(productName = "") {
  const phone = store.contact.whatsapp || "";
  const message = productName
    ? `Hola Canopia, quiero consultar por ${productName}.`
    : store.contact.message;
  return `https://wa.me/${phone}?text=${encodeURIComponent(message)}`;
}

function setupContact() {
  document.querySelectorAll("[data-whatsapp-link]").forEach((link) => {
    link.href = whatsappUrl();
    link.target = "_blank";
    link.rel = "noreferrer";
  });

  const instagram = document.querySelector("#instagram-link");
  instagram.href = store.contact.instagram;

  const text = document.querySelector("#contact-text");
  if (store.contact.text) text.textContent = store.contact.text;
}

function setupHeroFeature() {
  const featured = store.products.find((product) => product.featured) || store.products[0];
  if (!featured) return;
  document.querySelector("#hero-feature").textContent = featured.name;
  document.querySelector("#hero-price").textContent = formatPrice(featured.price);
}

function setupNav() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector("#main-nav");
  toggle.addEventListener("click", () => {
    const isOpen = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", String(isOpen));
  });
}

function addToCart(productId) {
  const product = store.products.find((item) => item.id === productId);
  if (!product || Number(product.stock) <= 0) return;

  const existing = cart.find((item) => item.id === productId);
  if (existing) {
    if (existing.quantity < Number(product.stock)) existing.quantity += 1;
  } else {
    cart.push({ id: productId, quantity: 1 });
  }

  saveCart();
  openCart();
}

function saveCart() {
  localStorage.setItem("canopia_cart", JSON.stringify(cart));
  renderCart();
}

function renderCart() {
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = cart.reduce((sum, item) => {
    const product = store.products.find((entry) => entry.id === item.id);
    return sum + (product ? product.price * item.quantity : 0);
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
      const product = store.products.find((entry) => entry.id === item.id);
      if (!product) return "";
      return `
        <div class="cart-line">
          <div>
            <strong>${product.name}</strong>
            <span>${formatPrice(product.price)} x ${item.quantity}</span>
          </div>
          <div class="quantity-controls">
            <button type="button" data-cart-dec="${item.id}">-</button>
            <strong>${item.quantity}</strong>
            <button type="button" data-cart-inc="${item.id}">+</button>
          </div>
        </div>
      `;
    })
    .join("");

  items.querySelectorAll("[data-cart-dec]").forEach((button) => {
    button.addEventListener("click", () => changeQuantity(button.dataset.cartDec, -1));
  });
  items.querySelectorAll("[data-cart-inc]").forEach((button) => {
    button.addEventListener("click", () => changeQuantity(button.dataset.cartInc, 1));
  });
}

function changeQuantity(productId, delta) {
  const product = store.products.find((entry) => entry.id === productId);
  const item = cart.find((entry) => entry.id === productId);
  if (!item || !product) return;

  item.quantity += delta;
  if (item.quantity <= 0) cart = cart.filter((entry) => entry.id !== productId);
  if (item.quantity > Number(product.stock)) item.quantity = Number(product.stock);
  saveCart();
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
  document.querySelector("#cart-panel").addEventListener("click", (event) => {
    if (event.target.id === "cart-panel") closeCart();
  });
  document.querySelector("#checkout-form").addEventListener("submit", checkout);
  renderCart();
}

async function checkout(event) {
  event.preventDefault();
  const message = document.querySelector("#checkout-message");
  if (!cart.length) {
    message.textContent = "Agrega productos antes de confirmar.";
    return;
  }

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

    cart = [];
    saveCart();
    await loadDatabaseProducts();
    renderProducts();
    setupHeroFeature();
    message.textContent = "Compra confirmada. Te abrimos WhatsApp con el resumen.";
    window.open(whatsappOrderUrl(result), "_blank", "noreferrer");
  } catch (error) {
    message.textContent = error.message;
  }
}

function whatsappOrderUrl(order) {
  const lines = [
    "Hola Canopia, confirme esta compra desde la web:",
    ...order.items.map((item) => `- ${item.name} x${item.quantity}: ${formatPrice(item.subtotal)}`),
    `Total: ${formatPrice(order.total)}`,
    `Nombre: ${order.customer.name}`,
    `Telefono: ${order.customer.phone}`,
    order.customer.note ? `Nota: ${order.customer.note}` : "",
  ].filter(Boolean);

  return `https://wa.me/${store.contact.whatsapp}?text=${encodeURIComponent(lines.join("\n"))}`;
}

function setupCatalogControls() {
  const searchInput = document.querySelector("#catalog-search");
  const sortSelect = document.querySelector("#catalog-sort");

  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      searchQuery = event.target.value;
      renderProducts();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", (event) => {
      activeSort = event.target.value;
      renderProducts();
    });
  }
}

async function init() {
  await loadStore();
  // Tema: pregunta si no hay elección guardada
  setupThemePrompt();
  applyThemeVariables();

  renderCategories();
  renderFilters();
  renderProducts();
  renderHeroSlider();
  renderCombos();
  setupContact();
  setupHeroFeature();
  setupNav();
  setupCart();
  setupCatalogControls();

  if (catalogUpdatedAt) {
    refreshCatalogViews();
    startCatalogPolling();
  }
}

init();
