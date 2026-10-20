
/**
 * SEMINARIO IU - CLOUDFLARE WORKER V37
 *
 * Recibe entregas JSON desde GitHub Pages
 * y las envía a Google Apps Script.
 *
 * Endpoint:
 * https://seminario-iu.rrobles-c2d.workers.dev/entregas
 *
 * Secrets requeridos en Cloudflare:
 * APPS_SCRIPT_URL
 * APPS_SCRIPT_TOKEN
 */

const ORIGIN = "https://ricardorobles.github.io";
const MAX_BYTES = 9 * 1024 * 1024;

export default {
  async fetch(request, env) {

    const headers = {
      "Access-Control-Allow-Origin": ORIGIN,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
      "Cache-Control": "no-store"
    };

    const reply = (obj, status = 200) =>
      new Response(JSON.stringify(obj), {
        status,
        headers: {
          ...headers,
          "Content-Type": "application/json; charset=utf-8"
        }
      });

    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    // Comprobar origen autorizado
    if (origin && origin !== ORIGIN) {
      return reply({
        ok: false,
        error: "Origen no autorizado"
      }, 403);
    }

    // Resolver CORS antes del POST
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers
      });
    }

    // Verificar funcionamiento del Worker
    if (url.pathname === "/" && request.method === "GET") {
      return reply({
        ok: true,
        service: "seminario-iu",
        version: "v37-json",
        endpoint: "/entregas"
      });
    }

    // Comprobar ruta
    if (url.pathname !== "/entregas") {
      return reply({
        ok: false,
        error: "Ruta inexistente"
      }, 404);
    }

    if (request.method !== "POST") {
      return reply({
        ok: false,
        error: "Usá POST"
      }, 405);
    }

    // Verificar configuración de Apps Script
    if (!env.APPS_SCRIPT_URL || !env.APPS_SCRIPT_TOKEN) {
      return reply({
        ok: false,
        error: "Faltan los secretos de Apps Script"
      }, 503);
    }

    // Comprobar tamaño del archivo
    const length = Number(
      request.headers.get("Content-Length") || 0
    );

    if (length > MAX_BYTES) {
      return reply({
        ok: false,
        error: "Archivo demasiado grande"
      }, 413);
    }

    let body;

    try {
      const raw = await request.text();

      if (
        new TextEncoder().encode(raw).byteLength > MAX_BYTES
      ) {
        return reply({
          ok: false,
          error: "Archivo demasiado grande"
        }, 413);
      }

      body = JSON.parse(raw);

    } catch {
      return reply({
        ok: false,
        error: "JSON inválido"
      }, 400);
    }

    // Validar identificador único
    if (
      !/^[A-Za-z0-9_-]{12,80}$/.test(
        String(body.id || "")
      )
    ) {
      return reply({
        ok: false,
        error: "ID inválido"
      }, 400);
    }

    // Validar nombre de archivo JSON
    if (
      !/^[A-Za-z0-9_.-]{1,230}\.json$/i.test(
        String(body.filename || "")
      )
    ) {
      return reply({
        ok: false,
        error: "Nombre de archivo inválido"
      }, 400);
    }

    // Validar estructura del borrador
    if (
      !body.draft ||
      typeof body.draft !== "object" ||
      Array.isArray(body.draft) ||
      !body.draft.fields ||
      !Array.isArray(body.draft.images)
    ) {
      return reply({
        ok: false,
        error: "Borrador incompleto"
      }, 400);
    }

    // Comprobar coherencia de metadatos
    if (
      body.draft.exportId !== body.id ||
      body.draft.fileName !== body.filename
    ) {
      return reply({
        ok: false,
        error: "Metadatos inconsistentes"
      }, 400);
    }

    // Enviar JSON a Google Apps Script
    try {
      const response = await fetch(
        env.APPS_SCRIPT_URL,
        {
          method: "POST",
          redirect: "follow",
          headers: {
            "Content-Type": "text/plain;charset=UTF-8"
          },
          body: JSON.stringify({
            ...body,
            token: env.APPS_SCRIPT_TOKEN
          })
        }
      );

      const raw = await response.text();

      let result;

      try {
        result = JSON.parse(raw);
      } catch {
        return reply({
          ok: false,
          error: "Apps Script no devolvió JSON válido"
        }, 502);
      }

      return reply(
        result,
        response.ok && result.ok ? 200 : 502
      );

    } catch (error) {
      return reply({
        ok: false,
        error: "Error al contactar Apps Script: " +
          String(error.message || error)
      }, 502);
    }
  }
};
