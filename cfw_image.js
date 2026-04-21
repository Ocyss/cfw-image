export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        if (url.pathname.startsWith("/get/")) {
            const key = url.pathname.replace("/get/", "");
            const record = await env.DB.prepare("SELECT * FROM images WHERE key = ?").bind(key).first();
            const object = await env.R2.get(key);

            if (object) {
                return new Response(object.body, {
                    headers: { "Content-Type": object.httpMetadata?.contentType || "image/jpeg" }
                });
            }

            if (record?.original_url) {
                return Response.redirect(record.original_url, 302);
            }
            return new Response("Not Found", { status: 404 });
        }
        const authHeader = request.headers.get("Authorization");
        if (authHeader !== env.AUTH_SECRET) {
            return new Response("Unauthorized", { status: 401 });
        }
        if (request.method === "POST") {
            try {
                const { targetUrl, tag = "default" } = await request.json();
                const now = new Date();
                const year = now.getFullYear();
                const month = String(now.getMonth() + 1).padStart(2, "0");
                const day = String(now.getDate()).padStart(2, "0");
                const key = `${tag}/${year}/${month}/${day}/${crypto.randomUUID()}.jpg`;
                await env.DB.prepare("INSERT INTO images (key, original_url, status) VALUES (?, ?, 'pending')")
                    .bind(key, targetUrl).run();

                ctx.waitUntil(this.handleDownload(key, targetUrl, env));

                return new Response(JSON.stringify({
                    key,
                    cdnUrl: `${url.origin}/get/${key}`
                }), {
                    headers: { "Content-Type": "application/json" }
                });
            } catch (e) {
                return new Response("Invalid Request", { status: 400 });
            }
        }

        return new Response("Method Not Allowed", { status: 405 });
    },

    async handleDownload(key, targetUrl, env) {
        try {
            const resp = await fetch(targetUrl, {
                headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
            });
            if (!resp.ok) throw new Error();
            await env.R2.put(key, resp.body, {
                httpMetadata: { contentType: resp.headers.get("Content-Type") || "image/jpeg" }
            });
            await env.DB.prepare("UPDATE images SET status = 'success' WHERE key = ?").bind(key).run();
        } catch (e) {
            await env.DB.prepare("UPDATE images SET status = 'failed' WHERE key = ?").bind(key).run();
        }
    }
};
