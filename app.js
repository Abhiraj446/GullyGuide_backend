const express = require("express");
const cookieParser = require("cookie-parser");
const app = express();
app.use(cookieParser());


app.use(express.json());

const user = require("./routes/userRoute");
const post = require("./routes/postRoute")
app.use("/api/users", user);
app.use("/api/posts", post);

module.exports = app;
