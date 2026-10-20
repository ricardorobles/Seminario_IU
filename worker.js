
const ALLOWED_ORIGIN = "https://ricardorobles.github.io";
const MAX_BYTES = 9 * 1024 * 1024;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    const corsHeaders = {
      "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Submission-Key",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin"
    };

    function json(data, status = 200) {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        }
      });
    }

    // Responder al preflight antes de procesar la entrega.
    if (request.method === "OPTIONS") {
      if (origin && origin !== ALLOWED_ORIGIN) {
        return json({ ok: false, error: "Origen no autorizado" }, 403);
      }

      return new Response(null, {
        status: 204,
        headers: corsHeaders
      });
    }

    if (origin && origin !== ALLOWED_ORIGIN) {
      return json({ ok: false, error: "Origen no autorizado" }, 403);
    }

    if (url.pathname === "/" && request.method === "GET") {
      return json({
        ok: true,
        service: "seminario-iu",
        version: "cors-fix-1",
        endpoint: "/entregas"
      });
    }

    if (url.pathname === "/entregas" && request.method === "GET") {
      return json({
        ok: true,
        service: "seminario-iu",
        status: "Endpoint disponible",
        method: "POST"
      });
    }

    if (url.pathname !== "/entregas") {
      return json({ ok: false, error: "Ruta inexistente" }, 404);
    }

    if (request.method !== "POST") {
      return json({ ok: false, error: "Método no permitido" }, 405);
    }

    if (!env.APPS_SCRIPT_URL || !env.APPS_SCRIPT_TOKEN) {
      return json({
        ok: false,
        error: "Faltan los secretos de Apps Script"
      }, 503);
    }

    if (
      env.SUBMISSION_KEY &&
      request.headers.get("X-Submission-Key") !== env.SUBMISSION_KEY
    ) {
      return json({
        ok: false,
        error: "Clave de entrega incorrecta"
      }, 401);
    }

    const contentLength = Number(
      request.headers.get("Content-Length") || 0
    );

    if (contentLength > MAX_BYTES) {
      return json({
        ok: false,
        error: "La entrega supera el tamaño máximo"
      }, 413);
    }

    let raw;
    let data;

    try {
      raw = await request.text();

      if (new TextEncoder().encode(raw).byteLength > MAX_BYTES) {
        return json({
          ok: false,
          error: "La entrega supera el tamaño máximo"
        }, 413);
      }

      data = JSON.parse(raw);
    } catch (error) {
      return json({
        ok: false,
        error: "No se pudo leer el JSON"
      }, 400);
    }

    if (
      !/^[A-Za-z0-9_-]{12,80}$/.test(String(data.id || ""))
    ) {
      return json({ ok: false, error: "ID inválido" }, 400);
    }

    if (
      typeof data.html !== "string" ||
      !/^<!doctype html>/i.test(data.html.trim())
    ) {
      return json({ ok: false, error: "HTML inválido" }, 400);
    }

    if (
      !/^[A-Za-z0-9_.-]{1,230}\.pdf$/i.test(
        String(data.filename || "")
      )
    ) {
      return json({ ok: false, error: "Nombre inválido" }, 400);
    }

    try {
      const response = await fetch(env.APPS_SCRIPT_URL, {
        method: "POST",
        redirect: "follow",
        headers: {
          "Content-Type": "text/plain;charset=UTF-8"
        },
        body: JSON.stringify({
          ...data,
          token: env.APPS_SCRIPT_TOKEN
        })
      });

      const text = await response.text();

      let result;

      try {
        result = JSON.parse(text);
      } catch {
        return json({
          ok: false,
          error: "Apps Script no devolvió JSON válido"
        }, 502);
      }

      return json(
        result,
        response.ok && result.ok ? 200 : 502
      );

    } catch (error) {
      return json({
        ok: false,
        error: "Error de comunicación con Apps Script: " +
          String(error.message || error)
      }, 502);
    }
  }
};
