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

async function loadStore() {
  try {
    const response = await fetch("data/site.json", { cache: "no-store" });
    store = { ...defaultData, ...(await response.json()) };
    await loadOnlineData();
  } catch (error) {
    console.warn("No se pudo cargar data/site.json", error);
  }
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

function applyTheme() {
  Object.entries(store.theme || {}).forEach(([key, value]) => {
    document.documentElement.style.setProperty(`--${key}`, value);
  });
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

function renderProducts() {
  const grid = document.querySelector("#product-grid");
  const products =
    activeCategory === "todos"
      ? store.products.filter((product) => product.visible !== false)
      : store.products.filter((product) => product.visible !== false && product.category === activeCategory);

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
            <div class="product-meta">
              <span class="price">${formatPrice(product.price)}</span>
              <a class="button ghost" href="${whatsappUrl(product.name)}" target="_blank" rel="noreferrer">Consultar</a>
            </div>
          </div>
        </article>
      `,
    )
    .join("");
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

async function init() {
  await loadStore();
  applyTheme();
  renderCategories();
  renderFilters();
  renderProducts();
  renderCombos();
  setupContact();
  setupHeroFeature();
  setupNav();
}

init();
