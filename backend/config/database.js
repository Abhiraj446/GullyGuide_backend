const mongoose = require("mongoose");

const connectDatabase = async () => {
  try {
    const options = {};
    if (process.env.DB_NAME) options.dbName = process.env.DB_NAME;

    const data = await mongoose.connect(process.env.DB_URL, options);

    // Log database name and host for confirmation
    console.log(`MongoDB connected successfully: db=${data.connection.name} host=${data.connection.host}`);
  } catch (error) {
    console.error("MongoDB connection failed ❌", error.message);
    // In serverless environments do not exit the process.
    // Rethrow the error so callers can handle it and the function can return a 5xx.
    throw error;
  }
};

module.exports = connectDatabase;
