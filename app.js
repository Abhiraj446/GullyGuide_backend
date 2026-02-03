const express = require("express");
const app = express();
app.use(express.json())

const user=require("./routes/userRoute")
app.use("/api/users",user);

module.exports = app;

