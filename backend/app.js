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
const notificationRoutes = require('./routes/notificationRoute');

///Chat
const chatRoutes = require('./routes/chatRoutes');
// itineraryRoute
const itineraryRoutes = require('./routes/itineraryRoutes')

// Routes
app.use('/api/chat', chatRoutes);

app.use("/api/users", user);
app.use("/api/posts", post);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);

app.use('/api/itinerary', itineraryRoutes);

// Root health check route
app.get('/', (req, res) => {
	res.status(200).send('Backend Working Successfully');
});



module.exports = app;
