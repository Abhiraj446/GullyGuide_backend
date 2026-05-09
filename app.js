const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
    

const app = express();

app.use(cors());

app.use(cookieParser());
app.use(express.json());

const user = require("./routes/userRoute");
const post = require("./routes/postRoute");
const bookingRoutes = require('./routes/bookingRoute');
const reviewRoutes = require('./routes/reviewRoutes');

app.use("/api/users", user);
app.use("/api/posts", post);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);

module.exports = app;
