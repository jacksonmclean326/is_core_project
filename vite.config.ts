import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [
    {
      name: "clean-page-routes",
      configureServer(server) {
        const routes = new Set([
          "auth",
          "home",
          "details",
          "chat",
          "leaderboard",
          "settings"
        ]);

        server.middlewares.use((request, response, next) => {
          const requestUrl = request.url || "/";
          const pathname = new URL(requestUrl, "http://localhost").pathname;
          if (pathname === "/") {
            response.writeHead(302, { Location: "/home" });
            response.end();
            return;
          }

          const route = pathname.slice(1);
          if (!routes.has(route)) {
            next();
            return;
          }
          if (request.method !== "GET" && request.method !== "HEAD") {
            response.writeHead(405);
            response.end("Method not allowed.");
            return;
          }

          const query = requestUrl.includes("?")
            ? requestUrl.slice(requestUrl.indexOf("?"))
            : "";
          request.url = `/src/app/pages/${route}/${route}.html${query}`;
          next();
        });
      }
    }
  ],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000"
      }
    },
  },
  build: {
    rollupOptions: {
      input: {
        ...Object.fromEntries(
          ["auth", "home", "details", "chat", "leaderboard", "settings"].map((page) => [
            page,
            resolve(process.cwd(), `src/app/pages/${page}/${page}.html`)
          ])
        )
      }
    }
  }
});
