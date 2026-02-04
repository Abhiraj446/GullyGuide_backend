const app = require("./app");
const path = require("path");
const dotenv = require("dotenv");
const connectDatabase = require("./config/database");

// handle uncaught errors
process.on("uncaughtException", (err) => {
  console.log(err.message);
  process.exit(1);
});

// load env
dotenv.config({ path: path.join(__dirname, "config", "config.env") });

// connect DB
connectDatabase();

// start server
const server = app.listen(process.env.PORT, () => {
  console.log(`Server running on http://localhost:${process.env.PORT}`);
});

// handle promise errors
process.on("unhandledRejection", (err) => {
  console.log(err.message);
  server.close(() => process.exit(1));
});
