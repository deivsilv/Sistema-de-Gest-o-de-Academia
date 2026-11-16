import { createApp, loadStore } from "./app.ts";
const app = createApp(loadStore());
app.listen(3001, "127.0.0.1", () =>
  console.log("API Pulso disponível em http://127.0.0.1:3001"),
);
