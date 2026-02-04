const express = require("express");
const cookieParser = require("cookie-parser");
const app = express();
app.use(cookieParser());


app.use(express.json());

const user = require("./routes/userRoute");
app.use("/api/users", user);

module.exports = app;
