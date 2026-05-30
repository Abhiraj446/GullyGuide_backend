const path = require("path");
const dotenv = require("dotenv");
const http = require("http");

// Load env FIRST - before any other requires
dotenv.config({ path: path.join(__dirname, "config", "config.env") });

// Now require other modules
const app = require("./app");
const connectDatabase = require("./config/database");
const { setupSocket } = require("./socket/socket");

// handle uncaught errors
process.on("uncaughtException", (err) => {
  console.log('Uncaught Exception:', err.message);
  process.exit(1);
});

// connect DB
connectDatabase();

// start server
const server = http.createServer(app);
setupSocket(server);

server.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});

// handle promise errors
process.on("unhandledRejection", (err) => {
  console.log('Unhandled Rejection:', err.message);
  server.close(() => process.exit(1));
});
