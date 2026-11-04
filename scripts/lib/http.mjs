// Shared HTTP client for the zero-dependency scripts (smoke, session integrity).
// Each client keeps its own cookie jar, so one script can drive several signed-in users side by side.

// `baseUrl` is also sent as Origin: Astro's CSRF check rejects form posts without a matching one.
export function createHttpClient(baseUrl) {
  const jar = new Map();

  function cookieHeader() {
    return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  }

  function storeCookies(response) {
    for (const raw of response.headers.getSetCookie()) {
      const [pair, ...attrs] = raw.split(";");
      const [name, ...rest] = pair.split("=");
      const expired = attrs.some((a) => /max-age=0/i.test(a.trim()));
      if (expired) jar.delete(name.trim());
      else jar.set(name.trim(), rest.join("="));
    }
  }

  // `form` sends a urlencoded body, `json` a JSON body; a JSON response is returned parsed as `body`, any other as `text`.
  async function request(path, { method = "GET", form, json } = {}) {
    const contentType = form
      ? "application/x-www-form-urlencoded"
      : json !== undefined
        ? "application/json"
        : undefined;
    const response = await fetch(baseUrl + path, {
      method,
      redirect: "manual",
      headers: {
        Cookie: cookieHeader(),
        Origin: baseUrl,
        ...(contentType ? { "Content-Type": contentType } : {}),
      },
      body: form ? new URLSearchParams(form).toString() : json !== undefined ? JSON.stringify(json) : undefined,
    });
    storeCookies(response);
    const isJson = (response.headers.get("content-type") ?? "").includes("application/json");
    const body = isJson ? await response.json().catch(() => null) : null;
    const text = isJson ? "" : await response.text().catch(() => "");
    return { status: response.status, location: response.headers.get("location") ?? "", body, text };
  }

  return { request };
}
