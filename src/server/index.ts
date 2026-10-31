import { config } from "./config.js";
import { createHttpServer } from "./router.js";

const server = createHttpServer();

server.listen(config.port, "0.0.0.0", () => {
  console.log(`Money Man backend listening on port ${config.port}.`);
});
