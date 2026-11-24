// Keep password visibility local to each field and preserve native validation.
document.querySelectorAll('.auth-form input[type="password"]').forEach((input) => {
  const wrap = document.createElement('span');
  wrap.className = 'password-field';
  input.before(wrap);
  wrap.append(input);
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'password-toggle';
  toggle.textContent = 'Mostrar';
  toggle.setAttribute('aria-label', 'Mostrar contraseña');
  toggle.setAttribute('aria-pressed', 'false');
  toggle.addEventListener('click', () => {
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    toggle.textContent = visible ? 'Ocultar' : 'Mostrar';
    toggle.setAttribute('aria-label', visible ? 'Ocultar contraseña' : 'Mostrar contraseña');
    toggle.setAttribute('aria-pressed', String(visible));
  });
  wrap.append(toggle);
});

document.querySelectorAll('.auth-tab').forEach((tab) => {
  tab.setAttribute('aria-pressed', String(tab.classList.contains('is-active')));
  tab.addEventListener('click', () => {
    const registering = tab.dataset.tab === 'register';
    document.querySelector('#account-entry-title').textContent = registering ? 'Hacete tu lugar.' : 'Volvé a tu Canopia.';
    document.querySelector('#account-entry-description').textContent = registering ? 'Tus favoritos y pedidos, siempre a mano.' : 'Ingresá y seguí donde lo dejaste.';
    document.querySelectorAll('.auth-tab').forEach((other) => {
      other.setAttribute('aria-pressed', String(other === tab));
    });
  });
});

// Show errors beside their field, while the browser keeps ownership of validation.
document.querySelectorAll('.auth-form input, .checkout-form input').forEach((input, index) => {
  const label = input.closest('label');
  if (!label) return;
  const error = document.createElement('small');
  error.className = 'field-error';
  error.id = `shop-field-error-${index}`;
  error.hidden = true;
  label.append(error);
  const previousDescription = input.getAttribute('aria-describedby') || '';
  input.setAttribute('aria-describedby', `${previousDescription} ${error.id}`.trim());
  function validate() {
    const invalid = !input.validity.valid;
    input.setAttribute('aria-invalid', String(invalid));
    error.hidden = !invalid;
    error.textContent = input.validity.valueMissing ? 'Completá este campo para continuar.'
      : input.validity.typeMismatch ? 'Revisá el email, por ejemplo nombre@email.com.'
      : input.validity.tooShort ? `Usá al menos ${input.minLength} caracteres.`
      : input.validationMessage;
  }
  input.addEventListener('blur', () => { if (input.value) validate(); });
  input.addEventListener('invalid', validate);
  input.addEventListener('input', () => { if (input.hasAttribute('aria-invalid')) validate(); });
});

const registrationPassword = document.querySelector('#register-form-user input[name="password"]');
if (registrationPassword) {
  const guidance = document.createElement('small');
  guidance.className = 'password-guidance';
  guidance.textContent = 'Usá al menos 6 caracteres.';
  registrationPassword.closest('label').append(guidance);
  registrationPassword.addEventListener('input', () => {
    const ready = registrationPassword.value.length >= 6;
    guidance.classList.toggle('is-ready', ready);
    guidance.textContent = ready ? 'Tu contraseña cumple el mínimo de caracteres.' : 'Usá al menos 6 caracteres.';
  });
}

// Animate confirmed cart updates rather than the click that may fail.
const cartCount = document.querySelector('#cart-count');
if (cartCount) {
  new MutationObserver(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    cartCount.getAnimations().forEach((animation) => animation.cancel());
    cartCount.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(1.3)', offset: .4 },
      { transform: 'scale(1)' },
    ], { duration: 320, easing: 'cubic-bezier(.16,1,.3,1)' });
  }).observe(cartCount, { childList: true, characterData: true, subtree: true });
}
