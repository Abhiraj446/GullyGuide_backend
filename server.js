const app = require("./app");
const path = require('path');
const dotenv = require("dotenv");
const connectDatabase = require("./config/database");

// Handle uncaught exceptions (sync errors)
process.on("uncaughtException", (err) => {
  console.log(`Error: ${err.message}`);
  console.log("Shutting down the server due to uncaught exception");
  process.exit(1);
});

// Config - load .env relative to this file so starting the process from different folders still works
dotenv.config({ path: path.join(__dirname, 'config', 'config.env') });

// Connect Database
connectDatabase();

// Start Server
const server = app.listen(process.env.PORT, () => {
  console.log(`Server is working on http://localhost:${process.env.PORT}`);
});

// Handle unhandled promise rejections (async errors)
process.on("unhandledRejection", (err) => {
  console.log(`Error: ${err.message}`);
  console.log("Shutting down the server due to unhandled promise rejection");

  server.close(() => {
    process.exit(1);
  });
});
