const productsGrid = document.getElementById("productsGrid");
const cartCount = document.getElementById("cartCount");
const categorySelect = document.getElementById("categorySelect");
const filterBtn = document.getElementById("filterBtn");
const accountLink = document.getElementById("accountLink");
const heroTrack = document.getElementById("heroCarouselTrack");
const heroPrevBtn = document.getElementById("heroPrevBtn");
const heroNextBtn = document.getElementById("heroNextBtn");
const heroDots = document.getElementById("heroDots");

function renderLoadError(error) {
  const message = String(error?.message || "Falha ao carregar o catalogo.");
  if (productsGrid) {
    productsGrid.innerHTML = `<div class="message error">${message}</div>`;
  }
}

function updateAccountLink() {
  const profile = API.getCustomerProfile();
  const token = API.getCustomerToken();
  if (profile && token && accountLink) {
    accountLink.textContent = `Conta (${profile.name.split(" ")[0]})`;
    return;
  }

  if (accountLink) {
    accountLink.textContent = "Entrar";
  }
}

function updateCartCount() {
  const items = API.getLocalCart();
  const count = items.reduce((acc, item) => acc + item.quantity, 0);
  if (cartCount) cartCount.textContent = count;
}

async function syncCartWithBackend() {
  // Mantem o carrinho persistido no SQLite sem perder a agilidade do LocalStorage.
  const clientId = API.getClientId();
  const items = API.getLocalCart();
  await API.request(`/api/cart/${clientId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items })
  });
}

async function loadCategories() {
  if (!categorySelect) return;
  const categories = await API.request("/api/categories");
  categorySelect.innerHTML = '<option value="">Todas categorias</option>';
  categories.forEach((category) => {
    const option = document.createElement("option");
    option.value = category.id;
    option.textContent = category.name;
    categorySelect.appendChild(option);
  });
}

function getFilters() {
  return {
    search: document.getElementById("searchInput")?.value.trim() || "",
    category: categorySelect?.value || "",
    minPrice: document.getElementById("minPriceInput")?.value || "",
    maxPrice: document.getElementById("maxPriceInput")?.value || ""
  };
}

async function loadProducts() {
  if (!productsGrid) return;
  const params = new URLSearchParams(getFilters());
  const products = await API.request(`/api/products?${params.toString()}`);
  productsGrid.innerHTML = "";

  products.forEach((product) => {
    const card = document.createElement("article");
    card.className = "card";
    card.innerHTML = `
      <img src="${API.resolveAssetUrl(product.image_url)}" alt="${product.name}" />
      <div class="card-body">
        <h3>${product.name}</h3>
        <span class="category">${product.category_name || "Sem categoria"}</span>
        <p>${product.description || ""}</p>
        <strong class="price">${API.formatCurrency(product.price)}</strong>
        <button class="accent" data-product-id="${product.id}">Comprar</button>
      </div>
    `;
    productsGrid.appendChild(card);
  });
}

function setupHeroCarousel() {
  if (!heroTrack || !heroDots) return;

  const slides = Array.from(heroTrack.querySelectorAll(".hero-slide"));
  if (slides.length === 0) return;

  let activeIndex = slides.findIndex((slide) => slide.classList.contains("is-active"));
  if (activeIndex < 0) activeIndex = 0;

  const dots = slides.map((_, index) => {
    const dot = document.createElement("button");
    dot.className = "hero-dot";
    dot.type = "button";
    dot.setAttribute("aria-label", `Ir para slide ${index + 1}`);
    dot.addEventListener("click", () => goTo(index));
    heroDots.appendChild(dot);
    return dot;
  });

  function render() {
    slides.forEach((slide, index) => {
      slide.classList.toggle("is-active", index === activeIndex);
    });
    dots.forEach((dot, index) => {
      dot.classList.toggle("is-active", index === activeIndex);
    });
  }

  function goTo(index) {
    activeIndex = (index + slides.length) % slides.length;
    render();
  }

  function next() {
    goTo(activeIndex + 1);
  }

  heroPrevBtn?.addEventListener("click", () => goTo(activeIndex - 1));
  heroNextBtn?.addEventListener("click", next);

  let intervalId = setInterval(next, 5000);
  heroTrack.addEventListener("mouseenter", () => clearInterval(intervalId));
  heroTrack.addEventListener("mouseleave", () => {
    intervalId = setInterval(next, 5000);
  });

  render();
}

function addToCart(productId) {
  const items = API.getLocalCart();
  const existing = items.find((item) => item.product_id === productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    items.push({ product_id: productId, quantity: 1 });
  }
  API.saveLocalCart(items);
  updateCartCount();
  syncCartWithBackend().catch(() => null);
}

document.addEventListener("click", (event) => {
  if (event.target.matches("[data-product-id]")) {
    const productId = Number(event.target.getAttribute("data-product-id"));
    addToCart(productId);
  }
});

filterBtn?.addEventListener("click", loadProducts);
document.getElementById("searchInput")?.addEventListener("keyup", (event) => {
  if (event.key === "Enter") loadProducts();
});

(async function bootstrap() {
  updateCartCount();
  updateAccountLink();
  setupHeroCarousel();
  await loadCategories();
  await loadProducts();
  await syncCartWithBackend();
})().catch(renderLoadError);
