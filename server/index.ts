import { createServer } from "http";
import { app } from "./app.js";

const port = Number(process.env.PORT || 3000);
const server = createServer(app);

server.listen(port, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${port}/`);
});
