require('dotenv').config({
  path: './config/config.env'
});

const crypto = require('crypto');

const orderId = 'order_T3ob5Zm6vHyfkY';
const paymentId = 'pay_1781943885810';

const secret = process.env.RAZORPAY_KEY_SECRET;

console.log('Secret loaded:', !!secret);

const signature = crypto
  .createHmac('sha256', secret)
  .update(`${orderId}|${paymentId}`)
  .digest('hex');

console.log({
  orderId,
  paymentId,
  signature
});