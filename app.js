const express = require("express");
const cookieParser = require("cookie-parser");
const cors = require("cors");
const http = require('http');
const socketIo = require('socket.io');

    

const app = express();

const server = http.createServer(app);
const io = socketIo(server, {
    cors: {
        origin: "http://localhost:3000", // Your frontend URL
        methods: ["GET", "POST"],
        credentials: true
    }
});

app.use(cors());

app.use(cookieParser());
app.use(express.json());

const user = require("./routes/userRoute");
const post = require("./routes/postRoute");
const bookingRoutes = require('./routes/bookingRoute');
const reviewRoutes = require('./routes/reviewRoutes');

///Chat
const chatRoutes = require('./routes/chatRoutes');
const setupSocket = require('./socket/socket');

// Routes
app.use('/api/chat', chatRoutes);
// Setup Socket
setupSocket(io);

app.use("/api/users", user);
app.use("/api/posts", post);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);



module.exports = app;
