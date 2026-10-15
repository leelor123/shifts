/* ============================================================
 * pay-config.js — public settings of the payments (no secrets here: a
 * checkout link, a product number and a price are public by nature).
 *
 * Inside the Android app from Google Play, Shaati Plus is sold only through
 * Google Play (its product id is in plus.js). On the web and on iPhone it is
 * sold through Lemon Squeezy: card, Apple Pay, Google Pay and PayPal, with VAT
 * handled by them. Empty values = that way of buying is off and out of sight.
 * ============================================================ */
window.PAY_CONFIG = {
  lemon: {
    checkout: '', // the product's "Share" link, e.g. https://<store>.lemonsqueezy.com/buy/<id>
    productId: 0, // the product's number (Products › the product › ID): every purchase code is checked against it
    price: '', // as shown on the button, e.g. '₪9.90'
  },
  price: 9.9, // the price in shekels: the income estimate in the admin dashboard, and "≈ N minutes of your work"
};
