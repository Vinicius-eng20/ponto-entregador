/**
 * Wrapper simples em torno de fetch(), que:
 * - envia o token CSRF automaticamente em métodos que alteram dados;
 * - já define Content-Type: application/json quando há corpo;
 * - lança um erro com a mensagem vinda da API quando a resposta não é ok.
 */
async function apiFetch(url, options = {}) {
  const csrfToken = document
    .querySelector('meta[name="csrf-token"]')
    .getAttribute("content");

  const headers = {
    "X-CSRFToken": csrfToken,
    ...(options.headers || {}),
  };

  if (options.body && !(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, { ...options, headers });

  if (response.status === 204) {
    return null;
  }

  let data = null;
  try {
    data = await response.json();
  } catch (err) {
    data = null;
  }

  if (!response.ok) {
    const message = (data && data.message) || "Ocorreu um erro inesperado.";
    throw new Error(message);
  }

  return data;
}
