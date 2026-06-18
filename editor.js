let data = null;

const editor = document.querySelector("#json-editor");
const inputs = {
  whatsapp: document.querySelector("#whatsapp"),
  instagram: document.querySelector("#instagram"),
  message: document.querySelector("#message"),
  productsCsvUrl: document.querySelector("#products-csv-url"),
  categoriesCsvUrl: document.querySelector("#categories-csv-url"),
  combosCsvUrl: document.querySelector("#combos-csv-url"),
  bg: document.querySelector("#color-bg"),
  green: document.querySelector("#color-green"),
  lime: document.querySelector("#color-lime"),
  violet: document.querySelector("#color-violet"),
  pink: document.querySelector("#color-pink"),
};

async function loadData() {
  const response = await fetch("data/site.json", { cache: "no-store" });
  data = await response.json();
  syncForm();
  syncEditor();
}

function syncForm() {
  inputs.whatsapp.value = data.contact.whatsapp;
  inputs.instagram.value = data.contact.instagram;
  inputs.message.value = data.contact.message;
  data.onlineData = data.onlineData || {};
  inputs.productsCsvUrl.value = data.onlineData.productsCsvUrl || "";
  inputs.categoriesCsvUrl.value = data.onlineData.categoriesCsvUrl || "";
  inputs.combosCsvUrl.value = data.onlineData.combosCsvUrl || "";
  inputs.bg.value = data.theme.bg;
  inputs.green.value = data.theme.green;
  inputs.lime.value = data.theme.lime;
  inputs.violet.value = data.theme.violet;
  inputs.pink.value = data.theme.pink;
}

function syncEditor() {
  editor.value = JSON.stringify(data, null, 2);
}

function updateFromForm() {
  data.contact.whatsapp = inputs.whatsapp.value;
  data.contact.instagram = inputs.instagram.value;
  data.contact.message = inputs.message.value;
  data.onlineData = data.onlineData || {};
  data.onlineData.productsCsvUrl = inputs.productsCsvUrl.value;
  data.onlineData.categoriesCsvUrl = inputs.categoriesCsvUrl.value;
  data.onlineData.combosCsvUrl = inputs.combosCsvUrl.value;
  data.theme.bg = inputs.bg.value;
  data.theme.green = inputs.green.value;
  data.theme.lime = inputs.lime.value;
  data.theme.violet = inputs.violet.value;
  data.theme.pink = inputs.pink.value;
  syncEditor();
}

function updateFromEditor() {
  try {
    data = JSON.parse(editor.value);
    syncForm();
  } catch (error) {
    return;
  }
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "site.json";
  link.click();
  URL.revokeObjectURL(url);
}

async function copyJson() {
  await navigator.clipboard.writeText(JSON.stringify(data, null, 2));
}

Object.values(inputs).forEach((input) => input.addEventListener("input", updateFromForm));
editor.addEventListener("input", updateFromEditor);
document.querySelector("#download-json").addEventListener("click", downloadJson);
document.querySelector("#copy-json").addEventListener("click", copyJson);
document.querySelector("#reset-json").addEventListener("click", loadData);

loadData();
