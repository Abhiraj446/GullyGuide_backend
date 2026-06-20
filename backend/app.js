const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");

const app = express();

app.use(cors());

app.use(cookieParser());
app.use(express.json({
  verify: (req, res, buf) => {
    if (req.originalUrl === '/api/payments/webhook') {
      req.rawBody = buf.toString('utf8');
    }
  }
}));

const user = require("./routes/userRoute");
const post = require("./routes/postRoute");
const bookingRoutes = require('./routes/bookingRoute');
const reviewRoutes = require('./routes/reviewRoutes');
const notificationRoutes = require('./routes/notificationRoute');
const assetRoutes = require('./routes/assetRoutes');
const customPackageRoutes = require('./routes/customPackageRoutes');
const packageTemplateRoutes = require('./routes/packageTemplateRoutes');
const finalBillRoutes = require('./routes/finalBillRoutes');
const adminRoutes = require('./routes/adminRoutes');

///Chat
const chatRoutes = require('./routes/chatRoutes');
// itineraryRoute
const itineraryRoutes = require('./routes/itineraryRoutes')
const paymentRoutes = require('./routes/paymentRoutes');

// Routes
app.use('/api/chat', chatRoutes);

app.use("/api/users", user);
app.use("/api/posts", post);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/itinerary', itineraryRoutes);
app.use('/api/assets',assetRoutes)
app.use('/api/custom-package', customPackageRoutes);
app.use('/api/templates', packageTemplateRoutes);
app.use('/api/final-bills', finalBillRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/admin', adminRoutes);

// Root health check route
app.get('/', (req, res) => {
	res.status(200).send('Backend Working Successfully');
});



module.exports = app;
